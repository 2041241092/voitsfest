"use client";

import React from "react";
import { QRCodeSVG } from "qrcode.react";
import { ExternalLink } from "lucide-react";

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

export default function WhatsAppDashboardBanner() {
  return (
    <section className="mb-14 relative overflow-hidden rounded-2xl backdrop-blur-md bg-slate-900/60 border border-slate-800/80 hover:border-emerald-500/30 transition-all p-6 md:p-8 shadow-xl">
      {/* Subtle ambient glow blurs in background corners */}
      <div className="absolute -top-24 -right-24 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Content Layout */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
        {/* Left / Content Side */}
        <div className="flex-1 text-center md:text-left">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-4">
            <WhatsAppIcon className="w-3.5 h-3.5 shrink-0" />
            <span>Saluran Resmi WhatsApp</span>
          </div>

          {/* Heading */}
          <h3 className="text-2xl md:text-3xl font-bold text-white mb-3 tracking-tight font-poppins">
            Jangan Lewatkan Info Penting &amp; Update Event!
          </h3>

          {/* Description Text */}
          <p className="text-sm md:text-base text-slate-300 font-poppins leading-relaxed mb-6 max-w-xl">
            Gabung ke saluran resmi WhatsApp kami untuk mendapatkan pengumuman langsung seputar jadwal penukaran race pack / gelang fisik, rundown acara, denah venue, dan informasi penting lainnya secara real-time.
          </p>

          {/* Direct Action Button */}
          <a
            href={WA_CHANNEL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-6 py-3 rounded-xl shadow-lg hover:shadow-emerald-500/25 active:scale-95 transition-all text-sm w-full sm:w-fit cursor-pointer"
          >
            <WhatsAppIcon className="w-4 h-4 shrink-0" />
            <span>Gabung Saluran WhatsApp</span>
            <ExternalLink className="w-4 h-4 opacity-80 shrink-0" />
          </a>
        </div>

        {/* Right / QR Code Side */}
        <div className="flex flex-col items-center shrink-0">
          <div className="bg-white p-3.5 rounded-2xl shadow-2xl w-44 h-44 flex items-center justify-center mx-auto md:mx-0 shrink-0 transition-transform duration-300 hover:scale-[1.02]">
            <QRCodeSVG
              value={WA_CHANNEL_URL}
              size={148}
              level="M"
              includeMargin={false}
              className="w-full h-full"
            />
          </div>
          <p className="text-xs text-slate-400 text-center mt-2 font-poppins">
            Arahkan kamera HP Anda untuk memindai
          </p>
        </div>
      </div>
    </section>
  );
}
