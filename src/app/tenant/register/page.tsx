"use client";

import { useState } from "react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import CustomHeading from "@/components/ui/CustomHeading";
import { createClient } from "@/lib/supabase/client";
import { 
  UploadCloud, 
  CheckCircle, 
  ArrowRight, 
  Info,
  FileCheck,
  FileText,
  Store,
  ChefHat,
  X,
  FileSpreadsheet
} from "lucide-react";
import Link from "next/link";
import GatewayGuard from "@/components/gateway/GatewayGuard";
import { checkQuotaAvailability, dispatchQuotaRefresh } from "@/lib/quota";
import { useLivePricingAndQuota } from "@/hooks/useLivePricingAndQuota";
import SubEventQuotaBadge from "@/components/registration/SubEventQuotaBadge";
import WhatsAppChannelSection from "@/components/registration/WhatsAppChannelSection";
import { validatePreCheckoutGuard } from "@/app/actions/checkout";

export default function TenantRegistrationPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dynamic Pricing & Two-Tier Quota via Supabase Realtime
  const {
    pricing: cmsPricing,
    quota: subQuota,
    isPhaseFull,
    isEventFull,
    isAvailable,
    availabilityReason,
  } = useLivePricingAndQuota("tenant");

  // SECTION 1: Profil Penanggung Jawab & Usaha
  const [namaLengkap, setNamaLengkap] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [alamatDomisili, setAlamatDomisili] = useState("");
  const [namaUsaha, setNamaUsaha] = useState("");
  const [rentangHarga, setRentangHarga] = useState("");
  const [akunMedsos, setAkunMedsos] = useState("");
  const [deskripsiUsaha, setDeskripsiUsaha] = useState("");
  const [scanKtm, setScanKtm] = useState<File | null>(null);
  const [kategoriUsaha, setKategoriUsaha] = useState("");

  // SECTION 2: Operasional & Pemberkasan
  const [metodePersiapan, setMetodePersiapan] = useState("");
  const [logoUsaha, setLogoUsaha] = useState<File | null>(null);
  const [fotoProduk, setFotoProduk] = useState<File | null>(null);
  const [fotoStand, setFotoStand] = useState<File | null>(null);
  const [katalogProduk, setKatalogProduk] = useState<File | null>(null);

  // SECTION 3: Persetujuan & Finalisasi
  const [agreedRules, setAgreedRules] = useState(false);
  const [agreedSelection, setAgreedSelection] = useState(false);

  const supabase = createClient();

  const handleFileUpload = async (file: File, path: string): Promise<string> => {
    const fileExt = file.name.split(".").pop();
    const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
    const filePath = `${path}/${fileName}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from("registrations")
        .upload(filePath, file);

      if (uploadError) {
        console.warn(`Storage upload note for ${file.name}:`, uploadError.message);
      }
    } catch (storageErr) {
      console.warn(`Storage upload exception for ${file.name}:`, storageErr);
    }

    const { data: publicUrlData } = supabase.storage
      .from("registrations")
      .getPublicUrl(filePath);

    return publicUrlData.publicUrl;
  };

  const isFormValid = agreedRules && agreedSelection;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!agreedRules || !agreedSelection) {
      setError("Kedua persetujuan pada bagian akhir wajib dicentang sebelum mengirimkan pendaftaran.");
      return;
    }

    if (!scanKtm) {
      setError("File Scan KTM/KTP (PDF) wajib diunggah.");
      return;
    }

    if (!kategoriUsaha) {
      setError("Kategori Usaha wajib dipilih.");
      return;
    }

    if (!metodePersiapan) {
      setError("Metode Persiapan / Pemasakan di Stand wajib dipilih.");
      return;
    }

    if (!logoUsaha) {
      setError("Logo Usaha wajib diunggah.");
      return;
    }

    if (!fotoProduk) {
      setError("Foto Produk wajib diunggah.");
      return;
    }

    if (!katalogProduk) {
      setError("Katalog Produk / Daftar Menu wajib diunggah.");
      return;
    }

    if (!isAvailable) {
      setError(
        isEventFull
          ? "Sold Out / Kapasitas Penuh. Total kuota pendaftaran tenant telah mencapai batas maksimal."
          : isPhaseFull
          ? "Kuota Fase Penuh. Kuota pendaftaran tenant fase ini sudah habis."
          : availabilityReason === "phase_date_not_started"
          ? "Periode Belum Dimulai. Pendaftaran tenant belum dibuka."
          : "Periode Berakhir. Periode pendaftaran tenant telah berakhir."
      );
      return;
    }

    // Lifecycle Rule 1: Server-Side Pre-Checkout Guard
    const serverGuard = await validatePreCheckoutGuard("tenant", 1);
    if (!serverGuard.valid) {
      setError(serverGuard.error || "Pendaftaran tidak dapat diproses karena batas kuota atau periode aktif.");
      return;
    }

    // Quota Availability Check with Guard 1 & Guard 2
    const quotaCheck = await checkQuotaAvailability("tenant", 1);
    if (!quotaCheck.available) {
      setError(quotaCheck.error || "Kuota pendaftaran tenant telah penuh. Silakan hubungi panitia.");
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Upload files
      const scanKtmUrl = await handleFileUpload(scanKtm, "tenant/ktm");
      const logoUrl = await handleFileUpload(logoUsaha, "tenant/logo");
      const fotoProdukUrl = await handleFileUpload(fotoProduk, "tenant/products");
      const katalogUrl = await handleFileUpload(katalogProduk, "tenant/catalog");
      if (fotoStand) {
        await handleFileUpload(fotoStand, "tenant/booth");
      }

      // 2. Insert into tenant_registrations table with pending status as defined in prd.md
      const { error: insertError } = await supabase
        .from("tenant_registrations")
        .insert({
          tenant_name: namaUsaha,
          owner_name: namaLengkap,
          email: email,
          phone: phone,
          category: kategoriUsaha,
          payment_proof_url: scanKtmUrl || katalogUrl || logoUrl || null,
          status: "pending"
        });

      if (insertError) {
        throw new Error(insertError.message || "Gagal menyimpan pendaftaran tenant.");
      }

      // Real-time Quota Synchronization Dispatch
      dispatchQuotaRefresh();

      setIsSuccess(true);
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan saat memproses pendaftaran. Silakan coba lagi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="text-on-background font-poppins overflow-x-hidden relative min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-grow flex items-center justify-center pt-28 pb-16 px-4 relative z-10">
          <div className="bg-slate-950/60 backdrop-blur-xl border border-white/10 border-t-4 border-t-secondary-fixed shadow-[0_4px_25px_rgba(0,0,0,0.5)] max-w-xl md:max-w-2xl w-full p-6 md:p-8 rounded-2xl text-center animate-in fade-in zoom-in-95 duration-500">
            <CheckCircle className="w-20 h-20 text-secondary-fixed mx-auto mb-6 drop-shadow-[0_0_15px_rgba(176,198,255,0.5)]" />
            <h1 className="text-3xl font-bold text-white mb-4 tracking-tight">Pendaftaran Berhasil</h1>
            <p className="text-slate-300 font-poppins text-base md:text-lg mb-6 leading-relaxed">
              Your response has been recorded.
            </p>
            <div className="p-4 rounded-xl bg-black/30 border border-white/10 text-xs md:text-sm text-slate-300 font-poppins mb-6">
              Data pendaftaran tenant Anda telah masuk ke sistem dan akan diseleksi oleh panitia VOITSFEST.
            </div>

            {/* Official WhatsApp Channel Invitation */}
            <WhatsAppChannelSection />

            <div className="mt-8 pt-6 border-t border-white/10 flex justify-center">
              <Link 
                href="/" 
                className="inline-flex items-center justify-center bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold px-8 py-3.5 rounded-full tracking-wider uppercase transition-all duration-200 shadow-lg hover:shadow-amber-400/25 hover:scale-[1.02] active:scale-95 font-poppins text-xs md:text-sm cursor-pointer"
              >
                Kembali ke Beranda
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const kategoriOptions = [
    "Makanan Berat",
    "Makanan Ringan / Jajanan",
    "Minuman",
    "Kriya / Aksesoris",
    "Jasa / Lainnya"
  ];

  const metodePersiapanOptions = [
    "Menggunakan Listrik",
    "Menggunakan Gas",
    "Keduanya",
    "Hanya Penyajian"
  ];

  return (
    <GatewayGuard event="tenant">
      <div className="text-on-background font-poppins overflow-x-hidden relative min-h-screen">
        <Navbar />

      <main className="flex-grow pt-32 pb-24 px-6 md:px-12 lg:px-24 mx-auto w-full max-w-[1100px] relative z-10">
        {/* Page Header */}
        <div className="text-center mb-14">
          <CustomHeading 
            as="h1" 
            text="Tenant Registration" 
            className="text-4xl md:text-6xl text-white mb-4 drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)] drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] [text-shadow:0_3px_12px_rgba(0,0,0,0.85),0_0_20px_rgba(0,0,0,0.6)] tracking-tight text-center" 
          />
          <p className="font-poppins text-base md:text-lg text-secondary-fixed-dim max-w-2xl mx-auto leading-relaxed drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] [text-shadow:0_2px_8px_rgba(0,0,0,0.9)]">
            Daftarkan tenant usaha atau brand Anda untuk menjadi bagian dari kemeriahan VOITSFEST.
          </p>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="mb-8 p-4 bg-error-container/30 border border-error text-error rounded-xl flex items-center gap-3 animate-in fade-in duration-300">
            <Info className="w-6 h-6 flex-shrink-0" />
            <p className="font-poppins text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Real-time SubEvent Quota & Availability Badge */}
        <SubEventQuotaBadge
          eventName="Tenant & Expo Bazaar"
          pricing={cmsPricing}
          quota={subQuota}
          className="mb-8"
        />

        <form onSubmit={handleSubmit} className="space-y-12">
          
          {/* ======================================================== */}
          {/* SECTION 1: PROFIL PENANGGUNG JAWAB & USAHA */}
          {/* ======================================================== */}
          <div className="bg-slate-950/60 backdrop-blur-xl rounded-2xl p-6 md:p-10 relative overflow-hidden shadow-[0_4px_25px_rgba(0,0,0,0.5)] border border-white/10">
            <div className="mb-8 pb-4 border-b border-white/10">
              <CustomHeading 
                as="h2" 
                text="Profil Penanggung Jawab & Usaha" 
                className="text-2xl md:text-3xl text-primary-fixed flex items-center gap-3" 
              />
              <p className="font-poppins text-sm text-slate-300 mt-2">
                Informasi identitas penanggung jawab dan profil legalitas dasar usaha.
              </p>
            </div>

            <div className="space-y-6">
              {/* Nama Lengkap & WhatsApp */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">
                    Nama Lengkap Penanggung Jawab *
                  </label>
                  <input 
                    required 
                    type="text" 
                    value={namaLengkap} 
                    onChange={e => setNamaLengkap(e.target.value)} 
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins placeholder:text-slate-400" 
                    placeholder="Masukkan nama lengkap penanggung jawab" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">
                    Nomor WhatsApp Aktif *
                  </label>
                  <input 
                    required 
                    type="tel" 
                    value={phone} 
                    onChange={e => setPhone(e.target.value)} 
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins placeholder:text-slate-400" 
                    placeholder="Contoh: 081234567890" 
                  />
                </div>
              </div>

              {/* Email & Alamat Domisili */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">
                    Email Aktif *
                  </label>
                  <input 
                    required 
                    type="email" 
                    value={email} 
                    onChange={e => setEmail(e.target.value)} 
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins placeholder:text-slate-400" 
                    placeholder="email@contoh.com" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">
                    Alamat Domisili *
                  </label>
                  <input 
                    required 
                    type="text" 
                    value={alamatDomisili} 
                    onChange={e => setAlamatDomisili(e.target.value)} 
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins placeholder:text-slate-400" 
                    placeholder="Masukkan alamat domisili lengkap" 
                  />
                </div>
              </div>

              {/* Nama Usaha & Rentang Harga */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">
                    Nama Usaha / Brand *
                  </label>
                  <input 
                    required 
                    type="text" 
                    value={namaUsaha} 
                    onChange={e => setNamaUsaha(e.target.value)} 
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins placeholder:text-slate-400" 
                    placeholder="Masukkan nama usaha atau brand" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">
                    Rentang Harga Produk *
                  </label>
                  <input 
                    required 
                    type="text" 
                    value={rentangHarga} 
                    onChange={e => setRentangHarga(e.target.value)} 
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins placeholder:text-slate-400" 
                    placeholder="Contoh: Rp 15.000 - Rp 35.000" 
                  />
                </div>
              </div>

              {/* Akun Media Sosial */}
              <div className="space-y-2">
                <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">
                  Akun Media Sosial *
                </label>
                <input 
                  required 
                  type="text" 
                  value={akunMedsos} 
                  onChange={e => setAkunMedsos(e.target.value)} 
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins placeholder:text-slate-400" 
                  placeholder="Contoh: Instagram @namausaha / TikTok @namausaha" 
                />
              </div>

              {/* Deskripsi Singkat Usaha */}
              <div className="space-y-2">
                <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">
                  Deskripsi Singkat Usaha *
                </label>
                <textarea 
                  required 
                  rows={4}
                  value={deskripsiUsaha} 
                  onChange={e => setDeskripsiUsaha(e.target.value)} 
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins placeholder:text-slate-400 resize-y" 
                  placeholder="Jelaskan secara singkat profil usaha, keunggulan produk, atau konsep jualan Anda..." 
                />
              </div>

              {/* Dropdown Kategori Usaha */}
              <div className="space-y-2">
                <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">
                  Kategori Usaha *
                </label>
                <select 
                  required 
                  value={kategoriUsaha} 
                  onChange={e => setKategoriUsaha(e.target.value)} 
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins cursor-pointer"
                >
                  <option value="" disabled className="bg-slate-900 text-slate-400">
                    Pilih Kategori Usaha
                  </option>
                  {kategoriOptions.map(kat => (
                    <option key={kat} value={kat} className="bg-slate-900 text-white">
                      {kat}
                    </option>
                  ))}
                </select>
              </div>

              {/* File Upload: Scan KTM/KTP (PDF) */}
              <div className="space-y-2 pt-2">
                <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">
                  Scan KTM/KTP (PDF) *
                </label>
                <div className="relative w-full">
                  <input 
                    required 
                    accept=".pdf" 
                    type="file" 
                    onChange={e => setScanKtm(e.target.files?.[0] || null)} 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                  />
                  <div className={`w-full border-2 border-dashed rounded-lg py-6 px-4 flex flex-col items-center justify-center transition-all ${
                    scanKtm 
                      ? "border-secondary bg-secondary/15" 
                      : "border-white/15 bg-white/5 hover:bg-white/10"
                  }`}>
                    <FileText className={`w-8 h-8 mb-2 ${scanKtm ? "text-secondary" : "text-slate-300"}`} />
                    <span className="text-white font-poppins font-medium text-sm text-center truncate max-w-full px-4">
                      {scanKtm ? scanKtm.name : "Unggah Scan KTM atau KTP (.pdf)"}
                    </span>
                    <span className="text-xs text-slate-300 font-poppins mt-1">
                      Hanya format .PDF yang didukung (Maksimal 5MB)
                    </span>
                  </div>
                </div>
                {scanKtm && (
                  <button
                    type="button"
                    onClick={() => setScanKtm(null)}
                    className="text-xs text-error hover:underline flex items-center gap-1 font-poppins mt-1"
                  >
                    <X className="w-3 h-3" /> Hapus file
                  </button>
                )}
              </div>

            </div>
          </div>

          {/* ======================================================== */}
          {/* SECTION 2: OPERASIONAL & PEMBERKASAN */}
          {/* ======================================================== */}
          <div className="bg-slate-950/60 backdrop-blur-xl rounded-2xl p-6 md:p-10 relative overflow-hidden shadow-[0_4px_25px_rgba(0,0,0,0.5)] border border-white/10">
            <div className="mb-8 pb-4 border-b border-white/10">
              <CustomHeading 
                as="h2" 
                text="Operasional & Pemberkasan" 
                className="text-2xl md:text-3xl text-primary-fixed flex items-center gap-3" 
              />
              <p className="font-poppins text-sm text-slate-300 mt-2">
                Kebutuhan operasional di stand serta kelengkapan berkas visual dan menu produk.
              </p>
            </div>

            <div className="space-y-8">
              
              {/* Radio: Metode Persiapan / Pemasakan di Stand */}
              <div className="space-y-3">
                <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">
                  Metode Persiapan / Pemasakan di Stand *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {metodePersiapanOptions.map(option => (
                    <label 
                      key={option}
                      className={`cursor-pointer rounded-xl p-4 border flex items-center gap-3.5 transition-all ${
                        metodePersiapan === option 
                          ? "bg-secondary/20 border-secondary ring-1 ring-secondary shadow-[0_0_12px_rgba(176,198,255,0.2)]" 
                          : "bg-black/30 border-white/10 hover:border-white/20"
                      }`}
                    >
                      <input 
                        type="radio" 
                        name="metodePersiapan" 
                        value={option} 
                        checked={metodePersiapan === option} 
                        onChange={() => setMetodePersiapan(option)} 
                        className="hidden" 
                      />
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                        metodePersiapan === option ? "border-secondary" : "border-slate-400"
                      }`}>
                        {metodePersiapan === option && (
                          <div className="w-2.5 h-2.5 rounded-full bg-secondary"></div>
                        )}
                      </div>
                      <span className="text-white font-poppins font-medium text-sm">
                        {option}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Uploads Grid: Logo Usaha & Foto Produk */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Logo Usaha */}
                <div className="space-y-2">
                  <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">
                    Upload Logo Usaha *
                  </label>
                  <div className="relative w-full">
                    <input 
                      required 
                      accept="image/*,.pdf" 
                      type="file" 
                      onChange={e => setLogoUsaha(e.target.files?.[0] || null)} 
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                    />
                    <div className={`w-full border-2 border-dashed rounded-lg py-6 px-4 flex flex-col items-center justify-center transition-all ${
                      logoUsaha 
                        ? "border-secondary bg-secondary/15" 
                        : "border-white/15 bg-white/5 hover:bg-white/10"
                    }`}>
                      <UploadCloud className={`w-7 h-7 mb-2 ${logoUsaha ? "text-secondary" : "text-slate-300"}`} />
                      <span className="text-white font-poppins font-medium text-sm text-center truncate max-w-full px-2">
                        {logoUsaha ? logoUsaha.name : "Unggah Logo Usaha"}
                      </span>
                      <span className="text-xs text-slate-300 font-poppins mt-1">
                        Format JPG, PNG, atau PDF
                      </span>
                    </div>
                  </div>
                  {logoUsaha && (
                    <button
                      type="button"
                      onClick={() => setLogoUsaha(null)}
                      className="text-xs text-error hover:underline flex items-center gap-1 font-poppins mt-1"
                    >
                      <X className="w-3 h-3" /> Hapus file
                    </button>
                  )}
                </div>

                {/* Foto Produk */}
                <div className="space-y-2">
                  <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">
                    Upload Foto Produk *
                  </label>
                  <div className="relative w-full">
                    <input 
                      required 
                      accept="image/*,.pdf" 
                      type="file" 
                      onChange={e => setFotoProduk(e.target.files?.[0] || null)} 
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                    />
                    <div className={`w-full border-2 border-dashed rounded-lg py-6 px-4 flex flex-col items-center justify-center transition-all ${
                      fotoProduk 
                        ? "border-secondary bg-secondary/15" 
                        : "border-white/15 bg-white/5 hover:bg-white/10"
                    }`}>
                      <UploadCloud className={`w-7 h-7 mb-2 ${fotoProduk ? "text-secondary" : "text-slate-300"}`} />
                      <span className="text-white font-poppins font-medium text-sm text-center truncate max-w-full px-2">
                        {fotoProduk ? fotoProduk.name : "Unggah Foto Produk"}
                      </span>
                      <span className="text-xs text-slate-300 font-poppins mt-1">
                        Format JPG, PNG, atau PDF
                      </span>
                    </div>
                  </div>
                  {fotoProduk && (
                    <button
                      type="button"
                      onClick={() => setFotoProduk(null)}
                      className="text-xs text-error hover:underline flex items-center gap-1 font-poppins mt-1"
                    >
                      <X className="w-3 h-3" /> Hapus file
                    </button>
                  )}
                </div>

              </div>

              {/* Uploads Grid: Foto Stand (Optional) & Katalog/Menu */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Foto Stand (Optional) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">
                      Upload Foto Stand
                    </label>
                    <span className="text-xs font-poppins text-secondary-fixed bg-secondary-container/40 px-2.5 py-0.5 rounded-full uppercase tracking-wider font-semibold">
                      Opsional
                    </span>
                  </div>
                  <div className="relative w-full">
                    <input 
                      accept="image/*,.pdf" 
                      type="file" 
                      onChange={e => setFotoStand(e.target.files?.[0] || null)} 
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                    />
                    <div className={`w-full border-2 border-dashed rounded-lg py-6 px-4 flex flex-col items-center justify-center transition-all ${
                      fotoStand 
                        ? "border-secondary bg-secondary/15" 
                        : "border-white/15 bg-white/5 hover:bg-white/10"
                    }`}>
                      <UploadCloud className={`w-7 h-7 mb-2 ${fotoStand ? "text-secondary" : "text-slate-300"}`} />
                      <span className="text-white font-poppins font-medium text-sm text-center truncate max-w-full px-2">
                        {fotoStand ? fotoStand.name : "Unggah Foto Booth/Stand (Bila Ada)"}
                      </span>
                      <span className="text-xs text-slate-300 font-poppins mt-1">
                        Format JPG, PNG, atau PDF (Opsional)
                      </span>
                    </div>
                  </div>
                  {fotoStand && (
                    <button
                      type="button"
                      onClick={() => setFotoStand(null)}
                      className="text-xs text-error hover:underline flex items-center gap-1 font-poppins mt-1"
                    >
                      <X className="w-3 h-3" /> Hapus file
                    </button>
                  )}
                </div>

                {/* Katalog Produk / Daftar Menu */}
                <div className="space-y-2">
                  <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">
                    Katalog Produk / Daftar Menu *
                  </label>
                  <div className="relative w-full">
                    <input 
                      required 
                      accept="image/*,.pdf" 
                      type="file" 
                      onChange={e => setKatalogProduk(e.target.files?.[0] || null)} 
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                    />
                    <div className={`w-full border-2 border-dashed rounded-lg py-6 px-4 flex flex-col items-center justify-center transition-all ${
                      katalogProduk 
                        ? "border-secondary bg-secondary/15" 
                        : "border-white/15 bg-white/5 hover:bg-white/10"
                    }`}>
                      <FileSpreadsheet className={`w-7 h-7 mb-2 ${katalogProduk ? "text-secondary" : "text-slate-300"}`} />
                      <span className="text-white font-poppins font-medium text-sm text-center truncate max-w-full px-2">
                        {katalogProduk ? katalogProduk.name : "Unggah Katalog Produk / Menu"}
                      </span>
                      <span className="text-xs text-slate-300 font-poppins mt-1">
                        Format PDF atau Foto (JPG/PNG)
                      </span>
                    </div>
                  </div>
                  {katalogProduk && (
                    <button
                      type="button"
                      onClick={() => setKatalogProduk(null)}
                      className="text-xs text-error hover:underline flex items-center gap-1 font-poppins mt-1"
                    >
                      <X className="w-3 h-3" /> Hapus file
                    </button>
                  )}
                </div>

              </div>

            </div>
          </div>

          {/* ======================================================== */}
          {/* SECTION 3: PERSETUJUAN & FINALISASI */}
          {/* ======================================================== */}
          <div className="bg-slate-950/60 backdrop-blur-xl rounded-2xl p-6 md:p-10 relative overflow-hidden shadow-[0_4px_25px_rgba(0,0,0,0.5)] border border-white/10">
            <div className="mb-8 pb-4 border-b border-white/10">
              <CustomHeading 
                as="h2" 
                text="Persetujuan & Finalisasi" 
                className="text-2xl md:text-3xl text-primary-fixed flex items-center gap-3" 
              />
              <p className="font-poppins text-sm text-slate-300 mt-2">
                Harap baca dan setujui seluruh ketentuan sebelum mengirimkan formulir pendaftaran.
              </p>
            </div>

            <div className="space-y-5">
              
              {/* Checkbox 1 */}
              <label className={`flex items-start gap-4 p-5 rounded-xl border transition-all cursor-pointer ${
                agreedRules 
                  ? "bg-secondary/10 border-secondary ring-1 ring-secondary/50" 
                  : "bg-black/30 border-white/10 hover:border-white/20"
              }`}>
                <input 
                  required
                  type="checkbox" 
                  checked={agreedRules} 
                  onChange={e => setAgreedRules(e.target.checked)} 
                  className="mt-1 w-5 h-5 rounded border-white/20 text-secondary focus:ring-secondary accent-secondary cursor-pointer flex-shrink-0" 
                />
                <span className="font-poppins text-sm md:text-base text-white leading-relaxed select-none">
                  Apakah Anda bersedia mematuhi seluruh regulasi, SOP, dan jadwal loading/unloading yang ditetapkan oleh panitia? (Ya, saya bersedia) <span className="text-secondary">*</span>
                </span>
              </label>

              {/* Checkbox 2 */}
              <label className={`flex items-start gap-4 p-5 rounded-xl border transition-all cursor-pointer ${
                agreedSelection 
                  ? "bg-secondary/10 border-secondary ring-1 ring-secondary/50" 
                  : "bg-black/30 border-white/10 hover:border-white/20"
              }`}>
                <input 
                  required
                  type="checkbox" 
                  checked={agreedSelection} 
                  onChange={e => setAgreedSelection(e.target.checked)} 
                  className="mt-1 w-5 h-5 rounded border-white/20 text-secondary focus:ring-secondary accent-secondary cursor-pointer flex-shrink-0" 
                />
                <span className="font-poppins text-sm md:text-base text-white leading-relaxed select-none">
                  Dengan mengisi formulir ini, saya menyatakan bahwa data yang diberikan adalah benar dan bersedia mengikuti seluruh alur seleksi yang ada <span className="text-secondary">*</span>
                </span>
              </label>

            </div>

            {/* Validation helper alert */}
            {(!agreedRules || !agreedSelection) && (
              <p className="text-xs font-poppins text-secondary-fixed-dim/80 mt-4 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 flex-shrink-0" />
                Kedua pernyataan di atas wajib dicentang untuk mengaktifkan tombol pengiriman pendaftaran.
              </p>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4">
            <div>
              <p className="text-xs md:text-sm font-poppins text-on-surface-variant text-center sm:text-left">
                Pastikan seluruh data yang diisi telah sesuai dan lengkap sebelum submit.
              </p>
              {isEventFull ? (
                <p className="text-xs text-error font-medium mt-1">
                  Pendaftaran tenant saat ini ditutup karena kapasitas stand telah penuh (Sold Out / Kapasitas Penuh).
                </p>
              ) : isPhaseFull ? (
                <p className="text-xs text-amber-300 font-medium mt-1">
                  Kuota pendaftaran tenant untuk fase aktif ini sudah habis (Kuota Fase Penuh). Silakan menunggu pembukaan fase berikutnya.
                </p>
              ) : !isAvailable ? (
                <p className="text-xs text-slate-300 font-medium mt-1">
                  {availabilityReason === "phase_date_not_started"
                    ? "Periode pendaftaran tenant belum dimulai (Periode Belum Dimulai)."
                    : "Periode pendaftaran tenant telah berakhir (Periode Berakhir)."}
                </p>
              ) : null}
            </div>
            <button 
              disabled={isSubmitting || !isFormValid || !isAvailable} 
              type="submit" 
              className={`w-full sm:w-auto px-10 py-4 rounded-full font-semibold tracking-wider uppercase flex items-center justify-center gap-3 transition-all font-poppins shadow-lg ${
                isSubmitting || !isFormValid || !isAvailable
                  ? "bg-primary-container text-primary opacity-40 cursor-not-allowed pointer-events-none"
                  : "bg-primary-container text-primary hover:bg-primary-container/80 shadow-primary-container/25 active:scale-95 cursor-pointer"
              }`}
            >
              {isSubmitting
                ? "Mengirim Pendaftaran..."
                : isEventFull
                ? "Sold Out / Kapasitas Penuh"
                : isPhaseFull
                ? "Kuota Fase Penuh"
                : !isAvailable
                ? availabilityReason === "phase_date_not_started"
                  ? "Periode Belum Dimulai"
                  : "Periode Berakhir"
                : "Kirim Pendaftaran"}
              {!isSubmitting && isAvailable && <ArrowRight className="w-5 h-5" />}
            </button>
          </div>

        </form>
      </main>

      <Footer />
      </div>
    </GatewayGuard>
  );
}
