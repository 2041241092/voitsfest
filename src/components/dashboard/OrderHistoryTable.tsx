"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { 
  Ticket as TicketIcon, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  QrCode, 
  Copy, 
  Check, 
  X, 
  Search, 
  Filter, 
  Calendar, 
  CreditCard, 
  ShieldCheck, 
  User, 
  AlertCircle 
} from "lucide-react";
import { Ticket } from "@/types/database";
import { formatBIB, formatFestivalParticipant } from "@/lib/bib";
import { formatDisplayWIB } from "@/lib/timeUtils";
import { formatRupiah } from "@/lib/pricing";

interface OrderHistoryTableProps {
  tickets: Ticket[];
}

/**
 * Formats Supabase UTC created_at timestamp into local WIB (Asia/Jakarta / UTC+7).
 * Converts UTC instant (e.g. 11:07Z) correctly to 18:07 WIB without negative offset lag.
 */
function formatRegistrationDateWIB(dateValue: string | Date | null | undefined): string {
  if (!dateValue) return "-";
  try {
    const raw = String(dateValue).trim();
    if (!raw) return "-";

    const isExplicitUtc = raw.endsWith("Z") || /[+-]\d{2}(?::?\d{2})?$/.test(raw);
    const dateObj = dateValue instanceof Date 
      ? dateValue 
      : new Date(isExplicitUtc ? raw : raw.replace(" ", "T") + "Z");

    if (isNaN(dateObj.getTime())) return "-";

    const parts = new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(dateObj);

    const day = parts.find((p) => p.type === "day")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const year = parts.find((p) => p.type === "year")?.value;
    const hour = parts.find((p) => p.type === "hour")?.value;
    const minute = parts.find((p) => p.type === "minute")?.value;

    return `${day} ${month} ${year}, ${hour}:${minute} WIB`;
  } catch {
    return "-";
  }
}

export default function OrderHistoryTable({ tickets }: OrderHistoryTableProps) {
  const [filter, setFilter] = useState<"all" | "verified" | "pending" | "rejected">("all");
  const [search, setSearch] = useState("");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [modalTicket, setModalTicket] = useState<Ticket | null>(null);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(text);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  // Status counts for tabs
  const counts = useMemo(() => {
    let verified = 0;
    let pending = 0;
    let rejected = 0;

    tickets.forEach((t) => {
      const s = (t.payment_status || "pending").toLowerCase();
      if (s === "verified") verified++;
      else if (s === "pending") pending++;
      else if (s === "rejected") rejected++;
    });

    return { all: tickets.length, verified, pending, rejected };
  }, [tickets]);

  // Filter & Search logic
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      const s = (t.payment_status || "pending").toLowerCase();
      if (filter !== "all" && s !== filter) return false;

      if (!search.trim()) return true;
      const q = search.toLowerCase();

      const name = (t.nama_lengkap || "").toLowerCase();
      const token = (t.token || "").toLowerCase();
      const phase = (t.ticket_phase || "").toLowerCase();
      const eventName = t.event_type === "FESTIVAL" ? "festival" : "colorfun run";
      const bibStr = t.nomor_bib != null
        ? (t.event_type === "FESTIVAL"
            ? formatFestivalParticipant(t.nomor_bib).toLowerCase()
            : formatBIB(t.nomor_bib).toLowerCase())
        : "";

      return (
        name.includes(q) ||
        token.includes(q) ||
        phase.includes(q) ||
        eventName.includes(q) ||
        bibStr.includes(q)
      );
    });
  }, [tickets, filter, search]);

  if (tickets.length === 0) {
    return (
      <div className="bg-slate-950/60 backdrop-blur-xl rounded-2xl p-8 text-center text-slate-300 border-dashed border-white/15 border-2 shadow-[0_4px_25px_rgba(0,0,0,0.5)]">
        Belum ada riwayat pendaftaran atau pesanan tiket. Pilih sub-event di atas untuk memulai pendaftaran!
      </div>
    );
  }

  return (
    <section className="bg-surface/50 backdrop-blur-xl border border-white/15 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
      {/* Section Header */}
      <div className="p-6 border-b border-white/10 flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-surface/60">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2.5">
            <TicketIcon className="w-5 h-5 text-secondary" />
            <span>Riwayat Pendaftaran &amp; Tiket Saya</span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/10 text-slate-300 border border-white/15">
              {tickets.length} Tiket
            </span>
          </h3>
          <p className="text-xs text-on-surface-variant mt-1">
            Status verifikasi tiket, nomor identitas resmi (BIB / Nomor Peserta), dan QR Code check-in.
          </p>
        </div>

        {/* Search Filter */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Cari ID, nama, nomor peserta..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-surface border border-outline-variant rounded-xl text-xs text-on-surface focus:border-secondary outline-none transition-all font-poppins"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-6 py-3 border-b border-white/10 bg-surface/30 flex items-center justify-between overflow-x-auto gap-4">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-on-surface-variant mr-1" />
          {(["all", "verified", "pending", "rejected"] as const).map((tab) => (
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
              <span>{tab === "all" ? "Semua Status" : tab}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                filter === tab ? "bg-black/20 text-black font-bold" : "bg-white/10 text-white"
              }`}>
                {counts[tab]}
              </span>
            </button>
          ))}
        </div>

        <span className="text-xs text-on-surface-variant font-mono whitespace-nowrap">
          Menampilkan {filteredTickets.length} data
        </span>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse whitespace-nowrap font-poppins">
          <thead>
            <tr className="border-b border-white/10 bg-slate-900/90 text-on-surface-variant text-[11px] uppercase tracking-wider">
              <th className="p-4 py-3.5 font-semibold">Sub-Event &amp; Peserta</th>
              <th className="p-4 py-3.5 font-semibold">Nomor Identitas</th>
              <th className="p-4 py-3.5 font-semibold">Paket &amp; Nominal</th>
              <th className="p-4 py-3.5 font-semibold">Status Pembayaran</th>
              <th className="p-4 py-3.5 font-semibold">Waktu Pendaftaran (WIB)</th>
              <th className="p-4 py-3.5 font-semibold text-right">Tiket / Aksi</th>
            </tr>
          </thead>

          <tbody className="text-sm divide-y divide-white/5">
            {filteredTickets.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-12 text-center text-on-surface-variant">
                  <p className="text-sm font-medium">Tidak ada data pendaftaran yang sesuai dengan filter.</p>
                  <p className="text-xs text-on-surface-variant/70 mt-1">
                    Coba ganti filter status atau kata kunci pencarian Anda.
                  </p>
                </td>
              </tr>
            ) : (
              filteredTickets.map((ticket) => {
                const s = (ticket.payment_status || "pending").toLowerCase();
                const isVerified = s === "verified";
                const isPending = s === "pending";
                const isRejected = s === "rejected";
                const isFestival = ticket.event_type === "FESTIVAL";

                // Applied promo badge detection from ticket_phase (e.g. "[PROMO:VOITS50]")
                const promoMatch = ticket.ticket_phase?.match(/\[PROMO:([^:\]]+)\]/);
                const cleanPhase = ticket.ticket_phase?.replace(/\s*\[PROMO:.*?\]/, "");

                return (
                  <tr key={ticket.id} className="border-b border-white/5 hover:bg-surface-variant/30 transition-colors">
                    
                    {/* 1. Sub-Event & Peserta */}
                    <td className="p-4 py-3">
                      <div className="flex flex-col gap-1 items-start">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                            isFestival
                              ? "bg-secondary/15 text-secondary border-secondary/30"
                              : "bg-[#87CEEB]/15 text-[#87CEEB] border-[#87CEEB]/30"
                          }`}>
                            {(ticket.event_type as string) === "FESTIVAL"
                              ? "Festival"
                              : (ticket.event_type as string) === "CFR"
                              ? "ColorFun Run"
                              : (ticket.event_type as string) === "SEMINAR"
                              ? "Seminar"
                              : (ticket.event_type as string) === "BCC"
                              ? "BCC"
                              : (ticket.event_type as string) === "BPC"
                              ? "BPC"
                              : (ticket.event_type as string) === "TENANT"
                              ? "Tenant"
                              : (ticket.event_type || "Event")}
                          </span>
                          {ticket.is_primary === false && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-cyan-500/15 text-cyan-300 border border-cyan-500/25">
                              Anggota
                            </span>
                          )}
                        </div>
                        <span className="font-semibold text-sm text-white">
                          {ticket.nama_lengkap || (isFestival ? "VOITSFEST Main Festival" : "ColorFun Run 5K")}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          ID: {ticket.id.slice(0, 8)}...
                        </span>
                      </div>
                    </td>

                    {/* 2. Sub-Event Specific Identifier: 'Nomor BIB' vs 'Nomor Peserta' */}
                    <td className="p-4 py-3">
                      <div className="flex flex-col gap-1 items-start">
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                          {isFestival ? "Nomor Peserta" : "Nomor BIB"}
                        </span>
                        {ticket.nomor_bib != null ? (
                          <span className="font-mono text-xs font-bold text-secondary bg-secondary/15 border border-secondary/35 px-2.5 py-1 rounded shadow-sm">
                            {isFestival
                              ? formatFestivalParticipant(ticket.nomor_bib)
                              : `#${formatBIB(ticket.nomor_bib)}`}
                          </span>
                        ) : (
                          <span className="font-mono text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                            Menunggu Verifikasi
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 3. Paket & Nominal */}
                    <td className="p-4 py-3">
                      <div className="flex flex-col gap-1 items-start">
                        <span className="font-mono text-xs font-bold text-[#ffd700]">
                          {formatRupiah(ticket.amount_paid || 0)}
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {cleanPhase && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-white/5 text-slate-300 border border-white/10">
                              {cleanPhase}
                            </span>
                          )}
                          {promoMatch && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-secondary/20 text-secondary border border-secondary/35">
                              Promo: {promoMatch[1]}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* 4. Status Pembayaran */}
                    <td className="p-4 py-3">
                      <div className="flex flex-col gap-1 items-start">
                        {isVerified && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Verified / Sah</span>
                          </span>
                        )}
                        {isPending && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            <Clock className="w-3.5 h-3.5 animate-pulse" />
                            <span>Menunggu Verifikasi</span>
                          </span>
                        )}
                        {isRejected && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Ditolak</span>
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 5. Waktu Pendaftaran (WIB) */}
                    <td className="p-4 py-3">
                      <span className="text-xs text-slate-300 font-mono">
                        {formatRegistrationDateWIB(ticket.created_at)}
                      </span>
                    </td>

                    {/* 6. Tiket / Aksi */}
                    <td className="p-4 py-3 text-right">
                      {isVerified && ticket.token ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setModalTicket(ticket)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/15 hover:bg-secondary/25 border border-secondary/30 text-secondary text-xs font-semibold transition-all cursor-pointer shadow-sm hover:scale-105"
                            title="Buka Visual E-Ticket &amp; QR Code"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                            <span>Buka QR</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopy(ticket.token!)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                            title="Salin Kode Tiket"
                          >
                            {copiedToken === ticket.token ? (
                              <Check className="w-3.5 h-3.5 text-tertiary" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      ) : isPending ? (
                        <span className="text-[11px] text-amber-300/80 font-mono italic">
                          Menunggu Verifikasi
                        </span>
                      ) : (
                        <Link
                          href={isFestival ? "/festival/checkout" : "/colorfun/checkout"}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-bold border border-rose-500/40 transition-colors"
                        >
                          Daftar Ulang
                        </Link>
                      )}
                    </td>

                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── MODAL: HIGH-RES VISUAL QR E-TICKET ── */}
      {modalTicket && modalTicket.token && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setModalTicket(null)}
        >
          <div 
            className="bg-slate-950/90 backdrop-blur-xl border border-white/15 rounded-2xl p-6 md:p-8 max-w-sm w-full shadow-[0_4px_30px_rgba(0,0,0,0.8)] relative flex flex-col items-center text-center animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setModalTicket(null)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Tutup Modal"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Event & Identifier Header Badges */}
            <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
              <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-secondary/15 text-secondary border border-secondary/30">
                {modalTicket.event_type === "FESTIVAL" ? "VOITSFEST 2026 FESTIVAL" : "COLORFUN RUN (5K)"}
              </span>
              <span className="px-3 py-1 rounded-full text-[11px] font-mono font-bold uppercase tracking-wider bg-secondary/20 text-secondary border border-secondary/40 shadow-[0_0_12px_rgba(240,192,77,0.25)]">
                {modalTicket.event_type === "FESTIVAL"
                  ? `Nomor Peserta: ${modalTicket.nomor_bib != null ? formatFestivalParticipant(modalTicket.nomor_bib) : "Menunggu Verifikasi"}`
                  : `BIB: ${modalTicket.nomor_bib != null ? `#${formatBIB(modalTicket.nomor_bib)}` : "Menunggu Verifikasi"}`}
              </span>
            </div>

            <h3 className="text-xl font-bold text-white mb-1">
              {modalTicket.event_type === "FESTIVAL" ? "Official Festival Pass" : "ColorFun Run E-Ticket"}
            </h3>
            <p className="text-xs text-on-surface-variant mb-3">
              Tunjukkan QR Code ini kepada Petugas Security di Gate Masuk.
            </p>

            {/* Dynamic Amount & Phase Badge */}
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="font-mono text-sm font-bold text-[#ffd700]">
                {formatRupiah(modalTicket.amount_paid || 0)}
              </span>
              {modalTicket.ticket_phase && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-secondary/15 text-secondary border border-secondary/30">
                  {modalTicket.ticket_phase.replace(/\s*\[PROMO:.*?\]/, "")}
                </span>
              )}
            </div>

            {/* High-res Visual QR Code */}
            <div className="bg-white p-4 rounded-2xl shadow-2xl border border-white/30 mb-4 flex items-center justify-center">
              <QRCodeSVG 
                value={modalTicket.token} 
                size={220} 
                level="H" 
                includeMargin={true} 
              />
            </div>

            {/* String Code Beneath QR Code */}
            <div className="flex items-center gap-2 bg-surface-container-highest/60 border border-white/15 px-3.5 py-1.5 rounded-lg mb-4">
              <span className="font-mono text-sm font-bold text-secondary tracking-wider">
                {modalTicket.token}
              </span>
              <button
                type="button"
                onClick={() => handleCopy(modalTicket.token!)}
                className="p-1 text-on-surface-variant hover:text-white transition-colors cursor-pointer rounded"
                title="Salin Kode Tiket"
              >
                {copiedToken === modalTicket.token ? (
                  <Check className="w-3.5 h-3.5 text-tertiary" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {/* Scan Status Badge (scan_count) */}
            <div className="w-full flex flex-col items-center gap-1.5 pt-3 border-t border-white/10">
              <span className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold">
                Status Pemindaian Tiket
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Sudah di-scan: {modalTicket.scan_count || 0} kali
              </span>

              {modalTicket.scanned_at && (
                <p className="text-[11px] font-mono text-on-surface-variant/80 mt-0.5">
                  Waktu Scan Terakhir: {formatDisplayWIB(modalTicket.scanned_at)}
                </p>
              )}
            </div>

          </div>
        </div>
      )}
    </section>
  );
}
