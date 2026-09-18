"use client";

import React from "react";
import { QRCodeSVG } from "qrcode.react";
import { ExternalLink } from "lucide-react";

interface WhatsAppChannelSectionProps {
  className?: string;
  helperText?: string;
}

const WA_CHANNEL_URL = "https://its.id/m/CHANNELVOITSFEST2026";

/**
 * WhatsApp SVG icon for authentic branding
 */
function WhatsAppIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.301-.15-1.78-.878-2.056-.978-.275-.1-.476-.15-.677.15-.2.301-.776.978-.952 1.179-.175.2-.351.226-.652.075-.301-.15-1.272-.469-2.423-1.496-.895-.799-1.5-1.786-1.676-2.087-.175-.301-.019-.464.132-.614.136-.135.301-.351.451-.527.15-.175.2-.301.3-.501.101-.2.05-.376-.025-.526-.075-.15-.677-1.632-.927-2.235-.244-.588-.492-.508-.677-.518l-.577-.01c-.2 0-.526.075-.802.376-.276.301-1.053 1.028-1.053 2.508 0 1.479 1.078 2.908 1.228 3.109.15.2 2.122 3.241 5.141 4.545.718.31 1.279.496 1.716.635.722.23 1.378.197 1.898.12.579-.088 1.78-.727 2.03-1.43.251-.702.251-1.303.176-1.43-.076-.126-.276-.201-.577-.352z" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.477 2 12c0 1.892.525 3.662 1.438 5.176L2 22l4.981-1.408A9.957 9.957 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18.2a8.16 8.16 0 01-4.226-1.176l-.303-.18-2.956.835.84-2.883-.198-.315A8.16 8.16 0 1112 20.2z"
      />
    </svg>
  );
}

export default function WhatsAppChannelSection({
  className = "",
  helperText = "Scan kode QR di atas atau klik tombol di bawah untuk bergabung ke saluran resmi WhatsApp agar tidak ketinggalan info penukaran race pack / tiket fisik, rundown, dan pengumuman penting lainnya.",
}: WhatsAppChannelSectionProps) {
  return (
    <div
      className={`backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl p-6 text-left ${className}`}
    >
      {/* Header Section */}
      <div className="flex items-center gap-3 mb-5 pb-3 border-b border-white/10">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(16,185,129,0.2)]">
          <WhatsAppIcon className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-base md:text-lg font-bold text-white tracking-tight">
            Gabung Saluran WhatsApp Resmi
          </h3>
          <p className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">
            Official Information Channel
          </p>
        </div>
      </div>

      {/* Desktop: 2-column flex/grid | Mobile: Centered vertical stack */}
      <div className="flex flex-col md:flex-row items-center gap-6">
        {/* Left Column: Scannable QR Code badge with high-contrast frame */}
        <div className="p-3 bg-white rounded-xl shadow-lg w-40 h-40 mx-auto md:mx-0 flex items-center justify-center shrink-0 transition-transform duration-300 hover:scale-[1.02]">
          <QRCodeSVG
            value={WA_CHANNEL_URL}
            size={136}
            level="M"
            includeMargin={false}
            className="w-full h-full"
          />
        </div>

        {/* Right Column: Explanation text & Direct action CTA button */}
        <div className="flex flex-col justify-between items-center md:items-start text-center md:text-left flex-grow space-y-4">
          <p className="text-xs md:text-sm text-slate-300 font-poppins leading-relaxed">
            {helperText}
          </p>

          <a
            href={WA_CHANNEL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-semibold py-2.5 px-5 rounded-xl transition-all duration-200 shadow-lg hover:shadow-emerald-500/30 flex items-center justify-center gap-2 text-xs md:text-sm w-full md:w-auto cursor-pointer"
          >
            <WhatsAppIcon className="w-4 h-4 shrink-0" />
            <span>Gabung Saluran WhatsApp</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-80 shrink-0" />
          </a>
        </div>
      </div>
    </div>
  );
}
