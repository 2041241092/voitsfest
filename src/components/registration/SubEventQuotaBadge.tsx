"use client";

import React from "react";
import { SubEventTierConfig } from "@/lib/pricing";
import { QuotaStatus } from "@/lib/quota";
import { Ban, Clock, CheckCircle, Sparkles, Users, Tag } from "lucide-react";
import { formatRupiah } from "@/lib/pricing";

interface SubEventQuotaBadgeProps {
  eventName: string;
  pricing: SubEventTierConfig;
  quota: QuotaStatus | null;
  className?: string;
}

export default function SubEventQuotaBadge({
  eventName,
  pricing,
  quota,
  className = "",
}: SubEventQuotaBadgeProps) {
  const isPhaseUnlimited = pricing.phase_quota === null;
  const isEventUnlimited =
    pricing.event_quota === null || pricing.total_event_quota === null;

  const usedInPhase = quota ? quota.usedInPhase : 0;
  const remainingPhase = quota ? quota.remainingPhaseQuota : pricing.phase_quota;
  const isPhaseFull = quota ? quota.isPhaseFull : false;

  const effectiveEventQuota: number | null =
    pricing.event_quota ?? pricing.total_event_quota ?? pricing.max_quota ?? null;
  const totalRegistered = quota ? quota.totalEventRegistered : 0;
  const remainingEvent: number | null = quota ? quota.remainingEventQuota : effectiveEventQuota;
  const isEventFull = quota ? quota.isEventFull : false;

  const isDateActive = quota ? quota.isPhaseDateActive : true;
  const availabilityReason = quota ? quota.availabilityReason : "available";

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 1. Critical Availability Alert Banner if Guard Triggered */}
      {isEventFull ? (
        <div className="p-4 rounded-2xl bg-error/15 border-2 border-error/40 text-error flex items-start gap-3.5 shadow-[0_0_20px_rgba(239,68,68,0.2)] animate-in fade-in slide-in-from-top-2 duration-300">
          <Ban className="w-5 h-5 shrink-0 mt-0.5 text-error" />
          <div className="text-left">
            <h4 className="font-bold text-sm text-error uppercase tracking-wider">
              Sold Out / Kuota Habis
            </h4>
            <p className="text-xs text-error/90 mt-0.5 leading-relaxed">
              Total kuota pendaftaran reguler untuk <strong>{eventName}</strong> telah mencapai kapasitas maksimal (
              {effectiveEventQuota} slot). Silakan cek ketersediaan paket promo/bundling atau menunggu pengumuman berikutnya.
            </p>
          </div>
        </div>
      ) : isPhaseFull ? (
        <div className="p-4 rounded-2xl bg-amber-500/15 border-2 border-amber-500/40 text-amber-300 flex items-start gap-3.5 shadow-[0_0_20px_rgba(245,158,11,0.2)] animate-in fade-in slide-in-from-top-2 duration-300">
          <Ban className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
          <div className="text-left">
            <h4 className="font-bold text-sm text-amber-300 uppercase tracking-wider">
              Sold Out / Kuota Habis
            </h4>
            <p className="text-xs text-amber-200/90 mt-0.5 leading-relaxed">
              Kuota tiket reguler untuk fase <strong>{pricing.phase}</strong> ({eventName}) sudah habis terjual (
              {pricing.phase_quota} slot). Anda masih dapat mendaftar dengan paket promo/bundling aktif jika tersedia.
            </p>
          </div>
        </div>
      ) : !isDateActive ? (
        <div className="p-4 rounded-2xl bg-slate-800/60 border-2 border-slate-600/40 text-slate-300 flex items-start gap-3.5 animate-in fade-in duration-300">
          <Clock className="w-5 h-5 shrink-0 mt-0.5 text-slate-400" />
          <div className="text-left">
            <h4 className="font-bold text-sm text-slate-200 uppercase tracking-wider">
              {availabilityReason === "phase_date_not_started"
                ? "Periode Belum Dimulai"
                : "Periode Berakhir"}
            </h4>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              Jadwal registrasi untuk fase <strong>{pricing.phase}</strong> saat ini tidak aktif.
            </p>
          </div>
        </div>
      ) : null}

      {/* 2. Main Visual Pricing & Two-Tier Quota Metric Cards */}
      <div className="p-5 md:p-6 rounded-2xl bg-slate-950/70 backdrop-blur-xl border border-white/10 shadow-[0_4px_25px_rgba(0,0,0,0.5)] flex flex-col md:flex-row md:items-center justify-between gap-6">
        {/* Left: Phase & Price */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-secondary/15 text-secondary border border-secondary/30">
              <Sparkles className="w-3.5 h-3.5" />
              Fase: {pricing.phase}
            </span>

            {/* Status Pill */}
            {isEventFull || isPhaseFull ? (
              <span className="text-[11px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-error/20 text-error border border-error/30 uppercase inline-flex items-center gap-1">
                <Ban className="w-3 h-3" />
                Sold Out / Kuota Habis
              </span>
            ) : !isDateActive ? (
              <span className="text-[11px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-slate-500/20 text-slate-300 border border-slate-500/30 uppercase inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {availabilityReason === "phase_date_not_started" ? "Periode Belum Dimulai" : "Periode Berakhir"}
              </span>
            ) : (
              <span className="text-[11px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase inline-flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                Pendaftaran Aktif
              </span>
            )}
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-2xl md:text-3xl font-headline-md font-bold text-white tracking-tight">
              {formatRupiah(pricing.price)}
            </span>
            <span className="text-xs text-on-surface-variant font-sans">/ pendaftaran</span>
          </div>
        </div>

        {/* Right: Dual Quota Indicators */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0 md:min-w-[340px]">
          {/* Tier 1: Phase Quota */}
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant flex items-center gap-1">
                <Tag className="w-3 h-3 text-secondary" />
                Kuota Fase
              </span>
              <span className="font-mono text-xs font-bold text-white">
                {usedInPhase} /{" "}
                {isPhaseUnlimited ? (
                  <span className="text-secondary font-normal">Unlimited</span>
                ) : (
                  pricing.phase_quota
                )}
              </span>
            </div>
            <div className="text-[10px] text-right font-sans">
              <span
                className={
                  isPhaseFull
                    ? "text-error font-bold"
                    : remainingPhase !== null && remainingPhase <= 20
                    ? "text-amber-300 font-medium"
                    : "text-emerald-400 font-medium"
                }
              >
                {isPhaseFull
                  ? "Habis"
                  : remainingPhase !== null
                  ? `Sisa ${remainingPhase} Slot`
                  : "Tanpa Batas"}
              </span>
            </div>
          </div>

          {/* Tier 2: Overall Sub-Event Capacity */}
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant flex items-center gap-1">
                <Users className="w-3 h-3 text-secondary" />
                Kapasitas Event
              </span>
              <span className="font-mono text-xs font-bold text-white">
                {totalRegistered} /{" "}
                {isEventUnlimited ? (
                  <span className="text-secondary font-normal">Unlimited</span>
                ) : (
                  effectiveEventQuota
                )}
              </span>
            </div>
            <div className="text-[10px] text-right font-sans">
              <span
                className={
                  isEventFull
                    ? "text-error font-bold"
                    : remainingEvent !== null && remainingEvent <= 30
                    ? "text-amber-300 font-medium"
                    : "text-slate-300 font-medium"
                }
              >
                {isEventFull
                  ? "Penuh"
                  : remainingEvent !== null
                  ? `Sisa ${remainingEvent} Slot`
                  : "Tanpa Batas"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
