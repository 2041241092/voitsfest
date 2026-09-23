"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { QRCodeSVG } from "qrcode.react";
import { 
  Search, 
  RotateCw, 
  ExternalLink, 
  CheckCircle, 
  XCircle, 
  QrCode, 
  Copy, 
  Check, 
  Filter, 
  FileText, 
  AlertCircle, 
  Clock, 
  X, 
  Download,
  Eye,
  Users,
  CreditCard,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ShieldCheck,
  FileCheck
} from "lucide-react";
import { formatFestivalParticipant, formatFestivalParticipantCSV, downloadCSV } from "@/lib/bib";
import { decrementPromoQuota, rollbackPromoQuotaOnReject } from "@/lib/promo";
import { formatDisplayWIB } from "@/lib/timeUtils";

export type FestivalRegistration = {
  id: string;
  nomor_bib?: number | null;
  group_id?: string | null;
  is_primary?: boolean | null;
  user_id: string | null;
  nama_lengkap: string;
  email: string;
  whatsapp: string;
  kategori_peserta?: string | null;
  departemen?: string | null;
  nrp?: string | null;
  ktm_url?: string | null;
  rekening_pengirim?: string | null;
  bukti_transfer_url?: string | null;
  promo_proof_url?: string | null;
  payment_status: string;
  amount_paid?: number | null;
  ticket_phase?: string | null;
  promo_id?: string | null;
  ticket_qr_code?: string | null;
  scan_count?: number | null;
  last_scanned_at?: string | null;
  created_at: string;
};

export default function FestivalDatabase() {
  const [registrations, setRegistrations] = useState<FestivalRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "verified" | "rejected">("all");
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [qrModalRecord, setQrModalRecord] = useState<FestivalRegistration | null>(null);
  const [selectedDetailRecord, setSelectedDetailRecord] = useState<FestivalRegistration | null>(null);
  const [groupMembers, setGroupMembers] = useState<FestivalRegistration[]>([]);
  const [loadingGroupMembers, setLoadingGroupMembers] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ url: string; title: string } | null>(null);

  // Pagination State (10 items per page)
  const ITEMS_PER_PAGE = 10;
  const [currentPage, setCurrentPage] = useState(1);

  // Automatically reset to page 1 whenever filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, search]);

  const supabase = createClient();

  // 1. Fetch records ordered by created_at descending
  const fetchRegistrations = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const { data, error } = await supabase
        .from("festival_registrations")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching festival_registrations:", error);
        setErrorMessage("Gagal memuat data Festival: " + error.message);
        setRegistrations([]);
      } else {
        setRegistrations(data || []);
      }
    } catch (err: any) {
      console.error("Unexpected error in fetchRegistrations:", err);
      setErrorMessage("Terjadi kesalahan jaringan saat mengambil data.");
      setRegistrations([]);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // Initial fetch
  useEffect(() => {
    fetchRegistrations();
  }, [fetchRegistrations]);

  // Real-time synchronization
  useEffect(() => {
    const channel = supabase
      .channel("festival-database-live-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "festival_registrations" },
        () => {
          fetchRegistrations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchRegistrations]);

  // Listen to custom admin refresh event
  useEffect(() => {
    const handleAdminRefresh = () => {
      fetchRegistrations();
    };
    window.addEventListener("admin-refresh-data", handleAdminRefresh);
    return () => {
      window.removeEventListener("admin-refresh-data", handleAdminRefresh);
    };
  }, [fetchRegistrations]);

  // Fetch group members if selectedDetailRecord belongs to a group
  useEffect(() => {
    if (!selectedDetailRecord?.group_id) {
      setGroupMembers([]);
      return;
    }
    const fetchGroup = async () => {
      setLoadingGroupMembers(true);
      try {
        const { data, error } = await supabase
          .from("festival_registrations")
          .select("*")
          .eq("group_id", selectedDetailRecord.group_id)
          .order("is_primary", { ascending: false });
        if (!error && data) {
          setGroupMembers(data);
        }
      } catch (err) {
        console.error("Error fetching festival group members:", err);
      } finally {
        setLoadingGroupMembers(false);
      }
    };
    fetchGroup();
  }, [selectedDetailRecord, supabase]);

  // Verify Action
  const handleVerify = async (record: FestivalRegistration) => {
    const recordId = record.id;
    if (actionInProgress) return;
    setActionInProgress(recordId);

    try {
      // 1. Supabase Update Call: if group_id exists, verify all members simultaneously with sequential BIBs & QR codes
      if (record.group_id) {
        const { data: members } = await supabase
          .from("festival_registrations")
          .select("id, ticket_qr_code, nomor_bib, is_primary")
          .eq("group_id", record.group_id)
          .order("is_primary", { ascending: false });

        const groupList = members || [];
        const neededCount = groupList.filter((m) => m.nomor_bib == null).length;
        let newBibs: number[] = [];
        if (neededCount > 0) {
          const { data: rows } = await supabase
            .from("festival_registrations")
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
          for (let i = 0; i < neededCount; i++) {
            newBibs.push(startBib + i);
          }
        }
        let bibIdx = 0;

        await Promise.all(
          groupList.map((m) => {
            const bib = m.nomor_bib != null ? m.nomor_bib : newBibs[bibIdx++];
            const qr = m.ticket_qr_code || ("FEST-2026-" + Math.random().toString(36).substring(2, 8).toUpperCase());
            return supabase
              .from("festival_registrations")
              .update({ payment_status: "verified", ticket_qr_code: qr, nomor_bib: bib })
              .eq("id", m.id);
          })
        );
      } else {
        let bib = record.nomor_bib;
        if (bib == null) {
          const { data: rows } = await supabase
            .from("festival_registrations")
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

          bib = currentMax + 1;
        }

        const generatedQR = record.ticket_qr_code || ("FEST-2026-" + Math.random().toString(36).substring(2, 8).toUpperCase());
        const { error } = await supabase
          .from("festival_registrations")
          .update({ payment_status: "verified", ticket_qr_code: generatedQR, nomor_bib: bib })
          .eq("id", recordId);

        if (error) {
          console.error("Update failed:", error);
          alert(`Update failed: ${error.message || "Gagal memverifikasi pendaftaran"}`);
          return;
        }
      }

      // Also update central transactions if matching row exists
      try {
        await supabase
          .from("transactions")
          .update({ status: "Verified", verified_at: new Date().toISOString() })
          .or(`source_id.eq.${recordId},user_id.eq.${record.user_id}`)
          .in("sub_event_type", ["FESTIVAL", "festival"]);
      } catch (txErr) {
        console.warn("Notice syncing transactions:", txErr);
      }

      // Retrieve the promo_id associated with that group_id
      let promoId = record.promo_id || null;
      let capacityCount = 1;
      if (record.group_id) {
        const { data: gData } = await supabase
          .from("festival_registrations")
          .select("promo_id, ticket_phase")
          .eq("group_id", record.group_id);
        if (gData && gData.length > 0) {
          capacityCount = gData.length;
          const matchPromo = gData.find((r: any) => r.promo_id);
          if (matchPromo) promoId = matchPromo.promo_id;
        }
      }

      if (!promoId && record.ticket_phase) {
        const match = record.ticket_phase.match(/\[PROMO:([^:\]]+)(?::(\d+))?\]/);
        if (match) {
          promoId = match[1];
          const cap = parseInt(match[2] || "1", 10);
          if (capacityCount <= 1 && cap > 1) capacityCount = cap;
        }
      }

      // Lifecycle Rule: Quota is already held at initial submission (pending).
      // Only re-increment if the registration was previously marked as "rejected".
      if (record.payment_status?.toLowerCase() === "rejected" && promoId) {
        const { error: rpcError } = await supabase.rpc("increment_promo_quota", {
          p_promo_id: promoId,
          p_amount: capacityCount,
        });
        if (rpcError) console.error("increment_promo_quota error:", rpcError);
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("promo-quota-updated"));
        window.dispatchEvent(new CustomEvent("admin-refresh-data"));
      }

      await fetchRegistrations();
    } catch (err: any) {
      console.error("Gagal memverifikasi pendaftaran:", err);
      alert("Gagal memverifikasi: " + (err.message || "Terjadi kesalahan"));
    } finally {
      setActionInProgress(null);
    }
  };

  // Reject Action
  const handleReject = async (record: FestivalRegistration) => {
    const recordId = record.id;
    if (actionInProgress) return;

    const confirmReject = confirm(`Apakah Anda yakin ingin menolak pembayaran pendaftar "${record.nama_lengkap}"?`);
    if (!confirmReject) return;

    setActionInProgress(recordId);

    try {
      const wasHoldingQuota = record.payment_status?.toLowerCase() !== "rejected";
      let error = null;

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
          .eq("id", recordId);
        error = res.error;
      }

      if (error) {
        console.error("Reject failed:", error);
        alert(`Gagal menolak pendaftaran Festival: ${error.message || "Terjadi kesalahan"}`);
        return;
      }

      // Sync central transactions if matching row exists
      try {
        await supabase
          .from("transactions")
          .update({ status: "Rejected" })
          .or(`source_id.eq.${recordId},user_id.eq.${record.user_id}`)
          .in("sub_event_type", ["FESTIVAL", "festival"]);
      } catch (txErr) {
        console.warn("Notice syncing transactions rejection:", txErr);
      }

      // Lifecycle Rule: Release held quota immediately on admin rejection so slot becomes available again
      if (wasHoldingQuota) {
        let promoId = record.promo_id || null;
        let capacityCount = 1;
        if (record.group_id) {
          const { data: gData } = await supabase
            .from("festival_registrations")
            .select("promo_id, ticket_phase")
            .eq("group_id", record.group_id);
          if (gData && gData.length > 0) {
            capacityCount = gData.length;
            const matchPromo = gData.find((r: any) => r.promo_id);
            if (matchPromo) promoId = matchPromo.promo_id;
          }
        }
        if (!promoId && record.ticket_phase) {
          const match = record.ticket_phase.match(/\[PROMO:([^:\]]+)(?::(\d+))?\]/);
          if (match) {
            promoId = match[1];
            const cap = parseInt(match[2] || "1", 10);
            if (capacityCount <= 1 && cap > 1) capacityCount = cap;
          }
        }
        if (promoId) {
          const { error: rpcError } = await supabase.rpc("decrement_promo_quota", {
            p_promo_id: promoId,
            p_amount: capacityCount,
          });
          if (rpcError) console.error("decrement_promo_quota error:", rpcError);
        }
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("promo-quota-updated"));
        window.dispatchEvent(new CustomEvent("admin-refresh-data"));
      }

      await fetchRegistrations();
    } catch (err: any) {
      console.error("Gagal menolak pendaftaran:", err);
      alert("Gagal menolak pendaftaran: " + (err.message || "Terjadi kesalahan"));
    } finally {
      setActionInProgress(null);
    }
  };

  // Copy Ticket Code helper
  const handleCopyTicket = (ticket: string, id: string) => {
    navigator.clipboard.writeText(ticket);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Counts for tabs
  const counts = useMemo(() => {
    let pending = 0;
    let verified = 0;
    let rejected = 0;

    registrations.forEach(r => {
      const s = (r.payment_status || "").toLowerCase();
      if (s === "pending") pending++;
      else if (s === "verified") verified++;
      else if (s === "rejected") rejected++;
    });

    return { all: registrations.length, pending, verified, rejected };
  }, [registrations]);

  // Filtered and Searched data
  const filteredData = useMemo(() => {
    return registrations.filter(r => {
      // 1. Status Filter
      if (filter !== "all") {
        const s = (r.payment_status || "").toLowerCase();
        if (filter === "pending" && s !== "pending") return false;
        if (filter === "verified" && s !== "verified") return false;
        if (filter === "rejected" && s !== "rejected") return false;
      }

      // 2. Search Query
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (r.nama_lengkap || "").toLowerCase().includes(q) ||
        (r.email || "").toLowerCase().includes(q) ||
        (r.whatsapp || "").toLowerCase().includes(q) ||
        (r.nrp || "").toLowerCase().includes(q) ||
        (r.kategori_peserta || "").toLowerCase().includes(q) ||
        (r.departemen || "").toLowerCase().includes(q) ||
        (r.rekening_pengirim || "").toLowerCase().includes(q) ||
        (r.ticket_qr_code || "").toLowerCase().includes(q) ||
        formatFestivalParticipant(r.nomor_bib).toLowerCase().includes(q) ||
        String(r.nomor_bib || "").toLowerCase().includes(q)
      );
    });
  }, [registrations, filter, search]);

  // Client-side pagination calculations (10 rows per page)
  const totalPages = Math.max(1, Math.ceil(filteredData.length / ITEMS_PER_PAGE));
  const validCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (validCurrentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filteredData.length);

  const paginatedData = useMemo(() => {
    return filteredData.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredData, startIndex]);

  // Excel-safe CSV Export
  const handleExportCSV = () => {
    const headers = [
      "Nomor Peserta",
      "Nama Lengkap",
      "Email",
      "WhatsApp",
      "Kategori",
      "Departemen",
      "NRP",
      "Status Pembayaran",
      "Nominal (IDR)",
      "Fase Tiket",
      "Rekening Pengirim",
      "Tiket QR Code",
      "Jumlah Scan",
      "Group ID",
      "Tipe Peserta",
      "Waktu Daftar",
    ];

    const rows = filteredData.map(r => [
      formatFestivalParticipantCSV(r.nomor_bib),
      r.nama_lengkap || "-",
      r.email || "-",
      r.whatsapp || "-",
      r.kategori_peserta || "-",
      r.departemen || "-",
      r.nrp || "-",
      r.payment_status || "-",
      r.amount_paid || 0,
      r.ticket_phase || "-",
      r.rekening_pengirim || "-",
      r.ticket_qr_code || "-",
      r.scan_count || 0,
      r.group_id || "-",
      r.is_primary === false ? "Anggota Group" : "Utama",
      formatDisplayWIB(r.created_at),
    ]);

    downloadCSV(`festival_registrations_${new Date().toISOString().split("T")[0]}`, headers, rows);
  };

  return (
    <section className="bg-surface/50 backdrop-blur-xl border border-white/20 rounded-2xl flex flex-col h-[calc(100vh-220px)] min-h-[500px] overflow-hidden relative shadow-2xl">
      {/* Header bar (Search, Filter, Export Actions) */}
      <div className="flex-shrink-0 p-6 border-b border-white/10 flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-surface/60">
        <div>
          <h2 className="text-xl font-bold text-on-surface flex items-center gap-2.5">
            Festival Database &amp; Verification Center
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-secondary/15 text-secondary border border-secondary/30">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse"></span>
              Live Supabase
            </span>
          </h2>
          <p className="text-xs text-on-surface-variant mt-1">
            Data registrasi langsung dari tabel <code className="font-mono text-secondary">festival_registrations</code>
          </p>
        </div>

        {/* Action controls: Refresh & Search */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchRegistrations}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/15 rounded-xl text-xs font-semibold text-white transition-all cursor-pointer disabled:opacity-50"
            title="Refresh Data"
          >
            <RotateCw className={`w-3.5 h-3.5 text-secondary ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {/* Export CSV / Excel Button */}
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={filteredData.length === 0}
            className="flex items-center gap-2 px-3 py-2 bg-secondary/15 hover:bg-secondary/25 border border-secondary/30 rounded-xl text-xs font-semibold text-secondary transition-all cursor-pointer disabled:opacity-50"
            title="Download CSV / Excel (Preserves Participant Code)"
          >
            <Download className="w-3.5 h-3.5 text-secondary" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>

          <div className="relative flex-1 sm:flex-initial">
            <Search className="w-4 h-4 text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari nama, NRP, WhatsApp..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 bg-surface border border-outline-variant rounded-xl text-xs text-on-surface focus:border-secondary outline-none transition-all w-full sm:w-64 font-poppins"
            />
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex-shrink-0 px-6 py-3 border-b border-white/10 bg-surface/30 flex items-center justify-between overflow-x-auto gap-4">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-on-surface-variant mr-1" />
          {(["all", "pending", "verified", "rejected"] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer capitalize ${
                filter === tab
                  ? "bg-secondary text-on-secondary font-semibold shadow-[0_0_12px_rgba(240,192,77,0.3)]"
                  : "bg-surface-container/50 text-on-surface-variant hover:text-white hover:bg-surface-container"
              }`}
            >
              <span>{tab === "all" ? "Semua" : tab}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                filter === tab ? "bg-black/20 text-black font-bold" : "bg-white/10 text-white"
              }`}>
                {counts[tab]}
              </span>
            </button>
          ))}
        </div>

        <span className="text-xs text-on-surface-variant font-mono whitespace-nowrap">
          Menampilkan {filteredData.length} data
        </span>
      </div>

      {/* Error notification banner */}
      {errorMessage && (
        <div className="flex-shrink-0 m-4 p-3 bg-error-container/40 border border-error/50 rounded-xl text-error text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Table Container - Flex-1 Dual Scroll with Sticky Header */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto custom-scrollbar relative border-b border-white/10">
        <table className="w-full text-left border-collapse whitespace-nowrap font-poppins relative">
          <thead className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-md shadow-sm">
            <tr className="text-on-surface-variant text-[11px] uppercase tracking-wider border-b border-white/10">
              <th className="p-4 py-3 font-semibold">Peserta &amp; Kontak</th>
              <th className="p-4 py-3 font-semibold">Kategori &amp; Identitas</th>
              <th className="p-4 py-3 font-semibold">Nomor Peserta &amp; Tiket</th>
              <th className="p-4 py-3 font-semibold">Nominal &amp; Paket</th>
              <th className="p-4 py-3 font-semibold">Bukti Bayar</th>
              <th className="p-4 py-3 font-semibold">Status &amp; Waktu</th>
              <th className="p-4 py-3 font-semibold text-right sticky right-0 top-0 z-30 bg-slate-900/95 backdrop-blur-md border-l border-white/10">
                Aksi
              </th>
            </tr>
          </thead>

          <tbody className="text-sm divide-y divide-white/5">
            {loading && registrations.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-12 text-center text-on-surface-variant">
                  <div className="flex items-center justify-center gap-2">
                    <RotateCw className="w-4 h-4 animate-spin text-secondary" />
                    <span>Memuat data dari Supabase...</span>
                  </div>
                </td>
              </tr>
            ) : filteredData.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-12 text-center text-on-surface-variant">
                  <p className="text-sm font-medium">Tidak ada data pendaftaran ditemukan.</p>
                  <p className="text-xs text-on-surface-variant/70 mt-1">
                    {search ? "Coba ubah kata kunci pencarian Anda." : "Belum ada pendaftaran di tabel festival_registrations."}
                  </p>
                </td>
              </tr>
            ) : (
              paginatedData.map(row => {
                const s = (row.payment_status || "").toLowerCase();
                const isPending = s === "pending";
                const isVerified = s === "verified";
                const isRejected = s === "rejected";
                const isMahasiswa = (row.kategori_peserta || "").toLowerCase().includes("mahasiswa");

                return (
                  <tr key={row.id} className="border-b border-white/5 hover:bg-surface-variant/30 transition-colors">
                    
                    {/* 1. Peserta & Kontak (Plain text, no mailto / wa.me links) */}
                    <td className="p-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-sm text-white">{row.nama_lengkap || "-"}</span>
                        <span className="text-xs text-slate-400 font-mono select-all">
                          {row.email || "-"}
                        </span>
                        <span className="text-xs text-slate-400 font-mono select-all">
                          {row.whatsapp || "-"}
                        </span>
                      </div>
                    </td>

                    {/* 2. Kategori & Identitas (Kategori badge + NRP + KTM modal trigger) */}
                    <td className="p-4 py-3">
                      <div className="flex flex-col gap-1.5 items-start">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                          isMahasiswa
                            ? "bg-primary/15 text-primary border-primary/30"
                            : "bg-surface-container-highest text-on-surface border-white/10"
                        }`}>
                          {row.kategori_peserta || "Umum"}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">
                          {row.nrp ? `NRP: ${row.nrp}` : "NRP: -"}
                        </span>
                        {row.ktm_url && (
                          <button
                            type="button"
                            onClick={() => setImagePreview({ url: row.ktm_url!, title: `Scan KTM - ${row.nama_lengkap}` })}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans font-semibold text-primary hover:text-primary-container bg-primary/10 border border-primary/25 hover:bg-primary/20 transition-all cursor-pointer"
                            title="Buka Scan KTM"
                          >
                            <FileText className="w-3 h-3" />
                            <span>Lihat KTM</span>
                          </button>
                        )}
                      </div>
                    </td>

                    {/* 3. Nomor Peserta & Tiket */}
                    <td className="p-4 py-3">
                      <div className="flex flex-col gap-1.5 items-start">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {row.nomor_bib != null ? (
                            <span className="inline-flex items-center gap-1 font-mono font-bold text-xs text-secondary bg-secondary/15 border border-secondary/35 px-2.5 py-1 rounded shadow-sm">
                              {formatFestivalParticipant(row.nomor_bib)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-on-surface-variant/60 bg-white/5 border border-white/10 px-2 py-0.5 rounded">
                              Pass Festival
                            </span>
                          )}
                          {row.is_primary === false && (
                            <span className="text-[10px] font-sans font-medium text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.2 rounded">
                              Anggota
                            </span>
                          )}
                        </div>

                        {row.ticket_qr_code ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setQrModalRecord(row)}
                              className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-secondary bg-secondary/10 hover:bg-secondary/25 border border-secondary/25 hover:border-secondary px-2.5 py-1 rounded transition-all cursor-pointer group"
                              title="Klik untuk melihat Visual QR Code & Status Scan"
                            >
                              <QrCode className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                              <span>{row.ticket_qr_code}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopyTicket(row.ticket_qr_code!, row.id)}
                              className="p-1 text-on-surface-variant hover:text-white transition-colors cursor-pointer rounded"
                              title="Salin Kode Tiket"
                            >
                              {copiedId === row.id ? (
                                <Check className="w-3.5 h-3.5 text-tertiary" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-on-surface-variant/50 text-xs font-mono">-</span>
                        )}
                      </div>
                    </td>

                    {/* 4. Nominal & Paket */}
                    <td className="p-4 py-3">
                      <div className="flex flex-col gap-1 items-start">
                        <span className="font-mono text-xs font-semibold text-[#ffd700]">
                          {new Intl.NumberFormat("id-ID", {
                            style: "currency",
                            currency: "IDR",
                            minimumFractionDigits: 0,
                          }).format(row.amount_paid || 0)}
                        </span>
                        {row.ticket_phase && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-secondary/15 text-secondary border border-secondary/30">
                            {row.ticket_phase.replace(/\s*\[PROMO:.*\]/, "")}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 5. Bukti Bayar (Image Preview Thumbnail stacked with rekening_pengirim) */}
                    <td className="p-4 py-3">
                      <div className="flex flex-col gap-1.5 items-start">
                        {row.bukti_transfer_url ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setImagePreview({ url: row.bukti_transfer_url!, title: `Bukti Transfer - ${row.nama_lengkap}` })}
                              className="group relative w-12 h-12 rounded-lg overflow-hidden border border-white/20 hover:border-secondary transition-all cursor-pointer bg-black/40 flex-shrink-0"
                              title="Klik untuk memperbesar bukti bayar"
                            >
                              <img 
                                src={row.bukti_transfer_url} 
                                alt="Bukti Transfer"
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-200"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = "none";
                                }}
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <Maximize2 className="w-3.5 h-3.5 text-white" />
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => setImagePreview({ url: row.bukti_transfer_url!, title: `Bukti Transfer - ${row.nama_lengkap}` })}
                              className="text-[11px] text-secondary hover:underline cursor-pointer flex items-center gap-1"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Lihat</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-on-surface-variant/50 text-xs">-</span>
                        )}
                        <span className="text-[11px] text-slate-400 font-mono truncate max-w-[140px]" title={row.rekening_pengirim || ""}>
                          {row.rekening_pengirim ? `a.n ${row.rekening_pengirim}` : "a.n -"}
                        </span>
                        {row.promo_proof_url && (
                          <button
                            type="button"
                            onClick={() => setImagePreview({ url: row.promo_proof_url!, title: `Bukti Promo - ${row.nama_lengkap}` })}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-300 hover:text-amber-200 mt-0.5 cursor-pointer"
                            title="Lihat Berkas Bukti Syarat Promo"
                          >
                            <FileCheck className="w-3 h-3 text-amber-400" />
                            <span>Bukti Promo</span>
                          </button>
                        )}
                      </div>
                    </td>

                    {/* 6. Status & Waktu (payment_status badge + literal WIB time) */}
                    <td className="p-4 py-3">
                      <div className="flex flex-col gap-1.5 items-start">
                        {isVerified && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-tertiary/15 text-tertiary border border-tertiary/30">
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>Verified</span>
                          </span>
                        )}
                        {isPending && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            <Clock className="w-3.5 h-3.5 animate-pulse" />
                            <span>Pending</span>
                          </span>
                        )}
                        {isRejected && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-error/15 text-error border border-error/30">
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Rejected</span>
                          </span>
                        )}
                        {!isVerified && !isPending && !isRejected && (
                          <span className="text-xs text-on-surface-variant font-mono">
                            {row.payment_status || "-"}
                          </span>
                        )}

                        <span className="text-[11px] text-slate-400 font-mono">
                          {formatDisplayWIB(row.created_at)}
                        </span>
                      </div>
                    </td>

                    {/* 7. Aksi (Sticky Right) */}
                    <td className="p-4 py-3 text-right sticky right-0 bg-surface/90 backdrop-blur-md border-l border-white/5">
                      <div className="flex items-center justify-end gap-2">
                        {isPending && (
                          <>
                            {/* Approve (Verify) Button */}
                            <button
                              type="button"
                              disabled={actionInProgress === row.id}
                              onClick={() => handleVerify(row)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-tertiary/20 hover:bg-tertiary text-tertiary hover:text-tertiary-container text-xs font-semibold transition-all border border-tertiary/30 cursor-pointer disabled:opacity-50"
                              title="Verifikasi Pembayaran & Terbitkan Tiket"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>Verify</span>
                            </button>

                            {/* Reject Button */}
                            <button
                              type="button"
                              disabled={actionInProgress === row.id}
                              onClick={() => handleReject(row)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-error/15 hover:bg-error text-error hover:text-white text-xs font-semibold transition-all border border-error/30 cursor-pointer disabled:opacity-50"
                              title="Tolak Pembayaran"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Reject</span>
                            </button>
                          </>
                        )}

                        {/* 'Lihat Detail' Button */}
                        <button
                          type="button"
                          onClick={() => setSelectedDetailRecord(row)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white text-xs font-semibold transition-all border border-white/15 cursor-pointer shadow-sm"
                          title="Buka Rincian Lengkap Pendaftar"
                        >
                          <Eye className="w-3.5 h-3.5 text-secondary" />
                          <span>Lihat Detail</span>
                        </button>
                      </div>
                    </td>

                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Control Bar */}
      <div className="flex-shrink-0 mt-auto p-4 bg-surface/60 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 select-none">
        {/* Left Side: Range & Total text indicator */}
        <div className="text-xs text-on-surface-variant font-poppins">
          {filteredData.length === 0 ? (
            <span>Menampilkan 0 peserta</span>
          ) : (
            <span>
              Menampilkan{" "}
              <strong className="text-white font-mono">{startIndex + 1}</strong>
              {" - "}
              <strong className="text-white font-mono">{endIndex}</strong>
              {" dari "}
              <strong className="text-white font-mono">
                {new Intl.NumberFormat("id-ID").format(filteredData.length)}
              </strong>{" "}
              peserta
            </span>
          )}
        </div>

        {/* Right Side: Navigation controls */}
        <div className="flex items-center gap-1.5">
          {/* [<<] First Page */}
          <button
            type="button"
            onClick={() => setCurrentPage(1)}
            disabled={validCurrentPage <= 1}
            className="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white disabled:opacity-25 disabled:cursor-not-allowed transition-all cursor-pointer"
            title="Halaman Pertama"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>

          {/* [<] Prev Page */}
          <button
            type="button"
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={validCurrentPage <= 1}
            className="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white disabled:opacity-25 disabled:cursor-not-allowed transition-all cursor-pointer"
            title="Halaman Sebelumnya"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Page indicator */}
          <div className="px-3.5 py-1 rounded-lg bg-black/40 border border-white/10 text-xs text-slate-300 font-mono">
            Page <span className="text-white font-bold">{validCurrentPage}</span> of{" "}
            <span className="text-white font-bold">{totalPages}</span>
          </div>

          {/* [>] Next Page */}
          <button
            type="button"
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={validCurrentPage >= totalPages}
            className="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white disabled:opacity-25 disabled:cursor-not-allowed transition-all cursor-pointer"
            title="Halaman Berikutnya"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* [>>] Last Page */}
          <button
            type="button"
            onClick={() => setCurrentPage(totalPages)}
            disabled={validCurrentPage >= totalPages}
            className="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white disabled:opacity-25 disabled:cursor-not-allowed transition-all cursor-pointer"
            title="Halaman Terakhir"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── ADMIN MODAL: VISUAL QR CODE & SCAN TRACKING ── */}
      {qrModalRecord && qrModalRecord.ticket_qr_code && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setQrModalRecord(null)}
        >
          <div 
            className="bg-[#0c1024]/95 border border-white/20 rounded-2xl p-6 md:p-8 max-w-sm w-full shadow-[0_0_50px_rgba(0,0,0,0.8)] relative flex flex-col items-center text-center animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setQrModalRecord(null)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-on-surface-variant hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Tutup Modal"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header info */}
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-secondary/15 text-secondary border border-secondary/30">
                E-Tiket Festival VOITSFEST 2026
              </span>
              <span className="font-mono text-xs font-bold text-secondary bg-secondary/10 border border-secondary/30 px-2.5 py-0.5 rounded-full">
                Nomor Peserta: {qrModalRecord.nomor_bib != null ? formatFestivalParticipant(qrModalRecord.nomor_bib) : "Menunggu Verifikasi"}
              </span>
            </div>
            <h3 className="text-xl font-bold text-white mb-0.5">
              {qrModalRecord.nama_lengkap}
            </h3>
            <p className="text-xs text-on-surface-variant mb-2 font-mono">
              {qrModalRecord.email} • {qrModalRecord.whatsapp}
            </p>

            {/* Dynamic Amount & Phase Badge */}
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="font-mono text-sm font-semibold text-[#ffd700]">
                {new Intl.NumberFormat("id-ID", {
                  style: "currency",
                  currency: "IDR",
                  minimumFractionDigits: 0,
                }).format(qrModalRecord.amount_paid || 0)}
              </span>
              {qrModalRecord.ticket_phase && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-secondary/15 text-secondary border border-secondary/30">
                  {qrModalRecord.ticket_phase}
                </span>
              )}
            </div>

            {/* Visual QR Code Container */}
            <div className="bg-white p-3.5 rounded-2xl shadow-2xl border border-white/30 mb-4 flex items-center justify-center">
              <QRCodeSVG 
                value={qrModalRecord.ticket_qr_code} 
                size={180} 
                level="H" 
                includeMargin={true} 
              />
            </div>

            {/* String Code Beneath QR Code */}
            <div className="flex items-center gap-2 bg-surface-container-highest/60 border border-white/15 px-3.5 py-1.5 rounded-lg mb-4">
              <span className="font-mono text-sm font-bold text-secondary tracking-wider">
                {qrModalRecord.ticket_qr_code}
              </span>
              <button
                type="button"
                onClick={() => handleCopyTicket(qrModalRecord.ticket_qr_code!, "modal")}
                className="p-1 text-on-surface-variant hover:text-white transition-colors cursor-pointer rounded"
                title="Salin Kode Tiket"
              >
                {copiedId === "modal" ? (
                  <Check className="w-3.5 h-3.5 text-tertiary" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {/* Scan Status Badge (scan_count) */}
            <div className="w-full flex flex-col items-center gap-2 pt-3 border-t border-white/10">
              <span className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold">
                Status Pemindaian Keamanan Gate
              </span>
              {(qrModalRecord.scan_count ?? 0) === 0 ? (
                <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Belum Di-scan (0)</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  <Clock className="w-3.5 h-3.5 animate-pulse" />
                  <span>Sudah Di-scan {qrModalRecord.scan_count}x</span>
                </div>
              )}

              {qrModalRecord.last_scanned_at && (
                <p className="text-[11px] font-mono text-on-surface-variant/80 mt-1">
                  Terakhir: {formatDisplayWIB(qrModalRecord.last_scanned_at)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAILORED FESTIVAL DETAIL MODAL ('Lihat Detail') ── */}
      {selectedDetailRecord && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto"
          onClick={() => setSelectedDetailRecord(null)}
        >
          <div 
            className="bg-[#0c1024] border border-white/20 rounded-2xl max-w-3xl w-full shadow-[0_0_60px_rgba(0,0,0,0.9)] relative flex flex-col my-auto max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200 text-left font-poppins"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-6 border-b border-white/10 bg-surface/80 flex items-start justify-between gap-4 sticky top-0 z-20 backdrop-blur-md">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-secondary/15 text-secondary border border-secondary/30">
                    Festival VOITSFEST 2026 • Detail Registrasi
                  </span>
                  {selectedDetailRecord.nomor_bib != null ? (
                    <span className="font-mono text-xs font-bold text-secondary bg-secondary/10 border border-secondary/30 px-2.5 py-0.5 rounded-full">
                      Nomor Peserta: {formatFestivalParticipant(selectedDetailRecord.nomor_bib)}
                    </span>
                  ) : (
                    <span className="font-mono text-xs text-on-surface-variant/60 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
                      Pass Festival
                    </span>
                  )}
                  {selectedDetailRecord.payment_status === "verified" ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-tertiary/15 text-tertiary border border-tertiary/30">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Verified</span>
                    </span>
                  ) : selectedDetailRecord.payment_status === "pending" ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                      <Clock className="w-3.5 h-3.5 animate-pulse" />
                      <span>Pending</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-error/15 text-error border border-error/30">
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Rejected</span>
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-bold text-white tracking-tight">
                  {selectedDetailRecord.nama_lengkap}
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  ID: {selectedDetailRecord.id} • Terdaftar: {formatDisplayWIB(selectedDetailRecord.created_at)}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {selectedDetailRecord.payment_status === "pending" && (
                  <div className="flex items-center gap-1.5 mr-2">
                    <button
                      type="button"
                      disabled={actionInProgress === selectedDetailRecord.id}
                      onClick={() => handleVerify(selectedDetailRecord)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-tertiary/20 hover:bg-tertiary text-tertiary hover:text-tertiary-container text-xs font-semibold transition-all border border-tertiary/30 cursor-pointer disabled:opacity-50"
                      title="Verifikasi Pembayaran"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Verify</span>
                    </button>
                    <button
                      type="button"
                      disabled={actionInProgress === selectedDetailRecord.id}
                      onClick={() => handleReject(selectedDetailRecord)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-error/15 hover:bg-error text-error hover:text-white text-xs font-semibold transition-all border border-error/30 cursor-pointer disabled:opacity-50"
                      title="Tolak Pembayaran"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Reject</span>
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedDetailRecord(null)}
                  className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title="Tutup Modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 text-left">
              
              {/* 1. Data Identitas & Kontak Peserta */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-4.5 space-y-3">
                <div className="flex items-center gap-2 text-white font-semibold text-sm">
                  <FileText className="w-4 h-4 text-secondary" />
                  <span>Identitas &amp; Kontak Peserta</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div className="space-y-1 bg-black/20 p-3 rounded-lg border border-white/5">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Email
                    </span>
                    <p className="text-xs font-mono text-white select-all">
                      {selectedDetailRecord.email || "-"}
                    </p>
                  </div>
                  <div className="space-y-1 bg-black/20 p-3 rounded-lg border border-white/5">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      WhatsApp
                    </span>
                    <p className="text-xs font-mono text-white select-all">
                      {selectedDetailRecord.whatsapp || "-"}
                    </p>
                  </div>
                  <div className="space-y-1 bg-black/20 p-3 rounded-lg border border-white/5">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Kategori &amp; Identitas
                    </span>
                    <p className="text-xs font-medium text-white">
                      {selectedDetailRecord.kategori_peserta || "Umum"} {selectedDetailRecord.nrp ? `• NRP: ${selectedDetailRecord.nrp}` : ""}
                    </p>
                    {selectedDetailRecord.departemen && (
                      <p className="text-[11px] text-slate-400">
                        Dept: {selectedDetailRecord.departemen}
                      </p>
                    )}
                  </div>
                </div>

                {/* KTM preview link if exists */}
                {selectedDetailRecord.ktm_url && (
                  <div className="pt-2 flex items-center justify-between bg-primary/10 border border-primary/20 p-3 rounded-lg">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-primary" />
                      <span className="text-xs text-white font-medium">Scan Kartu Pelajar / KTM Mahasiswa ITS Terlampir</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setImagePreview({ url: selectedDetailRecord.ktm_url!, title: `Scan KTM - ${selectedDetailRecord.nama_lengkap}` })}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-primary text-primary-container text-xs font-semibold hover:bg-primary-container hover:text-primary transition-all cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Lihat Dokumen KTM</span>
                    </button>
                  </div>
                )}
              </div>

              {/* 2. Gate Check-in / Presence (Event Day Tracking) */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-white font-semibold text-sm">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Gate Check-in / Kehadiran (Event Day Tracking)</span>
                  </div>
                  {selectedDetailRecord.ticket_qr_code && (
                    <button
                      type="button"
                      onClick={() => setQrModalRecord(selectedDetailRecord)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-secondary/15 hover:bg-secondary/25 border border-secondary/30 text-secondary text-xs font-semibold transition-all cursor-pointer"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>Buka Visual QR</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div className="space-y-1 bg-black/20 p-3.5 rounded-lg border border-white/5">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Status Validasi Tiket
                    </span>
                    {selectedDetailRecord.payment_status === "verified" ? (
                      <div className="inline-flex items-center gap-1 text-emerald-400 text-xs font-semibold">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Tiket Aktif &amp; Sah</span>
                      </div>
                    ) : selectedDetailRecord.payment_status === "pending" ? (
                      <div className="inline-flex items-center gap-1 text-amber-400 text-xs font-semibold">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Menunggu Verifikasi</span>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1 text-rose-400 text-xs font-semibold">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Tiket Ditolak / Tidak Sah</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1 bg-black/20 p-3.5 rounded-lg border border-white/5">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Jumlah Pemindaian Gate
                    </span>
                    {(selectedDetailRecord.scan_count ?? 0) === 0 ? (
                      <span className="text-xs font-mono font-medium text-slate-300">
                        0x (Belum Hadir di Gate)
                      </span>
                    ) : (
                      <span className="text-xs font-mono font-bold text-amber-400">
                        {selectedDetailRecord.scan_count}x (Telah Masuk Gate)
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 bg-black/20 p-3.5 rounded-lg border border-white/5">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Waktu Pemindaian Terakhir
                    </span>
                    <p className="text-xs font-mono text-white">
                      {selectedDetailRecord.last_scanned_at 
                        ? formatDisplayWIB(selectedDetailRecord.last_scanned_at) 
                        : "Belum pernah dipindai"}
                    </p>
                  </div>
                </div>

                {selectedDetailRecord.ticket_qr_code && (
                  <div className="flex items-center justify-between bg-black/30 p-3 rounded-lg border border-white/10">
                    <div className="flex items-center gap-2">
                      <QrCode className="w-4 h-4 text-secondary" />
                      <span className="text-xs text-slate-300">Kode Tiket:</span>
                      <strong className="text-xs font-mono text-secondary tracking-wider">
                        {selectedDetailRecord.ticket_qr_code}
                      </strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyTicket(selectedDetailRecord.ticket_qr_code!, "modal-code")}
                      className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer rounded"
                      title="Salin Kode Tiket"
                    >
                      {copiedId === "modal-code" ? (
                        <Check className="w-3.5 h-3.5 text-tertiary" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* 3. Payment & Identity Metadata */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2 text-white font-semibold text-sm">
                  <CreditCard className="w-4 h-4 text-secondary" />
                  <span>Metadata Transaksi &amp; Pembayaran</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
                  <div className="space-y-1 bg-black/20 p-3 rounded-lg border border-white/5">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Nominal Transfer
                    </span>
                    <p className="text-xs font-mono font-bold text-[#ffd700]">
                      {new Intl.NumberFormat("id-ID", {
                        style: "currency",
                        currency: "IDR",
                        minimumFractionDigits: 0,
                      }).format(selectedDetailRecord.amount_paid || 0)}
                    </p>
                  </div>
                  <div className="space-y-1 bg-black/20 p-3 rounded-lg border border-white/5">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Paket / Fase
                    </span>
                    <p className="text-xs font-semibold text-secondary truncate">
                      {selectedDetailRecord.ticket_phase || "Reguler"}
                    </p>
                  </div>
                  <div className="space-y-1 bg-black/20 p-3 rounded-lg border border-white/5">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Rekening Pengirim
                    </span>
                    <p className="text-xs font-mono text-white truncate" title={selectedDetailRecord.rekening_pengirim || ""}>
                      {selectedDetailRecord.rekening_pengirim || "-"}
                    </p>
                  </div>
                  <div className="space-y-1 bg-black/20 p-3 rounded-lg border border-white/5">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Waktu Registrasi (WIB)
                    </span>
                    <p className="text-xs font-mono text-white">
                      {formatDisplayWIB(selectedDetailRecord.created_at)}
                    </p>
                  </div>
                </div>

                {/* Bukti Transfer Thumbnail */}
                <div className="pt-2 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-semibold text-slate-300 block mb-0.5">
                      Bukti Transfer Pembayaran:
                    </span>
                    <p className="text-[11px] text-slate-400">
                      Pastikan nominal &amp; rekening pengirim sesuai dengan mutasi bank.
                    </p>
                  </div>
                  {selectedDetailRecord.bukti_transfer_url ? (
                    <button
                      type="button"
                      onClick={() => setImagePreview({ url: selectedDetailRecord.bukti_transfer_url!, title: `Bukti Transfer - ${selectedDetailRecord.nama_lengkap}` })}
                      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-secondary/15 hover:bg-secondary/25 border border-secondary/30 text-secondary text-xs font-semibold transition-all cursor-pointer w-fit"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Buka Bukti Transfer Penuh</span>
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400 italic">Tidak ada lampiran bukti transfer</span>
                  )}
                </div>

                {selectedDetailRecord.bukti_transfer_url && (
                  <div className="mt-2 rounded-xl overflow-hidden border border-white/15 bg-black/40 max-h-48 flex items-center justify-center p-2">
                    <img
                      src={selectedDetailRecord.bukti_transfer_url}
                      alt="Bukti Transfer Thumbnail"
                      className="max-h-44 object-contain rounded cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => setImagePreview({ url: selectedDetailRecord.bukti_transfer_url!, title: `Bukti Transfer - ${selectedDetailRecord.nama_lengkap}` })}
                    />
                  </div>
                )}

                {/* Bukti Persyaratan Promo */}
                {selectedDetailRecord.promo_proof_url && (
                  <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                        <FileCheck className="w-3.5 h-3.5 text-amber-400" />
                        Bukti Persyaratan Promo
                      </span>
                      <button
                        type="button"
                        onClick={() => setImagePreview({ url: selectedDetailRecord.promo_proof_url!, title: `Bukti Promo - ${selectedDetailRecord.nama_lengkap}` })}
                        className="text-[11px] text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Maximize2 className="w-3 h-3" />
                        <span>Perbesar</span>
                      </button>
                    </div>
                    <div 
                      onClick={() => setImagePreview({ url: selectedDetailRecord.promo_proof_url!, title: `Bukti Promo - ${selectedDetailRecord.nama_lengkap}` })}
                      className="rounded-xl overflow-hidden border border-amber-500/20 bg-black/40 max-h-48 flex items-center justify-center p-2 cursor-pointer hover:border-amber-400/50 transition-colors"
                    >
                      {selectedDetailRecord.promo_proof_url.toLowerCase().includes(".pdf") ? (
                        <iframe
                          src={selectedDetailRecord.promo_proof_url}
                          title="Preview Bukti Promo"
                          className="w-full h-40 pointer-events-none"
                        />
                      ) : (
                        <img
                          src={selectedDetailRecord.promo_proof_url}
                          alt="Bukti Promo Thumbnail"
                          className="max-h-44 object-contain rounded"
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 4. Group / Bundling Info (if applicable) */}
              {selectedDetailRecord.group_id && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-white font-semibold text-sm">
                      <Users className="w-4 h-4 text-cyan-400" />
                      <span>Informasi Grup &amp; Anggota Bundling ({groupMembers.length} Peserta)</span>
                    </div>
                    <span className="text-xs font-mono text-slate-400">
                      Group ID: {selectedDetailRecord.group_id.slice(0, 8)}...
                    </span>
                  </div>

                  {loadingGroupMembers ? (
                    <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                      <RotateCw className="w-3.5 h-3.5 animate-spin text-secondary" />
                      <span>Memuat data rombongan...</span>
                    </div>
                  ) : (
                    <div className="divide-y divide-white/5 border border-white/10 rounded-lg overflow-hidden">
                      {groupMembers.map((member, idx) => (
                        <div key={member.id} className="p-3 bg-black/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-white">{idx + 1}. {member.nama_lengkap}</span>
                              {member.is_primary ? (
                                <span className="px-1.5 py-0.2 rounded text-[10px] bg-secondary/20 text-secondary border border-secondary/30 font-semibold">
                                  Pendaftar Utama
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.2 rounded text-[10px] bg-cyan-500/15 text-cyan-400 border border-cyan-500/25">
                                  Anggota Tambahan
                                </span>
                              )}
                              <span className="text-[10px] text-slate-400 px-1.5 py-0.2 rounded bg-white/5 border border-white/10">
                                {member.kategori_peserta || "Umum"}
                              </span>
                            </div>
                            <p className="text-slate-400 font-mono text-[11px] mt-0.5">
                              {member.whatsapp} • {member.email} {member.nrp ? `• NRP: ${member.nrp}` : ""}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {member.nomor_bib != null ? (
                              <span className="font-mono text-xs font-bold text-secondary bg-secondary/15 border border-secondary/30 px-2 py-0.5 rounded">
                                {formatFestivalParticipant(member.nomor_bib)}
                              </span>
                            ) : (
                              <span className="font-mono text-[11px] text-slate-400 bg-white/5 px-2 py-0.5 rounded">
                                Pass Festival
                              </span>
                            )}
                            {member.ktm_url && (
                              <button
                                type="button"
                                onClick={() => setImagePreview({ url: member.ktm_url!, title: `Scan KTM - ${member.nama_lengkap}` })}
                                className="px-2 py-0.5 rounded text-[11px] bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30 cursor-pointer"
                              >
                                KTM
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* ── IMAGE PREVIEW MODAL ── */}
      {imagePreview && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setImagePreview(null)}
        >
          <div 
            className="bg-[#0c1024] border border-white/20 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-surface/60">
              <h4 className="text-sm font-semibold text-white truncate max-w-[80%]">
                {imagePreview.title}
              </h4>
              <div className="flex items-center gap-2">
                <a
                  href={imagePreview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                  title="Buka di tab baru"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={() => setImagePreview(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title="Tutup"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-4 overflow-auto flex items-center justify-center bg-black/60 min-h-[300px]">
              {imagePreview.url.toLowerCase().includes(".pdf") ? (
                <iframe
                  src={imagePreview.url}
                  title={imagePreview.title}
                  className="w-full h-[70vh] rounded-lg border-0 bg-white"
                />
              ) : (
                <img
                  src={imagePreview.url}
                  alt={imagePreview.title}
                  className="max-h-[70vh] max-w-full object-contain rounded-lg border border-white/10 shadow-lg"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
