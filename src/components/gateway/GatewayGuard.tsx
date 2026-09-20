"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { GatewayEvent, isGatewayOpen, EVENT_NAMES } from "@/lib/gateways";
import { Loader2, ShieldAlert, ArrowLeft } from "lucide-react";

interface GatewayGuardProps {
  event: GatewayEvent;
  children: React.ReactNode;
}

function GatewayGuardLoading({ eventName }: { eventName?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0b1026] text-on-background px-4 font-poppins">
      <div className="flex flex-col items-center gap-4 text-center max-w-md p-8 rounded-2xl bg-slate-950/60 backdrop-blur-xl border border-white/10 shadow-[0_4px_25px_rgba(0,0,0,0.5)]">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-2 border-secondary/20 border-t-secondary animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-secondary animate-pulse" />
          </div>
        </div>
        <div>
          <h3 className="font-semibold text-lg text-white mb-1">
            Verifikasi Akses Registrasi
          </h3>
          <p className="text-xs text-primary-fixed-dim tracking-wide">
            {eventName || "Memeriksa status pendaftaran dan validitas promo..."}
          </p>
        </div>
      </div>
    </div>
  );
}

function GatewayGuardContent({ event, children }: GatewayGuardProps) {
  const [checking, setChecking] = useState(true);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function verifyGateway() {
      try {
        // Centralized Gatekeeper: Form rendering access relies strictly and exclusively
        // on the sub-event toggle status in 'Registration Status (Gateways)'
        const open = await isGatewayOpen(event);
        if (!isMounted) return;

        if (!open) {
          setBlockedReason("Pendaftaran untuk sub-event ini sedang ditutup oleh panitia.");
        } else {
          setBlockedReason(null);
        }
      } catch (err) {
        console.error("Gateway guard verification error:", err);
        if (isMounted) {
          setBlockedReason(null);
        }
      } finally {
        if (isMounted) {
          setChecking(false);
        }
      }
    }

    verifyGateway();

    return () => {
      isMounted = false;
    };
  }, [event]);

  if (checking) {
    return <GatewayGuardLoading eventName={EVENT_NAMES[event]} />;
  }

  // If checks failed: Do not render the form. Display locked screen notice with button to dashboard.
  if (blockedReason) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0b1026] text-on-background px-4 py-16 font-poppins relative overflow-hidden">
        {/* Ambient glow backgrounds */}
        <div className="absolute top-1/4 -left-20 w-80 h-80 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col items-center gap-6 text-center max-w-lg w-full p-8 md:p-10 rounded-2xl bg-slate-950/80 backdrop-blur-xl border border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.7)] relative z-10 animate-in fade-in zoom-in-95 duration-300">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.2)]">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/5 text-slate-300 border border-white/10">
              {EVENT_NAMES[event] || "Sub-Event VOITSFEST"}
            </span>
            <h2 className="text-xl md:text-2xl font-bold text-white leading-snug">
              Pendaftaran untuk sub-event ini sedang ditutup atau kuota promo telah habis
            </h2>
            <p className="text-sm text-slate-300 max-w-md mx-auto leading-relaxed pt-1">
              {blockedReason}
            </p>
          </div>

          <div className="pt-2 w-full">
            <Link
              href="/dashboard"
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-secondary hover:bg-secondary/90 text-primary-container font-bold text-sm tracking-wider uppercase transition-all shadow-[0_4px_15px_rgba(240,192,77,0.3)] hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Kembali ke Dashboard</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function GatewayGuard(props: GatewayGuardProps) {
  return (
    <Suspense fallback={<GatewayGuardLoading eventName={EVENT_NAMES[props.event]} />}>
      <GatewayGuardContent {...props} />
    </Suspense>
  );
}

export function useGatewayGuard(event: GatewayEvent) {
  const [checking, setChecking] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    isGatewayOpen(event).then((open) => {
      if (isMounted) {
        setIsOpen(open);
        setChecking(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [event]);

  return { checking, isOpen };
}

