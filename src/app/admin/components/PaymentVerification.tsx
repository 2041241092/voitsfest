"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Filter, Eye, CheckCircle, XCircle, RotateCw, AlertCircle, Download, Users, X, Search, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { formatBIB, formatBIBCSV, formatFestivalParticipant, formatFestivalParticipantCSV, downloadCSV } from "@/lib/bib";
import { decrementPromoQuota, rollbackPromoQuotaOnReject } from "@/lib/promo";
import { formatDisplayWIB } from "@/lib/timeUtils";

export type BundleMember = {
  id: string;
  nama_lengkap: string;
  email: string;
  whatsapp: string;
  nomor_bib?: number | null;
  kategori_peserta?: string | null;
  nrp?: string | null;
  departemen?: string | null;
  ktm_url?: string | null;
  payment_status?: string | null;
  ticket_qr_code?: string | null;
};

export type UnifiedPaymentRecord = {
  id: string;
  source_id: string;
  user_id: string | null;
  origin_table: "colorfun_registrations" | "festival_registrations" | "transactions";
  sub_event_type: string;
  source_type: string;
  participant_name: string;
  nomor_bib?: number | null;
  group_id?: string | null;
  is_primary?: boolean | null;
  extra_members?: BundleMember[];
  rekening_pengirim?: string | null;
  amount: number;
  ticket_phase?: string | null;
  promo_id?: string | null;
  payment_proof_url: string;
  status: "Pending" | "Verified" | "Rejected";
  ticket_qr_code?: string | null;
  created_at: string;
};

// Backward-compatible alias
export type Transaction = UnifiedPaymentRecord;

type PaymentVerificationProps = {
  onTransactionUpdated?: () => void;
};

export default function PaymentVerification({ onTransactionUpdated }: PaymentVerificationProps = {}) {
  const [records, setRecords] = useState<UnifiedPaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("Pending");
  const [activeSubEvent, setActiveSubEvent] = useState("All");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [membersModalRecord, setMembersModalRecord] = useState<UnifiedPaymentRecord | null>(null);
  const [imagePreview, setImagePreview] = useState<{ url: string; title: string } | null>(null);

  const supabase = createClient();

  // Fetch records directly from both colorfun_registrations and festival_registrations (and transactions)
  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const [cfrRes, festRes, txRes] = await Promise.all([
        supabase.from("colorfun_registrations").select("*").order("created_at", { ascending: false }),
        supabase.from("festival_registrations").select("*").order("created_at", { ascending: false }),
        supabase.from("transactions").select("*").order("created_at", { ascending: false })
      ]);

      if (cfrRes.error) console.error("CFR fetch error in PaymentVerification:", cfrRes.error);
      if (festRes.error) console.error("Fest fetch error in PaymentVerification:", festRes.error);
      if (txRes.error) console.error("Tx fetch error in PaymentVerification:", txRes.error);

      const allItems: UnifiedPaymentRecord[] = [];
      const handledCfrIds = new Set<string>();
      const handledFestIds = new Set<string>();

      // 1. ColorFun Run registrations (build group members lookup)
      const cfrGroupMembers: Record<string, BundleMember[]> = {};
      (cfrRes.data || []).forEach((c: any) => {
        if (c.group_id) {
          if (!cfrGroupMembers[c.group_id]) cfrGroupMembers[c.group_id] = [];
          cfrGroupMembers[c.group_id].push({
            id: c.id,
            nama_lengkap: c.nama_lengkap || "-",
            email: c.email || "-",
            whatsapp: c.whatsapp || "-",
            nomor_bib: c.nomor_bib ?? c.bib_number ?? null,
            kategori_peserta: c.kategori_peserta || null,
            nrp: c.nrp || null,
            departemen: c.departemen || null,
            ktm_url: c.ktm_url || null,
            payment_status: c.payment_status || "pending",
            ticket_qr_code: c.ticket_qr_code || null,
          });
        }
      });

      // Map primary ColorFun rows ONLY
      (cfrRes.data || []).forEach((c: any) => {
        handledCfrIds.add(c.id);

        // Display Filter: ONLY display primary registrants in Payment Verification
        if (c.is_primary === false) {
          return;
        }

        const rawStatus = (c.payment_status || "pending").toLowerCase();
        const status: "Pending" | "Verified" | "Rejected" =
          rawStatus === "verified" ? "Verified" : rawStatus === "rejected" ? "Rejected" : "Pending";

        const amount = Number(c.amount_paid || 0);

        const extraMembers = c.group_id && cfrGroupMembers[c.group_id]
          ? cfrGroupMembers[c.group_id].filter((m: BundleMember) => m.id !== c.id)
          : [];

        allItems.push({
          id: `cfr-${c.id}`,
          source_id: c.id,
          user_id: c.user_id || null,
          origin_table: "colorfun_registrations",
          sub_event_type: "ColorFun Run",
          source_type: "CFR",
          participant_name: c.nama_lengkap || "Peserta ColorFun",
          rekening_pengirim: c.rekening_pengirim || "-",
          amount,
          ticket_phase: c.ticket_phase || null,
          promo_id: c.promo_id || null,
          nomor_bib: c.nomor_bib ?? c.bib_number ?? null,
          group_id: c.group_id ?? null,
          is_primary: c.is_primary ?? null,
          extra_members: extraMembers,
          payment_proof_url: c.bukti_transfer_url || "",
          status,
          ticket_qr_code: c.ticket_qr_code || null,
          created_at: c.created_at,
        });
      });

      // 2. Festival registrations (build group members lookup)
      const festGroupMembers: Record<string, BundleMember[]> = {};
      (festRes.data || []).forEach((f: any) => {
        if (f.group_id) {
          if (!festGroupMembers[f.group_id]) festGroupMembers[f.group_id] = [];
          festGroupMembers[f.group_id].push({
            id: f.id,
            nama_lengkap: f.nama_lengkap || "-",
            email: f.email || "-",
            whatsapp: f.whatsapp || "-",
            nomor_bib: f.nomor_bib ?? f.bib_number ?? null,
            kategori_peserta: f.kategori_peserta || null,
            nrp: f.nrp || null,
            departemen: f.departemen || null,
            ktm_url: f.ktm_url || null,
            payment_status: f.payment_status || "pending",
            ticket_qr_code: f.ticket_qr_code || null,
          });
        }
      });

      // Map primary Festival rows ONLY
      (festRes.data || []).forEach((f: any) => {
        handledFestIds.add(f.id);

        // Display Filter: ONLY display primary registrants in Payment Verification
        if (f.is_primary === false) {
          return;
        }

        const rawStatus = (f.payment_status || "pending").toLowerCase();
        const status: "Pending" | "Verified" | "Rejected" =
          rawStatus === "verified" ? "Verified" : rawStatus === "rejected" ? "Rejected" : "Pending";

        const amount = Number(f.amount_paid || 0);

        const extraMembers = f.group_id && festGroupMembers[f.group_id]
          ? festGroupMembers[f.group_id].filter((m: BundleMember) => m.id !== f.id)
          : [];

        allItems.push({
          id: `fest-${f.id}`,
          source_id: f.id,
          user_id: f.user_id || null,
          origin_table: "festival_registrations",
          sub_event_type: "Festival",
          source_type: "FESTIVAL",
          participant_name: f.nama_lengkap || "Peserta Festival",
          rekening_pengirim: f.rekening_pengirim || "-",
          amount,
          ticket_phase: f.ticket_phase || null,
          promo_id: f.promo_id || null,
          nomor_bib: f.nomor_bib ?? f.bib_number ?? null,
          group_id: f.group_id ?? null,
          is_primary: f.is_primary ?? null,
          extra_members: extraMembers,
          payment_proof_url: f.bukti_transfer_url || "",
          status,
          ticket_qr_code: f.ticket_qr_code || null,
          created_at: f.created_at,
        });
      });

      // 3. Fallback: Any transactions not already accounted for by source_id
      (txRes.data || []).forEach((tx: any) => {
        const isHandled =
          (tx.source_id && (handledCfrIds.has(tx.source_id) || handledFestIds.has(tx.source_id)));

        if (!isHandled) {
          const rawStatus = (tx.status || "Pending").toLowerCase();
          const status: "Pending" | "Verified" | "Rejected" =
            rawStatus === "verified" ? "Verified" : rawStatus === "rejected" ? "Rejected" : "Pending";

          allItems.push({
            id: `tx-${tx.id}`,
            source_id: tx.id,
            user_id: tx.user_id || null,
            origin_table: "transactions",
            sub_event_type: tx.sub_event_type || "Transaction",
            source_type: tx.source_type || "Direct",
            participant_name: "Peserta VOITSFEST",
            rekening_pengirim: "-",
            amount: Number(tx.amount || 0),
            ticket_phase: tx.ticket_phase || null,
            promo_id: tx.promo_id || null,
            payment_proof_url: tx.payment_proof_url || "",
            status,
            created_at: tx.created_at,
          });
        }
      });

      // Sort newest first
      allItems.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setRecords(allItems);
    } catch (err: any) {
      console.error("Unexpected error in fetchPayments:", err);
      setErrorMessage("Terjadi kesalahan jaringan saat mengambil data pembayaran.");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // Initial fetch
  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  // Listen for admin-refresh-data event across Admin Central
  useEffect(() => {
    const handleAdminRefresh = () => {
      fetchPayments();
    };
    window.addEventListener("admin-refresh-data", handleAdminRefresh);
    return () => {
      window.removeEventListener("admin-refresh-data", handleAdminRefresh);
    };
  }, [fetchPayments]);

  // Realtime subscription across all registration and transaction tables
  useEffect(() => {
    const channel = supabase
      .channel("payment-verification-live-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "colorfun_registrations" },
        () => {
          fetchPayments();
          if (onTransactionUpdated) onTransactionUpdated();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "festival_registrations" },
        () => {
          fetchPayments();
          if (onTransactionUpdated) onTransactionUpdated();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions" },
        () => {
          fetchPayments();
          if (onTransactionUpdated) onTransactionUpdated();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPayments, onTransactionUpdated, supabase]);

  // Helper to get next sequential BIB numbers for an event table
  const getNextBibNumbers = async (table: string, count: number): Promise<number[]> => {
    if (count <= 0) return [];

    const { data: rows } = await supabase
      .from(table)
      .select("nomor_bib")
      .not("nomor_bib", "is", null)
      .order("nomor_bib", { ascending: false, nullsFirst: false })
      .limit(10);

    let currentMax = 0;
    if (rows && rows.length > 0) {
      for (const r of rows) {
        const val = Number(r.nomor_bib);
        if (!isNaN(val) && val > currentMax) {
          currentMax = val;
        }
      }
    }

    const startBib = currentMax + 1;

    const bibs: number[] = [];
    for (let i = 0; i < count; i++) {
      bibs.push(startBib + i);
    }
    return bibs;
  };

  // Helper to resolve promo_id and capacity count associated with a transaction / group
  const resolvePromoInfo = async (
    record: UnifiedPaymentRecord
  ): Promise<{ promoId: string | null; count: number }> => {
    let promoId = record.promo_id || null;
    let count = (record.extra_members?.length || 0) + 1;

    // 1. If no promo_id on record, retrieve promo_id associated with that group_id from DB
    if (!promoId && record.origin_table !== "transactions") {
      try {
        const query = record.group_id
          ? supabase.from(record.origin_table).select("promo_id, ticket_phase").eq("group_id", record.group_id)
          : supabase.from(record.origin_table).select("promo_id, ticket_phase").eq("id", record.source_id);

        const { data: rows } = await query;
        if (rows && rows.length > 0) {
          if (record.group_id && rows.length > count) {
            count = rows.length;
          }
          const rowWithPromo = rows.find((r: any) => r.promo_id);
          if (rowWithPromo) {
            promoId = rowWithPromo.promo_id;
          } else if (rows[0]?.ticket_phase) {
            record.ticket_phase = rows[0].ticket_phase;
          }
        }
      } catch (err) {
        console.warn("Could not query promo_id from DB:", err);
      }
    }

    // 2. If still no promoId, check ticket_phase for [PROMO:uuid:count]
    if (!promoId && record.ticket_phase) {
      const match = record.ticket_phase.match(/\[PROMO:([^:\]]+)(?::(\d+))?\]/);
      if (match) {
        promoId = match[1];
        const parsedCount = parseInt(match[2] || "1", 10);
        if (count <= 1 && parsedCount > 1) {
          count = parsedCount;
        }
      }
    }

    // 3. Fallback: match by promo title
    if (!promoId && record.ticket_phase) {
      try {
        const cleanTitle = record.ticket_phase.replace(/\[PROMO:.*?\]/, "").trim();
        const { data: promoData } = await supabase
          .from("promos")
          .select("id, kapasitas")
          .eq("title", cleanTitle)
          .maybeSingle();

        if (promoData?.id) {
          promoId = promoData.id;
          if (count <= 1 && promoData.kapasitas) {
            count = promoData.kapasitas;
          }
        }
      } catch (err) {
        console.warn("Could not lookup promo by title:", err);
      }
    }

    return { promoId, count };
  };

  // Verify Action (Bi-directional sync updating all rows in group_id with sequential BIBs and QR codes)
  const handleVerify = async (record: UnifiedPaymentRecord) => {
    const { data: { user } } = await supabase.auth.getUser();

    try {
      if (record.origin_table === "colorfun_registrations") {
        if (record.group_id) {
          // Fetch all members in this group to issue unique QR codes and sequential BIBs for each
          const { data: groupMembers } = await supabase
            .from("colorfun_registrations")
            .select("id, ticket_qr_code, nomor_bib, is_primary")
            .eq("group_id", record.group_id)
            .order("is_primary", { ascending: false });

          const members = groupMembers || [];
          const neededCount = members.filter((m) => m.nomor_bib == null).length;
          const newBibs = neededCount > 0
            ? await getNextBibNumbers("colorfun_registrations", neededCount)
            : [];
          let bibIdx = 0;

          await Promise.all(
            members.map((m) => {
              const bib = m.nomor_bib != null ? m.nomor_bib : newBibs[bibIdx++];
              const qr = m.ticket_qr_code || ("CFR-2026-" + Math.random().toString(36).substring(2, 8).toUpperCase());
              return supabase
                .from("colorfun_registrations")
                .update({ payment_status: "verified", ticket_qr_code: qr, nomor_bib: bib })
                .eq("id", m.id);
            })
          );
        } else {
          // Single registrant update
          let bib = record.nomor_bib;
          if (bib == null) {
            const [nextBib] = await getNextBibNumbers("colorfun_registrations", 1);
            bib = nextBib;
          }
          const generatedQR = record.ticket_qr_code || ("CFR-2026-" + Math.random().toString(36).substring(2, 8).toUpperCase());
          const { error } = await supabase
            .from("colorfun_registrations")
            .update({ payment_status: "verified", ticket_qr_code: generatedQR, nomor_bib: bib })
            .eq("id", record.source_id);

          if (error) {
            alert("Gagal memverifikasi pendaftaran CFR: " + error.message);
            return;
          }
        }

        // Sync central transactions table
        try {
          await supabase
            .from("transactions")
            .update({ status: "Verified", verified_at: new Date().toISOString(), verified_by: user?.id })
            .or(`source_id.eq.${record.source_id},user_id.eq.${record.user_id}`)
            .in("sub_event_type", ["CFR", "cfr", "colorfun"]);
        } catch (e) {
          console.warn("Notice syncing transactions:", e);
        }

      } else if (record.origin_table === "festival_registrations") {
        if (record.group_id) {
          // Fetch all members in this group to issue unique QR codes and sequential BIBs for each
          const { data: groupMembers } = await supabase
            .from("festival_registrations")
            .select("id, ticket_qr_code, nomor_bib, is_primary")
            .eq("group_id", record.group_id)
            .order("is_primary", { ascending: false });

          const members = groupMembers || [];
          const neededCount = members.filter((m) => m.nomor_bib == null).length;
          const newBibs = neededCount > 0
            ? await getNextBibNumbers("festival_registrations", neededCount)
            : [];
          let bibIdx = 0;

          await Promise.all(
            members.map((m) => {
              const bib = m.nomor_bib != null ? m.nomor_bib : newBibs[bibIdx++];
              const qr = m.ticket_qr_code || ("FEST-2026-" + Math.random().toString(36).substring(2, 8).toUpperCase());
              return supabase
                .from("festival_registrations")
                .update({ payment_status: "verified", ticket_qr_code: qr, nomor_bib: bib })
                .eq("id", m.id);
            })
          );
        } else {
          // Single registrant update
          let bib = record.nomor_bib;
          if (bib == null) {
            const [nextBib] = await getNextBibNumbers("festival_registrations", 1);
            bib = nextBib;
          }
          const generatedQR = record.ticket_qr_code || ("FEST-2026-" + Math.random().toString(36).substring(2, 8).toUpperCase());
          const { error } = await supabase
            .from("festival_registrations")
            .update({ payment_status: "verified", ticket_qr_code: generatedQR, nomor_bib: bib })
            .eq("id", record.source_id);

          if (error) {
            alert("Gagal memverifikasi pendaftaran Festival: " + error.message);
            return;
          }
        }

        // Sync central transactions table
        try {
          await supabase
            .from("transactions")
            .update({ status: "Verified", verified_at: new Date().toISOString(), verified_by: user?.id })
            .or(`source_id.eq.${record.source_id},user_id.eq.${record.user_id}`)
            .in("sub_event_type", ["FESTIVAL", "festival"]);
        } catch (e) {
          console.warn("Notice syncing transactions:", e);
        }

      } else {
        const { data: updatedTx, error } = await supabase
          .from("transactions")
          .update({ status: "Verified", verified_at: new Date().toISOString(), verified_by: user?.id })
          .eq("id", record.source_id)
          .select("source_id, source_type, sub_event_type")
          .maybeSingle();

        if (error) {
          alert("Gagal memverifikasi transaksi: " + error.message);
          return;
        }

        if (updatedTx?.source_id) {
          const sType = (updatedTx.source_type || updatedTx.sub_event_type || "").toLowerCase();
          if (sType.includes("bcc")) {
            await supabase.from("bcc_registrations").update({ status: "approved" }).eq("id", updatedTx.source_id);
          } else if (sType.includes("bpc")) {
            await supabase.from("bpc_registrations").update({ status: "approved" }).eq("id", updatedTx.source_id);
          } else if (sType.includes("tenant")) {
            await supabase.from("tenant_registrations").update({ status: "approved" }).eq("id", updatedTx.source_id);
          }
        }
      }

      // Retrieve the promo_id associated with that group_id
      const { promoId, count: capacityCount } = await resolvePromoInfo(record);

      // Lifecycle Rule: Quota is already held at initial submission (pending).
      // Only re-increment if the registration was previously marked as "Rejected".
      if (record.status === "Rejected" && promoId) {
        const { error: rpcError } = await supabase.rpc("increment_promo_quota", {
          p_promo_id: promoId,
          p_amount: capacityCount,
        });
        if (rpcError) {
          console.error("RPC increment_promo_quota error:", rpcError);
        }
      }

      // Optimistic update
      setRecords(prev =>
        prev.map(r => (r.id === record.id ? { ...r, status: "Verified" } : r))
      );

      // Trigger UI state revalidation across Admin Central
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("promo-quota-updated", { detail: { promoId, amount: capacityCount } }));
        window.dispatchEvent(new CustomEvent("admin-refresh-data"));
      }

      await fetchPayments();
      if (onTransactionUpdated) {
        onTransactionUpdated();
      }
    } catch (err: any) {
      console.error("Verification error:", err);
      alert("Terjadi kesalahan saat memverifikasi: " + (err?.message || "Unknown error"));
    }
  };

  // Reject Action (Bi-directional sync updating all rows in group_id and releasing held quota immediately)
  const handleReject = async (record: UnifiedPaymentRecord) => {
    try {
      // Any non-rejected record (Pending or Verified) holds quota and must be released upon rejection
      const wasHoldingQuota = record.status !== "Rejected";

      if (record.origin_table === "colorfun_registrations") {
        let error;
        if (record.group_id) {
          const res = await supabase
            .from("colorfun_registrations")
            .update({ payment_status: "rejected" })
            .eq("group_id", record.group_id);
          error = res.error;
        } else {
          const res = await supabase
            .from("colorfun_registrations")
            .update({ payment_status: "rejected" })
            .eq("id", record.source_id);
          error = res.error;
        }

        if (error) {
          alert("Gagal menolak pendaftaran CFR: " + error.message);
          return;
        }

        try {
          await supabase
            .from("transactions")
            .update({ status: "Rejected" })
            .or(`source_id.eq.${record.source_id},user_id.eq.${record.user_id}`)
            .in("sub_event_type", ["CFR", "cfr", "colorfun"]);
        } catch (e) {
          console.warn("Notice syncing transactions rejection:", e);
        }

      } else if (record.origin_table === "festival_registrations") {
        let error;
        if (record.group_id) {
          const res = await supabase
            .from("festival_registrations")
            .update({ payment_status: "rejected" })
            .eq("group_id", record.group_id);
          error = res.error;
        } else {
          const res = await supabase
            .from("festival_registrations")
            .update({ payment_status: "rejected" })
            .eq("id", record.source_id);
          error = res.error;
        }

        if (error) {
          alert("Gagal menolak pendaftaran Festival: " + error.message);
          return;
        }

        try {
          await supabase
            .from("transactions")
            .update({ status: "Rejected" })
            .or(`source_id.eq.${record.source_id},user_id.eq.${record.user_id}`)
            .in("sub_event_type", ["FESTIVAL", "festival"]);
        } catch (e) {
          console.warn("Notice syncing transactions rejection:", e);
        }

      } else {
        const { data: updatedTx, error } = await supabase
          .from("transactions")
          .update({ status: "Rejected" })
          .eq("id", record.source_id)
          .select("source_id, source_type, sub_event_type")
          .maybeSingle();

        if (error) {
          alert("Gagal menolak transaksi: " + error.message);
          return;
        }

        if (updatedTx?.source_id) {
          const sType = (updatedTx.source_type || updatedTx.sub_event_type || "").toLowerCase();
          if (sType.includes("bcc")) {
            await supabase.from("bcc_registrations").update({ status: "rejected" }).eq("id", updatedTx.source_id);
          } else if (sType.includes("bpc")) {
            await supabase.from("bpc_registrations").update({ status: "rejected" }).eq("id", updatedTx.source_id);
          } else if (sType.includes("tenant")) {
            await supabase.from("tenant_registrations").update({ status: "rejected" }).eq("id", updatedTx.source_id);
          }
        }
      }

      // Lifecycle Rule: Release held quota immediately on admin rejection so slot becomes available again
      if (wasHoldingQuota) {
        const { promoId, count: capacityCount } = await resolvePromoInfo(record);
        if (promoId) {
          const { error: rpcError } = await supabase.rpc("decrement_promo_quota", {
            p_promo_id: promoId,
            p_amount: capacityCount,
          });
          if (rpcError) {
            console.error("RPC decrement_promo_quota error:", rpcError);
          }
        }
      }

      // Trigger UI state revalidation across Admin Central
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("promo-quota-updated"));
        window.dispatchEvent(new CustomEvent("admin-refresh-data"));
      }

      // Optimistic update
      setRecords(prev =>
        prev.map(r => (r.id === record.id ? { ...r, status: "Rejected" } : r))
      );

      await fetchPayments();
      if (onTransactionUpdated) {
        onTransactionUpdated();
      }
    } catch (err: any) {
      console.error("Reject error:", err);
      alert("Terjadi kesalahan saat menolak: " + (err?.message || "Unknown error"));
    }
  };

  const handleManualRefresh = async () => {
    await fetchPayments();
    if (onTransactionUpdated) {
      onTransactionUpdated();
    }
  };

  // Excel-safe CSV Export
  const handleExportCSV = () => {
    const headers = [
      "ID",
      "Nomor BIB / Peserta",
      "Sub Event",
      "Event Source",
      "Nama Peserta",
      "Rekening Pengirim",
      "Nominal (IDR)",
      "Fase Tiket",
      "Status",
      "Tiket QR Code",
      "Waktu Transaksi",
      "Group ID",
      "Tipe Registran",
    ];

    const rows = filteredRecords.map(item => [
      item.id,
      item.origin_table === "festival_registrations" || item.sub_event_type?.toLowerCase().includes("fest")
        ? formatFestivalParticipantCSV(item.nomor_bib)
        : formatBIBCSV(item.nomor_bib),
      item.sub_event_type,
      item.origin_table === "colorfun_registrations"
        ? "ColorFun Run"
        : item.origin_table === "festival_registrations"
        ? "Festival"
        : item.source_type,
      item.participant_name,
      item.rekening_pengirim || "-",
      item.amount,
      item.ticket_phase || "-",
      item.status,
      item.ticket_qr_code || "-",
      formatDisplayWIB(item.created_at),
      item.group_id || "-",
      item.is_primary === false ? "Anggota Group" : "Utama",
    ]);

    downloadCSV(`payment_verifications_${new Date().toISOString().split("T")[0]}`, headers, rows);
  };

  // Helper to map any record to a canonical sub-event key
  const getRecordEventKey = useCallback((r: UnifiedPaymentRecord): string => {
    const origin = (r.origin_table || "").toLowerCase();
    const sub = (r.sub_event_type || "").toLowerCase();
    const src = (r.source_type || "").toLowerCase();

    if (origin === "colorfun_registrations" || sub.includes("colorfun") || sub.includes("cfr") || src.includes("cfr")) {
      return "ColorFun Run";
    }
    if (origin === "festival_registrations" || sub.includes("fest") || src.includes("festival")) {
      return "Festival";
    }
    if (sub.includes("bpc") || src.includes("bpc")) {
      return "BPC";
    }
    if (sub.includes("bcc") || src.includes("bcc")) {
      return "BCC";
    }
    if (sub.includes("seminar") || src.includes("seminar")) {
      return "Seminar";
    }
    if (sub.includes("tenant") || src.includes("tenant")) {
      return "Tenant";
    }
    return r.sub_event_type || "Other";
  }, []);

  // Dynamic list of available sub-events for tabs
  const availableSubEvents = useMemo(() => {
    const baseTabs = ["ColorFun Run", "Festival", "BPC", "BCC", "Seminar", "Tenant"];
    const dynamicExtra: string[] = [];
    records.forEach((r) => {
      const key = getRecordEventKey(r);
      if (!baseTabs.includes(key) && key !== "Other" && !dynamicExtra.includes(key)) {
        dynamicExtra.push(key);
      }
    });
    return [
      { id: "All", label: "Semua Sub-Event" },
      ...baseTabs.map((t) => ({ id: t, label: t })),
      ...dynamicExtra.map((t) => ({ id: t, label: t })),
    ];
  }, [records, getRecordEventKey]);

  // Dynamic count badges for each sub-event tab matching current status filter
  const subEventCounts = useMemo(() => {
    const counts: Record<string, number> = { All: 0 };
    availableSubEvents.forEach((t) => { counts[t.id] = 0; });

    records.forEach((r) => {
      if (filter === "All" || r.status === filter) {
        counts["All"] = (counts["All"] || 0) + 1;
        const key = getRecordEventKey(r);
        counts[key] = (counts[key] || 0) + 1;
      }
    });
    return counts;
  }, [records, filter, availableSubEvents, getRecordEventKey]);

  // Reset currentPage back to 1 whenever sub-event tab, status filter, or search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeSubEvent, filter, search]);

  // Filtered dataset across status, sub-event tabs, and search query
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      // 1. Status Filter
      if (filter !== "All" && r.status !== filter) {
        return false;
      }

      // 2. Sub-Event Filter
      if (activeSubEvent !== "All") {
        const eventKey = getRecordEventKey(r);
        if (eventKey !== activeSubEvent) {
          return false;
        }
      }

      // 3. Search Query Filter
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchName = r.participant_name?.toLowerCase().includes(q);
        const matchRekening = r.rekening_pengirim?.toLowerCase().includes(q);
        const matchBib = r.nomor_bib != null && String(r.nomor_bib).includes(q);
        const matchQR = r.ticket_qr_code?.toLowerCase().includes(q);
        const matchPhase = r.ticket_phase?.toLowerCase().includes(q);
        const matchSub = r.sub_event_type?.toLowerCase().includes(q);
        const matchGroup = r.group_id?.toLowerCase().includes(q);
        const matchMembers = r.extra_members?.some(
          (m) =>
            m.nama_lengkap.toLowerCase().includes(q) ||
            m.email.toLowerCase().includes(q) ||
            m.whatsapp.toLowerCase().includes(q) ||
            (m.nomor_bib != null && String(m.nomor_bib).includes(q))
        );

        if (
          !matchName &&
          !matchRekening &&
          !matchBib &&
          !matchQR &&
          !matchPhase &&
          !matchSub &&
          !matchGroup &&
          !matchMembers
        ) {
          return false;
        }
      }

      return true;
    });
  }, [records, filter, activeSubEvent, search, getRecordEventKey]);

  // 1. Pagination Specifications & Limits: strictly 10 participants/records per page
  const ITEMS_PER_PAGE = 10;
  const totalCount = filteredRecords.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (validCurrentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalCount);

  const paginatedRecords = useMemo(() => {
    return filteredRecords.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredRecords, startIndex]);

  // Page numbers generator for pills with ellipsis (...) if total pages > 5
  const getPaginationPages = (current: number, total: number): (number | string)[] => {
    if (total <= 5) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    if (current <= 3) {
      return [1, 2, 3, 4, "...", total];
    }
    if (current >= total - 2) {
      return [1, "...", total - 3, total - 2, total - 1, total];
    }
    return [1, "...", current - 1, current, current + 1, "...", total];
  };

  return (
    <section className="bg-surface/50 backdrop-blur-xl border border-white/20 rounded-2xl flex flex-col overflow-hidden relative shadow-2xl">
      {/* Header bar */}
      <div className="p-6 border-b border-white/10 flex flex-col xl:flex-row justify-between xl:items-center gap-4 bg-surface/60">
        <div>
          <h2 className="text-xl font-bold text-on-surface flex items-center gap-2.5">
            Payment Verification Center
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-tertiary/15 text-tertiary border border-tertiary/30">
              <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse"></span>
              Live Supabase
            </span>
          </h2>
          <p className="text-xs text-on-surface-variant mt-1">
            Sinkronisasi data langsung dari <code className="font-mono text-secondary">colorfun_registrations</code>, <code className="font-mono text-secondary">festival_registrations</code> &amp; transaksi sub-event
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Realtime Search Bar */}
          <div className="relative flex-1 sm:w-64 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Cari nama, rekening, BIB..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 bg-surface border border-white/15 rounded-xl text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:border-secondary focus:outline-none transition-all font-poppins"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-white cursor-pointer"
                title="Hapus pencarian"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Manual Refresh Data Button */}
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-semibold text-on-surface hover:text-white transition-all cursor-pointer disabled:opacity-50 shadow-sm"
            title="Muat Ulang Data (Live Fetch)"
          >
            <RotateCw className={`w-3.5 h-3.5 text-secondary ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh Data</span>
          </button>

          {/* Export CSV / Excel Button */}
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={filteredRecords.length === 0}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-secondary/15 hover:bg-secondary/25 border border-secondary/30 text-xs font-semibold text-secondary transition-all cursor-pointer disabled:opacity-50 shadow-sm"
            title="Download CSV / Excel (Preserves 4-digit BIB)"
          >
            <Download className="w-3.5 h-3.5 text-secondary" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-on-surface-variant hidden sm:inline" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-secondary/10 text-secondary border border-secondary/30 px-3 py-1.5 rounded-xl text-xs font-semibold hover:bg-secondary/20 transition-colors focus:outline-none cursor-pointer"
            >
              <option value="All" className="bg-[#0b1026] text-on-surface">Semua Status</option>
              <option value="Pending" className="bg-[#0b1026] text-on-surface">Pending</option>
              <option value="Verified" className="bg-[#0b1026] text-on-surface">Verified</option>
              <option value="Rejected" className="bg-[#0b1026] text-on-surface">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Sub-Event Navigation Tabs */}
      <div className="flex-shrink-0 px-6 py-2.5 border-b border-white/10 bg-surface/40 flex items-center justify-between overflow-x-auto gap-3 scrollbar-thin">
        <div className="flex items-center gap-2 min-w-max">
          {availableSubEvents.map((tab) => {
            const isActive = activeSubEvent === tab.id;
            const count = subEventCounts[tab.id] || 0;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSubEvent(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                  isActive
                    ? "bg-secondary text-slate-950 font-bold shadow-[0_0_15px_rgba(240,192,77,0.3)]"
                    : "bg-surface-container/50 text-on-surface-variant hover:text-white hover:bg-surface-container border border-white/5"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isActive
                      ? "bg-slate-950/25 text-slate-950 font-bold"
                      : "bg-white/10 text-slate-300"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Error message alert */}
      {errorMessage && (
        <div className="p-4 bg-error/10 border-b border-error/20 text-error text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Table Content */}
      <div className="overflow-x-auto bg-surface/80 min-h-[460px]">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/10 bg-surface-container-low/60 text-on-surface-variant text-[11px] uppercase tracking-wider">
              <th className="p-4 py-3.5 font-semibold">Event / Bundle</th>
              <th className="p-4 py-3.5 font-semibold">Nama Peserta</th>
              <th className="p-4 py-3.5 font-semibold">Amount</th>
              <th className="p-4 py-3.5 font-semibold">Status</th>
              <th className="p-4 py-3.5 font-semibold">Bukti Transfer</th>
              <th className="p-4 py-3.5 font-semibold">Waktu Transaksi</th>
              <th className="p-4 py-3.5 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="text-sm font-poppins divide-y divide-white/5">
            {loading && records.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-12 text-center text-on-surface-variant">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <RotateCw className="w-5 h-5 animate-spin text-secondary" />
                    <p className="text-xs">Memuat data pembayaran dari Supabase...</p>
                  </div>
                </td>
              </tr>
            ) : filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-12 text-center text-on-surface-variant">
                  <p className="text-sm font-medium">Tidak ada transaksi ditemukan.</p>
                  <p className="text-xs text-on-surface-variant/70 mt-1">
                    {search.trim()
                      ? `Tidak ada transaksi yang cocok dengan pencarian "${search}".`
                      : activeSubEvent !== "All"
                      ? `Belum ada data untuk sub-event "${activeSubEvent}" dengan status "${filter}".`
                      : filter !== "All"
                      ? `Belum ada transaksi dengan status "${filter}".`
                      : "Tabel transaksi di Supabase saat ini kosong."}
                  </p>
                </td>
              </tr>
            ) : (
              paginatedRecords.map((item) => (
                <tr key={item.id} className="hover:bg-surface-variant/30 transition-colors h-[72px]">
                  <td className="p-4 py-3.5 text-white font-medium align-middle">
                    <span className="block leading-snug">{item.sub_event_type}</span>
                    <span className="text-[10px] font-mono text-secondary uppercase font-bold tracking-wider">
                      {item.origin_table === "colorfun_registrations" ? "ColorFun Run" : item.origin_table === "festival_registrations" ? "Festival" : item.source_type}
                    </span>
                  </td>
                  <td className="p-4 py-3.5 text-white font-medium align-middle">
                    <span className="block leading-snug">{item.participant_name}</span>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {item.nomor_bib != null ? (
                        <span className="font-mono text-xs font-bold text-secondary bg-secondary/10 border border-secondary/25 px-1.5 py-0.2 rounded w-fit">
                          {item.origin_table === "festival_registrations" || item.sub_event_type?.toLowerCase().includes("fest")
                            ? formatFestivalParticipant(item.nomor_bib)
                            : `BIB #${formatBIB(item.nomor_bib)}`}
                        </span>
                      ) : (
                        <span className="font-mono text-[11px] text-on-surface-variant/60 bg-white/5 border border-white/10 px-1.5 py-0.2 rounded w-fit">
                          {item.origin_table === "festival_registrations" || item.sub_event_type?.toLowerCase().includes("fest")
                            ? "Pass Festival"
                            : "BIB: Menunggu Verifikasi"}
                        </span>
                      )}
                      {item.extra_members && item.extra_members.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setMembersModalRecord(item)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 transition-all cursor-pointer shadow-sm hover:scale-105"
                          title="Lihat Anggota Bundle"
                        >
                          <Users className="w-3 h-3" />
                          <span>+{item.extra_members.length} Anggota</span>
                        </button>
                      )}
                    </div>
                    {item.rekening_pengirim && item.rekening_pengirim !== "-" && (
                      <span className="text-[11px] font-mono text-on-surface-variant/70 block mt-0.5">
                        a.n {item.rekening_pengirim}
                      </span>
                    )}
                  </td>
                  <td className="p-4 py-3.5 align-middle">
                    <div className="flex flex-col gap-1">
                      <span className="text-[#ffd700] font-mono font-semibold text-sm">
                        {new Intl.NumberFormat("id-ID", {
                          style: "currency",
                          currency: "IDR",
                          minimumFractionDigits: 0,
                        }).format(item.amount)}
                      </span>
                      {item.ticket_phase && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-secondary/15 text-secondary border border-secondary/30 w-fit">
                          {item.ticket_phase.replace(/\s*\[PROMO:.*\]/, "")}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 py-3.5 align-middle">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase border ${
                        item.status === "Pending"
                          ? "bg-error-container/30 text-error border-error/30"
                          : item.status === "Verified"
                          ? "bg-tertiary-container/50 text-tertiary border-tertiary/30"
                          : "bg-surface-variant text-on-surface-variant border-white/10"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          item.status === "Pending"
                            ? "bg-error"
                            : item.status === "Verified"
                            ? "bg-tertiary"
                            : "bg-on-surface-variant"
                        }`}
                      ></span>
                      {item.status}
                    </span>
                  </td>
                  <td className="p-4 py-3.5 align-middle">
                    {item.payment_proof_url ? (
                      <button
                        type="button"
                        onClick={() =>
                          setImagePreview({
                            url: item.payment_proof_url,
                            title: `Bukti Transfer - ${item.participant_name} (${item.sub_event_type})`,
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-secondary/50 transition-all text-xs font-medium text-on-surface-variant hover:text-secondary cursor-pointer"
                        title="Lihat Bukti Pembayaran"
                      >
                        <Eye className="w-3.5 h-3.5" /> Lihat Bukti
                      </button>
                    ) : (
                      <span className="text-xs text-on-surface-variant/50 italic">Tidak ada</span>
                    )}
                  </td>
                  <td className="p-4 py-3.5 text-xs text-on-surface-variant font-mono align-middle">
                    {formatDisplayWIB(item.created_at)}
                  </td>
                  <td className="p-4 py-3.5 text-right align-middle">
                    <div className="flex justify-end gap-2">
                      {item.status === "Pending" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleReject(item)}
                            className="p-1.5 rounded-lg text-error hover:bg-error/10 transition-colors cursor-pointer"
                            title="Tolak Transaksi (Reject)"
                          >
                            <XCircle className="w-5 h-5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleVerify(item)}
                            className="p-1.5 rounded-lg text-tertiary hover:bg-tertiary/10 transition-colors cursor-pointer"
                            title="Verifikasi Transaksi (Verify & Auto-Issue Ticket)"
                          >
                            <CheckCircle className="w-5 h-5" />
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-on-surface-variant/50 px-2 py-1 font-mono">
                          {item.status}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 2. Pagination Navigation Bar (Bottom Footer - Pinned/Sticky directly below table) */}
      <div className="sticky bottom-0 z-10 p-4 bg-surface/95 backdrop-blur-md border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 select-none shadow-lg">
        {/* Left Section (Data Counter) */}
        <div className="text-xs text-on-surface-variant font-poppins">
          {totalCount === 0 ? (
            <span>Menampilkan 0 peserta</span>
          ) : (
            <span>
              Menampilkan{" "}
              <strong className="text-white font-mono">{startIndex + 1}</strong>
              {" - "}
              <strong className="text-white font-mono">{Math.min(endIndex, totalCount)}</strong>
              {" dari "}
              <strong className="text-white font-mono">
                {new Intl.NumberFormat("id-ID").format(totalCount)}
              </strong>{" "}
              peserta
            </span>
          )}
        </div>

        {/* Right Section (Page Navigation Controls) */}
        <div className="flex items-center gap-1.5">
          {/* Previous Button (<): Disabled on page 1 (opacity-40 cursor-not-allowed) */}
          <button
            type="button"
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            disabled={validCurrentPage <= 1 || totalCount === 0}
            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center justify-center"
            title="Halaman Sebelumnya"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Page Number Pills: Numbered buttons showing active page highlighted with ellipsis (...) if total pages > 5 */}
          <div className="flex items-center gap-1">
            {getPaginationPages(validCurrentPage, totalPages).map((page, idx) => {
              if (typeof page === "string") {
                return (
                  <span
                    key={`ellipsis-${idx}`}
                    className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-xs text-on-surface-variant select-none"
                  >
                    ...
                  </span>
                );
              }

              const isActive = page === validCurrentPage;
              return (
                <button
                  key={`page-${page}`}
                  type="button"
                  onClick={() => setCurrentPage(page)}
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl text-xs font-semibold transition-all flex items-center justify-center cursor-pointer ${
                    isActive
                      ? "bg-secondary text-slate-950 font-bold border border-secondary shadow-[0_0_12px_rgba(240,192,77,0.35)]"
                      : "border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                >
                  {page}
                </button>
              );
            })}
          </div>

          {/* Next Button (>): Disabled on the last page */}
          <button
            type="button"
            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={validCurrentPage >= totalPages || totalCount === 0}
            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center justify-center"
            title="Halaman Berikutnya"
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Extra Members View Modal */}
      {membersModalRecord && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setMembersModalRecord(null)}
        >
          <div 
            className="bg-[#0b1026]/95 border border-white/20 rounded-2xl p-6 max-w-lg w-full shadow-[0_0_60px_rgba(0,0,0,0.9)] relative flex flex-col gap-4 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-secondary" />
                  Anggota Bundle ({membersModalRecord.extra_members?.length || 0})
                </h3>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Pendaftar Utama: <span className="text-white font-semibold">{membersModalRecord.participant_name}</span> ({membersModalRecord.sub_event_type})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMembersModalRecord(null)}
                className="p-1.5 rounded-full text-on-surface-variant hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Tutup Modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Members List */}
            <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-1">
              {membersModalRecord.extra_members?.map((member, idx) => (
                <div
                  key={member.id || idx}
                  className="p-3.5 rounded-xl bg-surface-container-highest/40 border border-white/10 flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                        {member.nama_lengkap}
                        <span className="text-[10px] px-1.5 py-0.2 rounded font-sans font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                          Anggota {idx + 1}
                        </span>
                      </h4>
                      <p className="text-xs text-on-surface-variant font-mono">
                        {member.email} • {member.whatsapp}
                      </p>
                    </div>
                    {member.nomor_bib != null ? (
                      <span className="font-mono text-xs font-bold text-secondary bg-secondary/15 border border-secondary/35 px-2 py-0.5 rounded">
                        {membersModalRecord.origin_table === "festival_registrations" || membersModalRecord.sub_event_type?.toLowerCase().includes("fest")
                          ? formatFestivalParticipant(member.nomor_bib)
                          : `BIB #${formatBIB(member.nomor_bib)}`}
                      </span>
                    ) : (
                      <span className="font-mono text-xs text-on-surface-variant/60 bg-white/5 border border-white/10 px-2 py-0.5 rounded">
                        {membersModalRecord.origin_table === "festival_registrations" || membersModalRecord.sub_event_type?.toLowerCase().includes("fest")
                          ? "Pass Festival"
                          : "BIB: Menunggu Verifikasi"}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-on-surface-variant pt-1 border-t border-white/5">
                    {member.kategori_peserta && (
                      <span className="text-xs">
                        Kategori: <strong className="text-white">{member.kategori_peserta}</strong>
                      </span>
                    )}
                    {member.departemen && (
                      <span className="text-xs">
                        Dept: <strong className="text-white">{member.departemen}</strong>
                      </span>
                    )}
                    {member.nrp && (
                      <span className="text-xs font-mono">
                        NRP: <strong className="text-white">{member.nrp}</strong>
                      </span>
                    )}
                    {member.ktm_url && (
                      <a
                        href={member.ktm_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" /> Lihat KTM
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* Receipt Preview Modal */}
      {imagePreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setImagePreview(null)}
        >
          <div
            className="bg-[#0b1026]/95 border border-white/20 rounded-2xl p-5 max-w-2xl w-full shadow-[0_0_60px_rgba(0,0,0,0.9)] relative flex flex-col gap-4 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2 truncate pr-2">
                <Eye className="w-4 h-4 text-secondary" />
                <span className="truncate">{imagePreview.title}</span>
              </h3>
              <div className="flex items-center gap-2 flex-shrink-0">
                <a
                  href={imagePreview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-white transition-all"
                  title="Buka Gambar Asli di Tab Baru"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Tab Baru</span>
                </a>
                <button
                  type="button"
                  onClick={() => setImagePreview(null)}
                  className="p-1.5 rounded-full text-on-surface-variant hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title="Tutup Modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="max-h-[70vh] overflow-auto rounded-xl border border-white/10 bg-black/50 p-2 flex items-center justify-center">
              <img
                src={imagePreview.url}
                alt={imagePreview.title}
                className="max-h-[65vh] max-w-full object-contain rounded-lg shadow-lg"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
