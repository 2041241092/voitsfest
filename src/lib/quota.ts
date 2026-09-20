import { createClient } from "@/lib/supabase/client";
import { fetchPricingTiers, PricingEvent, DEFAULT_PRICING_TIERS, EventPricing, PRICING_EVENT_NAMES } from "@/lib/pricing";
import { Promo } from "@/types/database";
import { getEventTimeStatus, parseWibDate } from "@/lib/timeUtils";

export interface QuotaStatus {
  // Dual Quota Hierarchy
  // Tier 1: Phase Quota
  phaseName: string;
  phasePrice: number;
  phaseStartDate: string | null;
  phaseEndDate: string | null;
  phaseQuota: number | null; // specific limit for active phase; null represents 'Unlimited'
  isPhaseUnlimited: boolean;
  usedInPhase: number;
  remainingPhaseQuota: number | null; // null if unlimited, otherwise Math.max(0, phaseQuota - usedInPhase)
  isPhaseFull: boolean;
  isPhaseDateActive: boolean;

  // Tier 2: Overall Event/Venue Participant Ceiling
  eventQuota: number | null; // Total Kuota Slot Peserta Sub-Event (maps to tierConfig.event_quota, null if unlimited)
  totalEventQuota: number | null; // null if unbounded (alias for eventQuota)
  isEventUnlimited: boolean;
  totalEventRegistered: number; // cumulative non-rejected registrations across all phases
  remainingEventQuota: number | null; // Math.max(0, eventQuota - totalEventRegistered)
  isEventFull: boolean;

  // Dual Guard Combined Availability
  isAvailable: boolean;
  availabilityReason?: "available" | "phase_quota_full" | "event_capacity_full" | "phase_date_ended" | "phase_date_not_started";

  // Legacy fields for full backward compatibility
  maxQuota: number;
  usedQuota: number;
  remainingQuota: number;
  pendingCount: number;
  approvedCount: number;
  isFull: boolean;
}

export type SubEventQuotaMap = Record<PricingEvent, QuotaStatus>;

export interface PromoQuotaStatus {
  promo: Promo;
  maxQuota: number | null;
  isUnlimited: boolean;
  usedQuota: number;
  remainingQuota: number | null;
  pendingCount: number;
  approvedCount: number;
  isFull: boolean;
  isDateStarted: boolean;
  isDateEnded: boolean;
  isAvailable: boolean;
}

/**
 * Normalizes payment / registration status into standard lowercase string.
 */
export function normalizeStatus(status: unknown): string {
  if (typeof status !== "string") return "pending";
  return status.trim().toLowerCase();
}

/**
 * Checks if a status counts towards Used Quota:
 * Count all registrations where status IN ('pending', 'approved', 'verified') (or status != 'rejected').
 */
export function isStatusUsed(status: unknown): boolean {
  const s = normalizeStatus(status);
  return s !== "rejected" && s !== "";
}

/**
 * Checks if a status is approved / verified.
 */
export function isStatusApproved(status: unknown): boolean {
  const s = normalizeStatus(status);
  return s === "approved" || s === "verified";
}

/**
 * Checks if a status is pending.
 */
export function isStatusPending(status: unknown): boolean {
  const s = normalizeStatus(status);
  return s === "pending";
}

/**
 * Determines whether a registration record belongs to the active registration phase.
 * Considers ticket_phase matching, created_at range within phase start/end dates,
 * or fallback to active phase if no dates configured.
 */
function isRecordInPhase(
  record: { ticket_phase?: string | null; created_at?: string | null },
  phase: string,
  startDate?: string | null,
  endDate?: string | null
): boolean {
  // 1. If record has ticket_phase that matches the current phase name
  if (record.ticket_phase) {
    const cleanRecordPhase = record.ticket_phase.replace(/\[PROMO:.*?\]/, "").trim().toLowerCase();
    const cleanTargetPhase = phase.trim().toLowerCase();
    if (cleanRecordPhase && (cleanRecordPhase.includes(cleanTargetPhase) || cleanTargetPhase.includes(cleanRecordPhase))) {
      return true;
    }
  }

  // 2. If phase has explicit start/end dates, verify created_at falls into the date range
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

  // 3. Fallback: if no explicit dates configured and ticket_phase is not explicitly for another known phase
  if (!startDate && (!record.ticket_phase || record.ticket_phase.trim() === "")) {
    return true;
  }

  return false;
}

/**
 * Builds a standardized QuotaStatus combining both Tier 1 (Phase) and Tier 2 (Event) metrics.
 */
function buildSubEventQuota(
  tier: EventPricing,
  usedInPhase: number,
  totalEventRegistered: number,
  pendingCount: number,
  approvedCount: number
): QuotaStatus {
  const isPhaseUnlimited = tier.phase_quota == null;
  const phaseQuota = tier.phase_quota;
  const remainingPhaseQuota = isPhaseUnlimited ? null : Math.max(0, (phaseQuota as number) - usedInPhase);
  const isPhaseFull = !isPhaseUnlimited && usedInPhase >= (phaseQuota as number);

  // CRITICAL RULE: Maintain backward compatibility if existing records still use max_quota by falling back event_quota = item.event_quota ?? item.max_quota
  const rawEventQuota = tier.event_quota !== undefined
    ? tier.event_quota
    : (tier.total_event_quota !== undefined ? tier.total_event_quota : tier.max_quota);
  const isEventUnlimited = rawEventQuota === null;
  const eventQuota = isEventUnlimited ? null : (typeof rawEventQuota === "number" && rawEventQuota > 0 ? rawEventQuota : 500);
  const remainingEventQuota = isEventUnlimited || eventQuota === null ? null : Math.max(0, eventQuota - totalEventRegistered);
  const isEventFull = !isEventUnlimited && eventQuota !== null && totalEventRegistered >= eventQuota;

  // Phase Date Window (using standardized literal WIB timeUtils)
  const { isActive: isPhaseDateActive, isStarted: isPhaseStarted, isEnded: isPhaseEnded } = getEventTimeStatus(
    tier.start_date,
    tier.end_date
  );

  // Dual Guard Availability
  let isAvailable = true;
  let availabilityReason: QuotaStatus["availabilityReason"] = "available";

  if (!isPhaseStarted) {
    isAvailable = false;
    availabilityReason = "phase_date_not_started";
  } else if (isPhaseEnded) {
    isAvailable = false;
    availabilityReason = "phase_date_ended";
  } else if (isEventFull) {
    isAvailable = false;
    availabilityReason = "event_capacity_full";
  } else if (isPhaseFull) {
    isAvailable = false;
    availabilityReason = "phase_quota_full";
  }

  return {
    // Dual Quota Hierarchy Tier 1: Phase Quota
    phaseName: tier.phase,
    phasePrice: tier.price,
    phaseStartDate: tier.start_date || null,
    phaseEndDate: tier.end_date || null,
    phaseQuota,
    isPhaseUnlimited,
    usedInPhase,
    remainingPhaseQuota,
    isPhaseFull,
    isPhaseDateActive,

    // Dual Quota Hierarchy Tier 2: Overall Event/Venue Participant Ceiling
    eventQuota,
    totalEventQuota: eventQuota,
    isEventUnlimited,
    totalEventRegistered,
    remainingEventQuota,
    isEventFull,

    // Dual Guard Combined Availability
    isAvailable,
    availabilityReason,

    // Backward compatibility aliases
    maxQuota: eventQuota ?? 500,
    usedQuota: totalEventRegistered,
    remainingQuota: remainingEventQuota ?? 0,
    pendingCount,
    approvedCount,
    isFull: isEventFull || isPhaseFull,
  };
}

/**
 * Helper to determine if a registration is strictly a regular ticket (non-promo / non-bundle).
 * Registrations with promo_id set or ticket_phase containing [PROMO:...] are bundling/promo purchases.
 */
export function isRegularRegistration(record: { promo_id?: string | null; ticket_phase?: string | null }): boolean {
  if (record.promo_id && String(record.promo_id).trim() !== "") return false;
  if (record.ticket_phase && record.ticket_phase.includes("[PROMO:")) return false;
  return true;
}

/**
 * Fetches real-time quota calculations for all 6 sub-events.
 * Strictly adheres to the two-tier quota hierarchy:
 * - Tier 1: Phase Quota: Counts strictly regular ticket registrations (promo_id IS NULL AND NOT a bundle).
 * - Tier 2: Overall Venue/Sub-Event Capacity: Counts ALL participants across all phases, regular tickets, and bundling purchases.
 * - Used Quota: status IN ('pending', 'approved') (or status != 'rejected')
 */
export async function fetchAllSubEventQuotas(): Promise<SubEventQuotaMap> {
  const supabase = createClient();
  const pricingTiers = await fetchPricingTiers();

  try {
    const [festRes, cfrRes, bpcRes, bccRes, semRes, tenRes, txRes] = await Promise.all([
      supabase.from("festival_registrations").select("id, payment_status, ticket_phase, created_at, promo_id"),
      supabase.from("colorfun_registrations").select("id, payment_status, ticket_phase, created_at, promo_id"),
      supabase.from("bpc_registrations").select("id, status, created_at"),
      supabase.from("bcc_registrations").select("id, status, created_at"),
      supabase.from("seminar_registrations").select("id, created_at"),
      supabase.from("tenant_registrations").select("id, status, created_at"),
      supabase.from("transactions").select("source_id, status, sub_event_type, created_at, ticket_phase, promo_id"),
    ]);

    // Map transactions by source_id for sub-events that track payments in transactions
    const txMap = new Map<string, { status: string; subEvent: string; ticketPhase?: string | null; createdAt?: string | null; promoId?: string | null }>();
    (txRes.data || []).forEach((t: any) => {
      if (t.source_id) {
        const sub = (t.sub_event_type || t.source_type || "").toUpperCase();
        txMap.set(t.source_id, {
          status: normalizeStatus(t.status),
          subEvent: sub,
          ticketPhase: t.ticket_phase || null,
          createdAt: t.created_at || null,
          promoId: t.promo_id || null,
        });
      }
    });

    // 1. Festival Quota
    const festTier = pricingTiers.festival;
    const festRows = festRes.data || [];
    let festPending = 0;
    let festApproved = 0;
    let festPhaseUsed = 0;
    for (const r of festRows) {
      const isPending = isStatusPending(r.payment_status);
      const isApproved = isStatusApproved(r.payment_status);
      if (isPending) festPending++;
      else if (isApproved) festApproved++;
      if (isPending || isApproved) {
        // Phase Quota: strictly regular ticket registrations (promo_id IS NULL and NOT bundle)
        if (isRegularRegistration(r) && isRecordInPhase(r, festTier.phase, festTier.start_date, festTier.end_date)) {
          festPhaseUsed++;
        }
      }
    }
    // Overall Event Capacity: ALL participants (Regular + Bundling)
    const festTotalUsed = festPending + festApproved;

    // 2. ColorFun Run Quota
    const cfrTier = pricingTiers.colorfun;
    const cfrRows = cfrRes.data || [];
    let cfrPending = 0;
    let cfrApproved = 0;
    let cfrPhaseUsed = 0;
    for (const r of cfrRows) {
      const isPending = isStatusPending(r.payment_status);
      const isApproved = isStatusApproved(r.payment_status);
      if (isPending) cfrPending++;
      else if (isApproved) cfrApproved++;
      if (isPending || isApproved) {
        // Phase Quota: strictly regular ticket registrations (promo_id IS NULL and NOT bundle)
        if (isRegularRegistration(r) && isRecordInPhase(r, cfrTier.phase, cfrTier.start_date, cfrTier.end_date)) {
          cfrPhaseUsed++;
        }
      }
    }
    // Overall Event Capacity: ALL participants (Regular + Bundling)
    const cfrTotalUsed = cfrPending + cfrApproved;

    // 3. BPC Quota
    const bpcTier = pricingTiers.bpc;
    const bpcRows = bpcRes.data || [];
    let bpcPending = 0;
    let bpcApproved = 0;
    let bpcPhaseUsed = 0;
    for (const r of bpcRows) {
      const txInfo = txMap.get(r.id);
      const effectiveStatus = (txInfo && txInfo.subEvent.includes("BPC")) ? txInfo.status : normalizeStatus(r.status);
      if (effectiveStatus === "rejected") {
        continue; // Released
      } else if (isStatusApproved(effectiveStatus)) {
        bpcApproved++;
      } else {
        bpcPending++;
      }
      const isRegular = isRegularRegistration({ promo_id: txInfo?.promoId, ticket_phase: txInfo?.ticketPhase });
      if (isRegular && isRecordInPhase({ ticket_phase: txInfo?.ticketPhase, created_at: r.created_at }, bpcTier.phase, bpcTier.start_date, bpcTier.end_date)) {
        bpcPhaseUsed++;
      }
    }
    const bpcTotalUsed = bpcPending + bpcApproved;

    // 4. BCC Quota
    const bccTier = pricingTiers.bcc;
    const bccRows = bccRes.data || [];
    let bccPending = 0;
    let bccApproved = 0;
    let bccPhaseUsed = 0;
    for (const r of bccRows) {
      const txInfo = txMap.get(r.id);
      const effectiveStatus = (txInfo && txInfo.subEvent.includes("BCC")) ? txInfo.status : normalizeStatus(r.status);
      if (effectiveStatus === "rejected") {
        continue; // Released
      } else if (isStatusApproved(effectiveStatus)) {
        bccApproved++;
      } else {
        bccPending++;
      }
      const isRegular = isRegularRegistration({ promo_id: txInfo?.promoId, ticket_phase: txInfo?.ticketPhase });
      if (isRegular && isRecordInPhase({ ticket_phase: txInfo?.ticketPhase, created_at: r.created_at }, bccTier.phase, bccTier.start_date, bccTier.end_date)) {
        bccPhaseUsed++;
      }
    }
    const bccTotalUsed = bccPending + bccApproved;

    // 5. Tenant Quota
    const tenTier = pricingTiers.tenant;
    const tenRows = tenRes.data || [];
    let tenPending = 0;
    let tenApproved = 0;
    let tenPhaseUsed = 0;
    for (const r of tenRows) {
      const txInfo = txMap.get(r.id);
      const effectiveStatus = (txInfo && txInfo.subEvent.includes("TENANT")) ? txInfo.status : normalizeStatus(r.status);
      if (effectiveStatus === "rejected") {
        continue; // Released
      } else if (isStatusApproved(effectiveStatus)) {
        tenApproved++;
      } else {
        tenPending++;
      }
      const isRegular = isRegularRegistration({ promo_id: txInfo?.promoId, ticket_phase: txInfo?.ticketPhase });
      if (isRegular && isRecordInPhase({ ticket_phase: txInfo?.ticketPhase, created_at: r.created_at }, tenTier.phase, tenTier.start_date, tenTier.end_date)) {
        tenPhaseUsed++;
      }
    }
    const tenTotalUsed = tenPending + tenApproved;

    // 6. Seminar Quota
    const semTier = pricingTiers.seminar;
    const semRows = semRes.data || [];
    let semPending = 0;
    let semApproved = 0;
    let semPhaseUsed = 0;
    for (const r of semRows) {
      const txInfo = txMap.get(r.id);
      const effectiveStatus = (txInfo && txInfo.subEvent.includes("SEMINAR")) ? txInfo.status : "pending";
      if (effectiveStatus === "rejected") {
        continue; // Released
      } else if (isStatusApproved(effectiveStatus)) {
        semApproved++;
      } else {
        semPending++;
      }
      const isRegular = isRegularRegistration({ promo_id: txInfo?.promoId, ticket_phase: txInfo?.ticketPhase });
      if (isRegular && isRecordInPhase({ ticket_phase: txInfo?.ticketPhase || null, created_at: r.created_at }, semTier.phase, semTier.start_date, semTier.end_date)) {
        semPhaseUsed++;
      }
    }
    const semTotalUsed = semPending + semApproved;

    return {
      festival: buildSubEventQuota(festTier, festPhaseUsed, festTotalUsed, festPending, festApproved),
      colorfun: buildSubEventQuota(cfrTier, cfrPhaseUsed, cfrTotalUsed, cfrPending, cfrApproved),
      bpc: buildSubEventQuota(bpcTier, bpcPhaseUsed, bpcTotalUsed, bpcPending, bpcApproved),
      bcc: buildSubEventQuota(bccTier, bccPhaseUsed, bccTotalUsed, bccPending, bccApproved),
      seminar: buildSubEventQuota(semTier, semPhaseUsed, semTotalUsed, semPending, semApproved),
      tenant: buildSubEventQuota(tenTier, tenPhaseUsed, tenTotalUsed, tenPending, tenApproved),
    };
  } catch (err) {
    console.error("Error fetching sub-event quotas:", err);
    return {
      festival: createFallbackQuota(pricingTiers.festival),
      colorfun: createFallbackQuota(pricingTiers.colorfun),
      bpc: createFallbackQuota(pricingTiers.bpc),
      bcc: createFallbackQuota(pricingTiers.bcc),
      seminar: createFallbackQuota(pricingTiers.seminar),
      tenant: createFallbackQuota(pricingTiers.tenant),
    };
  }
}

export function createFallbackQuota(pricingTier: EventPricing | number): QuotaStatus {
  const tier: EventPricing = typeof pricingTier === "number"
    ? {
        phase: "Regular",
        price: 0,
        start_date: null,
        end_date: null,
        phase_quota: pricingTier,
        event_quota: pricingTier,
        total_event_quota: pricingTier,
        max_quota: pricingTier,
      }
    : pricingTier;

  // CRITICAL RULE: Maintain backward compatibility if existing records still use max_quota by falling back event_quota = item.event_quota ?? item.max_quota
  const rawEventQuota = tier.event_quota !== undefined
    ? tier.event_quota
    : (tier.total_event_quota !== undefined ? tier.total_event_quota : tier.max_quota);
  const isEventUnlimited = rawEventQuota === null;
  const eventQuota = isEventUnlimited ? null : (typeof rawEventQuota === "number" && rawEventQuota > 0 ? rawEventQuota : 500);

  return {
    phaseName: tier.phase,
    phasePrice: tier.price,
    phaseStartDate: tier.start_date || null,
    phaseEndDate: tier.end_date || null,
    phaseQuota: tier.phase_quota,
    isPhaseUnlimited: tier.phase_quota == null,
    usedInPhase: 0,
    remainingPhaseQuota: tier.phase_quota,
    isPhaseFull: false,
    isPhaseDateActive: true,

    eventQuota,
    totalEventQuota: eventQuota,
    isEventUnlimited,
    totalEventRegistered: 0,
    remainingEventQuota: eventQuota,
    isEventFull: false,

    isAvailable: true,
    availabilityReason: "available",

    maxQuota: eventQuota ?? 500,
    usedQuota: 0,
    remainingQuota: eventQuota ?? 500,
    pendingCount: 0,
    approvedCount: 0,
    isFull: false,
  };
}

/**
 * Fetches real-time quota calculations for all active Promos & Bundles.
 * Cross-references both `promos.kuota_terpakai` and actual non-rejected registrations.
 */
export async function fetchPromoQuotas(): Promise<PromoQuotaStatus[]> {
  const supabase = createClient();
  try {
    const { data: promos, error: promoErr } = await supabase
      .from("promos")
      .select("*")
      .order("created_at", { ascending: false });

    if (promoErr || !promos) {
      console.error("Error fetching promos for quota:", promoErr);
      return [];
    }

    // Query registrations with promo_id to get exact pending & approved breakdown
    const [cfrRes, festRes] = await Promise.all([
      supabase.from("colorfun_registrations").select("promo_id, payment_status"),
      supabase.from("festival_registrations").select("promo_id, payment_status"),
    ]);

    const promoPendingMap = new Map<string, number>();
    const promoApprovedMap = new Map<string, number>();

    const allRegs = [...(cfrRes.data || []), ...(festRes.data || [])];
    for (const reg of allRegs) {
      if (!reg.promo_id) continue;
      const pId = reg.promo_id;
      if (isStatusPending(reg.payment_status)) {
        promoPendingMap.set(pId, (promoPendingMap.get(pId) || 0) + 1);
      } else if (isStatusApproved(reg.payment_status)) {
        promoApprovedMap.set(pId, (promoApprovedMap.get(pId) || 0) + 1);
      }
    }
    return (promos as Promo[]).map((promo) => {
      const pendingFromRegs = promoPendingMap.get(promo.id) || 0;
      const approvedFromRegs = promoApprovedMap.get(promo.id) || 0;
      const liveUsedFromRegs = pendingFromRegs + approvedFromRegs;

      // Used quota is the greater of live registrations or stored kuota_terpakai counter
      const usedQuota = Math.max(promo.kuota_terpakai ?? 0, liveUsedFromRegs);
      const isUnlimited = promo.kuota_maksimal == null;
      const maxQuota = isUnlimited ? null : (promo.kuota_maksimal as number);
      const remainingQuota = isUnlimited ? null : Math.max(0, (maxQuota as number) - usedQuota);
      const isFull = !isUnlimited && usedQuota >= (maxQuota as number);

      const { isStarted: isDateStarted, isEnded: isDateEnded, isActive: isDateActive } = getEventTimeStatus(promo.start_date, promo.end_date);
      const isAvailable = promo.is_active && isDateActive && !isFull;

      return {
        promo,
        maxQuota,
        isUnlimited,
        usedQuota,
        remainingQuota,
        pendingCount: pendingFromRegs,
        approvedCount: approvedFromRegs > 0 ? approvedFromRegs : Math.max(0, usedQuota - pendingFromRegs),
        isFull,
        isDateStarted,
        isDateEnded,
        isAvailable,
      };
    });
  } catch (err) {
    console.error("Exception fetching promo quotas:", err);
    return [];
  }
}

/**
 * Validates whether sufficient quota exists before allowing a user to submit checkout.
 * Enforces the strict Dual Guard Availability Rules:
 * - Guard 2 (Sub-Event Cap Check): total_event_quota == null OR total_subevent_registered (pending + approved) < total_event_quota.
 *   (If full, display 'Kapasitas Event Penuh / Sold Out').
 * - Guard 1 (Phase Check): phase_quota == null OR used_in_phase (pending + approved) < phase_quota.
 *   (If full, display 'Kuota Fase Ini Habis').
 * - Date Range Check: using literal WIB timeUtils.
 * - Promo Check: verifies promo active status, date range, and quota if promoId provided.
 */
export async function checkQuotaAvailability(
  event: PricingEvent,
  requestedQuantity: number = 1,
  promoId?: string | null
): Promise<{
  available: boolean;
  error?: string;
  guardTriggered?: "subevent_cap" | "phase_quota" | "phase_date" | "promo";
  remainingSubEventQuota: number;
  remainingPhaseQuota?: number | null;
  remainingPromoQuota?: number | null;
}> {
  const subEventQuotas = await fetchAllSubEventQuotas();
  const eventStatus = subEventQuotas[event] || createFallbackQuota(DEFAULT_PRICING_TIERS[event]);

  // Guard 2: Sub-Event Overall Limit (event_quota: overall venue capacity across all phases)
  const effectiveEventQuota = eventStatus.eventQuota ?? eventStatus.totalEventQuota;
  if (
    !eventStatus.isEventUnlimited &&
    effectiveEventQuota != null &&
    eventStatus.totalEventRegistered + requestedQuantity > effectiveEventQuota
  ) {
    return {
      available: false,
      error: "Maaf, kuota untuk kategori tiket/promo yang Anda pilih baru saja habis.",
      guardTriggered: "subevent_cap",
      remainingSubEventQuota: Math.max(0, effectiveEventQuota - eventStatus.totalEventRegistered),
      remainingPhaseQuota: eventStatus.remainingPhaseQuota,
    };
  }

  // Guard 1: Phase Limit (phase_quota: active phase quota limit)
  // Evaluated ONLY for regular ticket bookings (!promoId). Bundling purchases do NOT decrement or check phase_quota.
  if (
    !promoId &&
    !eventStatus.isPhaseUnlimited &&
    eventStatus.phaseQuota != null &&
    eventStatus.usedInPhase + requestedQuantity > eventStatus.phaseQuota
  ) {
    return {
      available: false,
      error: "Maaf, kuota untuk kategori tiket/promo yang Anda pilih baru saja habis.",
      guardTriggered: "phase_quota",
      remainingSubEventQuota: effectiveEventQuota !== null ? Math.max(0, effectiveEventQuota - eventStatus.totalEventRegistered) : 999999,
      remainingPhaseQuota: Math.max(0, eventStatus.phaseQuota - eventStatus.usedInPhase),
    };
  }

  // Phase Date Window Check
  if (eventStatus.phaseStartDate || eventStatus.phaseEndDate) {
    const { isStarted, isEnded } = getEventTimeStatus(eventStatus.phaseStartDate, eventStatus.phaseEndDate);
    if (!isStarted) {
      return {
        available: false,
        error: `Periode pendaftaran untuk fase "${eventStatus.phaseName}" belum dimulai.`,
        guardTriggered: "phase_date",
        remainingSubEventQuota: eventStatus.remainingQuota,
        remainingPhaseQuota: eventStatus.remainingPhaseQuota,
      };
    }
    if (isEnded) {
      return {
        available: false,
        error: `Periode pendaftaran untuk fase "${eventStatus.phaseName}" telah berakhir.`,
        guardTriggered: "phase_date",
        remainingSubEventQuota: eventStatus.remainingQuota,
        remainingPhaseQuota: eventStatus.remainingPhaseQuota,
      };
    }
  }

  // Promo Check (if promoId is provided)
  if (promoId) {
    const promoQuotas = await fetchPromoQuotas();
    const targetPromo = promoQuotas.find((p) => p.promo.id === promoId);

    if (targetPromo) {
      // Condition 3: Date Range Check
      const { isStarted, isEnded } = getEventTimeStatus(targetPromo.promo.start_date, targetPromo.promo.end_date);
      if (!isStarted) {
        return {
          available: false,
          error: `Periode promo/bundling "${targetPromo.promo.title}" belum dimulai.`,
          guardTriggered: "promo",
          remainingSubEventQuota: eventStatus.remainingQuota,
          remainingPhaseQuota: eventStatus.remainingPhaseQuota,
          remainingPromoQuota: targetPromo.remainingQuota,
        };
      }

      if (isEnded) {
        return {
          available: false,
          error: `Periode promo/bundling "${targetPromo.promo.title}" telah berakhir.`,
          guardTriggered: "promo",
          remainingSubEventQuota: eventStatus.remainingQuota,
          remainingPhaseQuota: eventStatus.remainingPhaseQuota,
          remainingPromoQuota: targetPromo.remainingQuota,
        };
      }

      // Condition 1: Quota Check for limited bundles (max_quota is NOT null)
      if (!targetPromo.isUnlimited && targetPromo.maxQuota != null) {
        if (targetPromo.usedQuota >= targetPromo.maxQuota) {
          return {
            available: false,
            error: "Maaf, kuota untuk kategori tiket/promo yang Anda pilih baru saja habis.",
            guardTriggered: "promo",
            remainingSubEventQuota: eventStatus.remainingQuota,
            remainingPhaseQuota: eventStatus.remainingPhaseQuota,
            remainingPromoQuota: 0,
          };
        }

        if ((targetPromo.remainingQuota ?? 0) < requestedQuantity) {
          return {
            available: false,
            error: "Maaf, kuota untuk kategori tiket/promo yang Anda pilih baru saja habis.",
            guardTriggered: "promo",
            remainingSubEventQuota: eventStatus.remainingQuota,
            remainingPhaseQuota: eventStatus.remainingPhaseQuota,
            remainingPromoQuota: targetPromo.remainingQuota,
          };
        }
      }

      // Condition 2: Unlimited Quota (max_quota is null) -> completely bypass promo quota check
      return {
        available: true,
        remainingSubEventQuota: eventStatus.remainingQuota,
        remainingPhaseQuota: eventStatus.remainingPhaseQuota,
        remainingPromoQuota: targetPromo.remainingQuota,
      };
    }
  }

  return {
    available: true,
    remainingSubEventQuota: eventStatus.remainingQuota,
    remainingPhaseQuota: eventStatus.remainingPhaseQuota,
  };
}

/**
 * Dispatches cross-window and component event to re-evaluate quota and refresh all dashboard tables.
 */
export function dispatchQuotaRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("promo-quota-updated"));
    window.dispatchEvent(new CustomEvent("admin-refresh-data"));
  }
}

/**
 * Listens to quota updates dispatched across components and returns an unsubscribe cleanup function.
 */
export function listenToQuotaRefresh(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  const handler = () => callback();
  window.addEventListener("promo-quota-updated", handler);
  window.addEventListener("admin-refresh-data", handler);
  return () => {
    window.removeEventListener("promo-quota-updated", handler);
    window.removeEventListener("admin-refresh-data", handler);
  };
}
