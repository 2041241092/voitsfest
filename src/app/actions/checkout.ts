"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  PricingEvent,
  DEFAULT_PRICING_TIERS,
  SubEventTierConfig,
  PRICING_EVENT_NAMES,
} from "@/lib/pricing";
import { getEventTimeStatus, parseWibDate } from "@/lib/timeUtils";
import { Promo } from "@/types/database";
import { isRegularRegistration } from "@/lib/quota";

export interface CheckoutResult {
  success?: boolean;
  transactionId?: string;
  error?: string;
}

export interface ServerPreCheckoutGuardResult {
  valid: boolean;
  error?: string;
  guardTriggered?:
    | "phase_date_not_started"
    | "phase_date_ended"
    | "phase_quota_full"
    | "event_capacity_full"
    | "promo_invalid"
    | "promo_expired"
    | "promo_quota_full";
  remainingPhaseQuota?: number | null;
  remainingEventQuota?: number | null;
  remainingPromoQuota?: number | null;
}

/**
 * Normalizes status string to lowercase.
 */
function normalizeStatus(status: unknown): string {
  if (typeof status !== "string") return "pending";
  return status.trim().toLowerCase();
}

/**
 * Validates whether a registration record belongs to the active phase.
 */
function isRecordInPhase(
  record: { ticket_phase?: string | null; created_at?: string | null },
  phase: string,
  startDate?: string | null,
  endDate?: string | null
): boolean {
  if (record.ticket_phase) {
    const cleanRecordPhase = record.ticket_phase.replace(/\[PROMO:.*?\]/, "").trim().toLowerCase();
    const cleanTargetPhase = phase.trim().toLowerCase();
    if (cleanRecordPhase && (cleanRecordPhase.includes(cleanTargetPhase) || cleanTargetPhase.includes(cleanRecordPhase))) {
      return true;
    }
  }

  if (startDate && record.created_at) {
    const startObj = parseWibDate(startDate);
    const endObj = endDate ? parseWibDate(endDate) : null;
    const recObj = parseWibDate(record.created_at);
    if (startObj && recObj) {
      if (recObj.getTime() < startObj.getTime()) return false;
      if (endObj && recObj.getTime() > endObj.getTime()) return false;
      return true;
    }
  }

  if (!startDate && (!record.ticket_phase || record.ticket_phase.trim() === "")) {
    return true;
  }

  return false;
}

/**
 * Server-Side Pre-Checkout Availability Guard.
 * Re-validates date windows, phase quotas, overall sub-event capacity, and promo availability
 * directly against the database on the server to prevent stale state or client tampering.
 */
export async function validatePreCheckoutGuard(
  eventKey: PricingEvent,
  requestedQuantity: number = 1,
  promoId?: string | null
): Promise<ServerPreCheckoutGuardResult> {
  const supabase = await createClient();

  try {
    // 0. Check gateway open switch from cms_settings
    const gatewayEventKeyMap: Record<PricingEvent, string> = {
      colorfun: "cfr",
      festival: "festival",
      seminar: "seminar",
      bcc: "bcc",
      bpc: "bpc",
      tenant: "tenant",
    };
    const gwKey = gatewayEventKeyMap[eventKey];
    const { data: gwData } = await supabase
      .from("cms_settings")
      .select("value")
      .eq("key", "gateways")
      .maybeSingle();

    if (gwData?.value && typeof gwData.value === "object") {
      const val = gwData.value as Record<string, unknown>;
      if (val[gwKey] === false) {
        return {
          valid: false,
          error: "Pendaftaran untuk sub-event ini sedang ditutup oleh Admin.",
          guardTriggered: "phase_date_ended",
        };
      }
    }

    // 1. Fetch live CMS pricing tiers
    const { data: cmsData } = await supabase
      .from("cms_settings")
      .select("value")
      .eq("key", "pricing_tiers")
      .maybeSingle();

    const pricingTiers: Record<PricingEvent, SubEventTierConfig> =
      cmsData?.value && typeof cmsData.value === "object"
        ? { ...DEFAULT_PRICING_TIERS, ...cmsData.value }
        : DEFAULT_PRICING_TIERS;

    const tierConfig: SubEventTierConfig =
      pricingTiers[eventKey] || DEFAULT_PRICING_TIERS[eventKey];

    // 2. Strict Date Window Guard (literal WIB)
    const { isStarted: isPhaseStarted, isEnded: isPhaseEnded } = getEventTimeStatus(
      tierConfig.start_date,
      tierConfig.end_date
    );

    if (!isPhaseStarted) {
      return {
        valid: false,
        error: "Periode Belum Dimulai. Pendaftaran fase ini belum dibuka.",
        guardTriggered: "phase_date_not_started",
      };
    }

    if (isPhaseEnded) {
      return {
        valid: false,
        error: "Periode Berakhir. Periode pendaftaran fase ini telah berakhir.",
        guardTriggered: "phase_date_ended",
      };
    }

    // 3. Query Registrations to compute Phase Used & Event Used
    let phaseUsed = 0;
    let totalEventUsed = 0;

    if (eventKey === "festival") {
      const { data: rows } = await supabase
        .from("festival_registrations")
        .select("payment_status, ticket_phase, created_at, promo_id");

      (rows || []).forEach((r: any) => {
        const s = normalizeStatus(r.payment_status);
        if (s !== "rejected" && s !== "") {
          totalEventUsed++;
          const isRegular = isRegularRegistration(r);
          if (isRegular && isRecordInPhase(r, tierConfig.phase, tierConfig.start_date, tierConfig.end_date)) {
            phaseUsed++;
          }
        }
      });
    } else if (eventKey === "colorfun") {
      const { data: rows } = await supabase
        .from("colorfun_registrations")
        .select("payment_status, ticket_phase, created_at, promo_id");

      (rows || []).forEach((r: any) => {
        const s = normalizeStatus(r.payment_status);
        if (s !== "rejected" && s !== "") {
          totalEventUsed++;
          const isRegular = isRegularRegistration(r);
          if (isRegular && isRecordInPhase(r, tierConfig.phase, tierConfig.start_date, tierConfig.end_date)) {
            phaseUsed++;
          }
        }
      });
    } else if (eventKey === "bpc" || eventKey === "bcc" || eventKey === "tenant") {
      const table =
        eventKey === "bpc"
          ? "bpc_registrations"
          : eventKey === "bcc"
          ? "bcc_registrations"
          : "tenant_registrations";

      const [regRes, txRes] = await Promise.all([
        supabase.from(table).select("id, status, created_at"),
        supabase.from("transactions").select("source_id, status, sub_event_type, ticket_phase, created_at, promo_id"),
      ]);

      const txMap = new Map<string, { status: string; ticketPhase?: string | null; promoId?: string | null }>();
      (txRes.data || []).forEach((t: any) => {
        if (t.source_id) {
          txMap.set(t.source_id, {
            status: normalizeStatus(t.status),
            ticketPhase: t.ticket_phase || null,
            promoId: t.promo_id || null,
          });
        }
      });

      (regRes.data || []).forEach((r: any) => {
        const tx = txMap.get(r.id);
        const effectiveStatus = tx ? tx.status : normalizeStatus(r.status);
        if (effectiveStatus !== "rejected" && effectiveStatus !== "") {
          totalEventUsed++;
          const isRegular = isRegularRegistration({ promo_id: tx?.promoId, ticket_phase: tx?.ticketPhase });
          if (
            isRegular &&
            isRecordInPhase(
              { ticket_phase: tx?.ticketPhase, created_at: r.created_at },
              tierConfig.phase,
              tierConfig.start_date,
              tierConfig.end_date
            )
          ) {
            phaseUsed++;
          }
        }
      });
    } else if (eventKey === "seminar") {
      const [regRes, txRes] = await Promise.all([
        supabase.from("seminar_registrations").select("id, created_at"),
        supabase.from("transactions").select("source_id, status, sub_event_type, created_at, ticket_phase, promo_id"),
      ]);

      const txMap = new Map<string, { status: string; ticketPhase?: string | null; promoId?: string | null }>();
      (txRes.data || [])
        .filter((t: any) => (t.sub_event_type || "").toUpperCase() === "SEMINAR" && t.source_id)
        .forEach((t: any) => {
          txMap.set(t.source_id!, {
            status: normalizeStatus(t.status),
            ticketPhase: t.ticket_phase || null,
            promoId: t.promo_id || null,
          });
        });

      (regRes.data || []).forEach((r: any) => {
        const tx = txMap.get(r.id);
        const effectiveStatus = tx ? tx.status : "pending";
        if (effectiveStatus !== "rejected") {
          totalEventUsed++;
          const isRegular = isRegularRegistration({ promo_id: tx?.promoId, ticket_phase: tx?.ticketPhase });
          if (isRegular && isRecordInPhase({ ticket_phase: tx?.ticketPhase || null, created_at: r.created_at }, tierConfig.phase, tierConfig.start_date, tierConfig.end_date)) {
            phaseUsed++;
          }
        }
      });
    }

    // 4. Sub-Event Total Capacity Guard (event_quota)
    const rawEventQuota =
      tierConfig.event_quota !== undefined
        ? tierConfig.event_quota
        : tierConfig.total_event_quota !== undefined
        ? tierConfig.total_event_quota
        : tierConfig.max_quota;

    const isEventUnlimited = rawEventQuota === null;
    const eventQuota = isEventUnlimited
      ? null
      : typeof rawEventQuota === "number" && rawEventQuota > 0
      ? rawEventQuota
      : 500;

    if (!isEventUnlimited && eventQuota !== null && totalEventUsed + requestedQuantity > eventQuota) {
      return {
        valid: false,
        error: "Maaf, kuota untuk kategori tiket/promo yang Anda pilih baru saja habis.",
        guardTriggered: "event_capacity_full",
        remainingEventQuota: Math.max(0, eventQuota - totalEventUsed),
      };
    }

    // 5. Phase Quota Guard (phase_quota)
    // NOTE: Registrations purchased via Bundling/Promo packages must NOT decrement or count against this phase quota limit.
    // When checking bundle purchases, evaluate strictly against kuota_maksimal in public.promos and the overall event_quota.
    const isPhaseUnlimited = tierConfig.phase_quota === null;
    const phaseQuota = tierConfig.phase_quota;

    if (!promoId && !isPhaseUnlimited && phaseQuota !== null && phaseUsed + requestedQuantity > phaseQuota) {
      return {
        valid: false,
        error: "Maaf, kuota untuk kategori tiket/promo yang Anda pilih baru saja habis.",
        guardTriggered: "phase_quota_full",
        remainingPhaseQuota: Math.max(0, phaseQuota - phaseUsed),
        remainingEventQuota: eventQuota !== null ? Math.max(0, eventQuota - totalEventUsed) : null,
      };
    }

    // 6. Promo Guard (if promoId is provided)
    if (promoId) {
      const { data: promoData, error: promoErr } = await supabase
        .from("promos")
        .select("*")
        .eq("id", promoId)
        .maybeSingle();

      if (promoErr || !promoData || !promoData.is_active) {
        return {
          valid: false,
          error: "Kode promo sudah melewati periode aktif atau kuota telah habis",
          guardTriggered: "promo_invalid",
        };
      }

      const promo = promoData as Promo;

      // Promo Date Window (literal WIB)
      const { isActive: isPromoActive } = getEventTimeStatus(promo.start_date, promo.end_date);
      if (!isPromoActive) {
        return {
          valid: false,
          error: "Kode promo sudah melewati periode aktif atau kuota telah habis",
          guardTriggered: "promo_expired",
        };
      }

      // Promo Quota (null = unlimited)
      if (promo.kuota_maksimal !== null && promo.kuota_maksimal !== undefined) {
        const [festPromoRes, cfrPromoRes, txPromoRes] = await Promise.all([
          supabase.from("festival_registrations").select("id, payment_status").eq("promo_id", promoId),
          supabase.from("colorfun_registrations").select("id, payment_status").eq("promo_id", promoId),
          supabase.from("transactions").select("id, status").eq("promo_id", promoId),
        ]);

        const festCount = (festPromoRes.data || []).filter((r) => normalizeStatus(r.payment_status) !== "rejected").length;
        const cfrCount = (cfrPromoRes.data || []).filter((r) => normalizeStatus(r.payment_status) !== "rejected").length;
        const txCount = (txPromoRes.data || []).filter((r) => normalizeStatus(r.status) !== "rejected").length;

        const livePromoUsed = Math.max(festCount + cfrCount, txCount);
        const effectivePromoUsed = Math.max(promo.kuota_terpakai ?? 0, livePromoUsed);

        if (effectivePromoUsed + requestedQuantity > promo.kuota_maksimal) {
          return {
            valid: false,
            error: "Maaf, kuota untuk kategori tiket/promo yang Anda pilih baru saja habis.",
            guardTriggered: "promo_quota_full",
            remainingPromoQuota: Math.max(0, promo.kuota_maksimal - effectivePromoUsed),
          };
        }
      }
    }

    return {
      valid: true,
      remainingPhaseQuota: phaseQuota !== null ? Math.max(0, phaseQuota - phaseUsed) : null,
      remainingEventQuota: eventQuota !== null ? Math.max(0, eventQuota - totalEventUsed) : null,
    };
  } catch (err: any) {
    console.error("Server pre-checkout validation error:", err);
    return { valid: true };
  }
}

export async function submitCheckoutTransaction(formData: FormData): Promise<CheckoutResult> {
  const supabase = await createClient();

  // 1. Validate user session
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: "Sesi Anda telah kedaluwarsa atau belum login. Silakan login terlebih dahulu." };
  }

  const subEventType = (formData.get("subEventType") as string)?.toUpperCase(); // 'FESTIVAL' or 'CFR'
  const amountStr = formData.get("amount") as string;
  const paymentProofFile = formData.get("paymentProof") as File | null;
  const existingProofUrl = formData.get("paymentProofUrl") as string | null;
  const promoId = formData.get("promoId") as string | null;

  if (!subEventType || (subEventType !== "FESTIVAL" && subEventType !== "CFR")) {
    return { error: "Jenis sub-event tidak valid." };
  }

  const pricingEvent: PricingEvent = subEventType === "FESTIVAL" ? "festival" : "colorfun";

  // Re-validate availability guard on server before proceeding
  const guard = await validatePreCheckoutGuard(pricingEvent, 1, promoId);
  if (!guard.valid) {
    return { error: guard.error || "Pendaftaran tidak dapat diproses karena batas kuota atau periode aktif." };
  }

  const amount = parseInt(amountStr, 10);
  if (isNaN(amount) || amount <= 0) {
    return { error: "Nominal pembayaran tidak valid." };
  }

  let paymentProofUrl = existingProofUrl || "";

  // 2. Upload payment proof to 'payment-proofs' bucket if file was submitted directly
  if (!paymentProofUrl && paymentProofFile && paymentProofFile.size > 0) {
    const cleanFileName = paymentProofFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${user.id}/${Date.now()}-${cleanFileName}`;

    // Try primary bucket: payment-proofs
    let { error: uploadError } = await supabase.storage
      .from("payment-proofs")
      .upload(filePath, paymentProofFile, {
        cacheControl: "3600",
        upsert: false,
      });

    let targetBucket = "payment-proofs";

    // Fallback: If payment-proofs bucket does not exist yet, try registrations bucket
    if (uploadError) {
      console.warn("Upload to payment-proofs failed, attempting fallback to registrations:", uploadError.message);
      const fallbackUpload = await supabase.storage
        .from("registrations")
        .upload(filePath, paymentProofFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (fallbackUpload.error) {
        return { 
          error: `Gagal mengunggah bukti transfer ke storage: ${uploadError.message}. Pastikan bucket 'payment-proofs' sudah dibuat di Supabase.` 
        };
      }
      targetBucket = "registrations";
    }

    const { data: publicUrlData } = supabase.storage
      .from(targetBucket)
      .getPublicUrl(filePath);

    paymentProofUrl = publicUrlData.publicUrl;
  }

  if (!paymentProofUrl) {
    return { error: "Bukti transfer pembayaran wajib diunggah." };
  }

  // 3. Insert transaction record into 'transactions' table
  const sourceType = subEventType === "FESTIVAL" ? "festival" : "cfr";

  const { data: tx, error: txError } = await supabase
    .from("transactions")
    .insert({
      user_id: user.id,
      source_type: sourceType,
      sub_event_type: subEventType,
      amount,
      payment_proof_url: paymentProofUrl,
      status: "Pending",
      promo_id: promoId || null,
    })
    .select("id")
    .single();

  if (txError) {
    console.error("Failed to insert transaction:", txError);
    return { error: `Gagal membuat data transaksi: ${txError.message}` };
  }

  revalidatePath("/dashboard");
  return { success: true, transactionId: tx?.id };
}

/**
 * Server Action Pre-Submission Guard.
 * Call this prior to executing any client-side Supabase insert on registration tables.
 * Rejects submission if sub-event is closed, outside date bounds, quota exhausted, or promo is invalid/full.
 */
export async function validateRegistrationBeforeInsert(
  eventKey: PricingEvent,
  quantity: number = 1,
  promoId?: string | null
): Promise<{ valid: boolean; error?: string }> {
  const result = await validatePreCheckoutGuard(eventKey, quantity, promoId);
  return {
    valid: result.valid,
    error: result.error,
  };
}

