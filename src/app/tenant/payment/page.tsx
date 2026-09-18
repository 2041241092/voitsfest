"use client";

import { useState, useMemo, useEffect } from "react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import CustomHeading from "@/components/ui/CustomHeading";
import { createClient } from "@/lib/supabase/client";
import { 
  User, 
  CreditCard, 
  Banknote, 
  Landmark, 
  QrCode, 
  UploadCloud, 
  CheckCircle, 
  ChevronRight, 
  Copy, 
  Check, 
  Info, 
  X,
  FileText,
  AlertCircle
} from "lucide-react";
import Link from "next/link";
import GatewayGuard from "@/components/gateway/GatewayGuard";
import WhatsAppChannelSection from "@/components/registration/WhatsAppChannelSection";
import { fetchPricingTiers, EventPricing, DEFAULT_PRICING_TIERS } from "@/lib/pricing";

export default function TenantPaymentPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // SECTION 1: Data Diri Peserta
  const [namaLengkap, setNamaLengkap] = useState("");
  const [nomorWA, setNomorWA] = useState("");
  const [email, setEmail] = useState("");
  const [kategoriPeserta, setKategoriPeserta] = useState("");
  const [identitas, setIdentitas] = useState(""); // NRP (vokasi) or Asal Instansi (umum)
  const [ktmFile, setKtmFile] = useState<File | null>(null);

  // SECTION 2: Pembayaran
  const [metodeBayar, setMetodeBayar] = useState<"bni" | "qris">("bni");
  const [namaPemilikRekening, setNamaPemilikRekening] = useState("");
  const [buktiBayar, setBuktiBayar] = useState<File | null>(null);

  // Dynamic Pricing from cms_settings
  const [cmsPricing, setCmsPricing] = useState<EventPricing>(DEFAULT_PRICING_TIERS.tenant);

  useEffect(() => {
    async function loadPricing() {
      const tiers = await fetchPricingTiers();
      if (tiers.tenant) {
        setCmsPricing(tiers.tenant);
      }
    }
    loadPricing();
  }, []);

  const supabase = createClient();

  const handleCopyAccountNumber = () => {
    navigator.clipboard.writeText("1433025776");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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

  // Comprehensive Form Validation Check
  const isFormValid = useMemo(() => {
    // 1. Data Diri Peserta
    if (!namaLengkap.trim()) return false;
    if (!nomorWA.trim()) return false;
    if (!email.trim()) return false;
    if (!kategoriPeserta) return false;
    if (!identitas.trim()) return false;

    if (kategoriPeserta === "vokasi" && !ktmFile) {
      return false;
    }

    // 2. Pembayaran
    if (metodeBayar !== "bni") return false;
    if (!namaPemilikRekening.trim()) return false;
    if (!buktiBayar) return false;

    return true;
  }, [
    namaLengkap,
    nomorWA,
    email,
    kategoriPeserta,
    identitas,
    ktmFile,
    metodeBayar,
    namaPemilikRekening,
    buktiBayar,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || isSubmitting) return;
    setError(null);

    // Validation
    if (!kategoriPeserta) {
      setError("Silakan pilih kategori peserta terlebih dahulu.");
      return;
    }

    if (kategoriPeserta === "vokasi" && !ktmFile) {
      setError("File Foto/Scan KTM wajib diunggah untuk kategori Mahasiswa Fakultas Vokasi ITS.");
      return;
    }

    if (metodeBayar !== "bni") {
      setError("Untuk Saat Ini Layanan QRIS Belum Tersedia. Silakan gunakan transfer Bank BNI.");
      return;
    }

    if (!buktiBayar) {
      setError("Bukti transfer pembayaran wajib diunggah.");
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Upload files
      let ktmUrl: string | null = null;
      if (ktmFile) {
        ktmUrl = await handleFileUpload(ktmFile, "tenant/ktm");
      }

      const paymentProofUrl = await handleFileUpload(buktiBayar, "tenant/payments");

      // 2. Insert into tenant_registrations table (guest workflow)
      try {
        await supabase
          .from("tenant_registrations")
          .insert({
            tenant_name: namaLengkap,
            owner_name: namaLengkap,
            email: email,
            phone: nomorWA,
            category: kategoriPeserta === "vokasi" ? `Vokasi ITS - ${identitas}` : `Umum - ${identitas}`,
            payment_proof_url: paymentProofUrl,
            status: "pending"
          });
      } catch (regErr) {
        console.warn("Notice for tenant registration insert:", regErr);
      }

      // 3. Insert transaction record with status 'Pending' as defined in prd.md
      const { error: txError } = await supabase
        .from("transactions")
        .insert({
          source_type: "tenant",
          sub_event_type: "TENANT",
          amount: cmsPricing.price,
          payment_proof_url: paymentProofUrl,
          status: "Pending"
        });

      if (txError) {
        throw new Error(txError.message || "Gagal mencatat transaksi pembayaran.");
      }

      setIsSuccess(true);
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan saat memproses pembayaran. Silakan coba lagi.");
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
            <h1 className="text-3xl font-bold text-white mb-4 tracking-tight">Pembayaran Berhasil Dikirim</h1>
            <p className="text-slate-300 font-poppins text-base md:text-lg mb-6 leading-relaxed">
              Your response has been recorded.
            </p>
            <div className="p-4 rounded-xl bg-black/30 border border-white/10 text-xs md:text-sm text-slate-300 font-poppins mb-6">
              Bukti pembayaran tenant Anda telah tersimpan dengan status <span className="text-secondary-fixed font-semibold">Pending</span> dan akan diverifikasi oleh tim panitia.
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

  return (
    <GatewayGuard event="tenant">
      <div className="text-on-background font-poppins overflow-x-hidden relative min-h-screen flex flex-col">
        <Navbar />

      <main className="flex-grow pt-[120px] pb-24 px-4 md:px-8 lg:px-12 mx-auto w-full max-w-[1100px] relative z-10">
        {/* Header Section */}
        <div className="text-center mb-12 mx-auto">
          <CustomHeading 
            as="h1" 
            text="Payment Tenant" 
            className="text-4xl md:text-6xl text-white mb-4 drop-shadow-md tracking-tight text-center" 
          />
          <p className="font-poppins text-base md:text-lg text-secondary-fixed-dim max-w-2xl mx-auto leading-relaxed">
            Join the cosmic marketplace at VOITSFEST 2026. Complete the form below to secure your space in the galaxy.
          </p>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="mb-8 p-4 bg-error-container/30 border border-error text-error rounded-xl flex items-center gap-3 animate-in fade-in duration-300">
            <Info className="w-6 h-6 flex-shrink-0" />
            <p className="font-poppins text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Registration & Payment Form */}
        <form onSubmit={handleSubmit} className="space-y-10 max-w-4xl mx-auto">
          
          {/* ======================================================== */}
          {/* SECTION 1: DATA DIRI PESERTA */}
          {/* ======================================================== */}
          <div className="bg-slate-950/60 backdrop-blur-xl rounded-2xl p-6 md:p-10 relative overflow-hidden shadow-[0_4px_25px_rgba(0,0,0,0.5)] border border-white/10">
            <div className="mb-6 pb-4 border-b border-white/10">
              <CustomHeading 
                as="h2" 
                text="Data Diri Peserta" 
                className="text-2xl md:text-3xl text-primary-fixed flex items-center gap-3" 
              />
            </div>

            <div className="space-y-6">
              {/* Nama Lengkap */}
              <div className="space-y-2">
                <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block" htmlFor="namaLengkap">
                  Nama Lengkap *
                </label>
                <input 
                  required 
                  type="text" 
                  id="namaLengkap" 
                  value={namaLengkap} 
                  onChange={e => setNamaLengkap(e.target.value)} 
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins placeholder:text-slate-400" 
                  placeholder="Masukkan nama lengkap sesuai KTP/KTM" 
                />
              </div>

              {/* WhatsApp & Email */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block" htmlFor="nomorWA">
                    Nomor WhatsApp *
                  </label>
                  <input 
                    required 
                    type="tel" 
                    id="nomorWA" 
                    value={nomorWA} 
                    onChange={e => setNomorWA(e.target.value)} 
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins placeholder:text-slate-400" 
                    placeholder="081234567890" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block" htmlFor="email">
                    Email Aktif *
                  </label>
                  <input 
                    required 
                    type="email" 
                    id="email" 
                    value={email} 
                    onChange={e => setEmail(e.target.value)} 
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins placeholder:text-slate-400" 
                    placeholder="email@contoh.com" 
                  />
                </div>
              </div>

              {/* Kategori Peserta Dropdown */}
              <div className="space-y-2">
                <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block" htmlFor="kategoriPeserta">
                  Kategori Peserta *
                </label>
                <select 
                  required 
                  id="kategoriPeserta" 
                  value={kategoriPeserta} 
                  onChange={e => {
                    setKategoriPeserta(e.target.value);
                    setIdentitas("");
                    setKtmFile(null);
                  }} 
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins cursor-pointer"
                >
                  <option value="" disabled className="bg-slate-900 text-slate-400">
                    Pilih Kategori
                  </option>
                  <option value="vokasi" className="bg-slate-900 text-white">
                    Mahasiswa Fakultas Vokasi ITS
                  </option>
                  <option value="umum" className="bg-slate-900 text-white">
                    Umum & Mahasiswa Luar Vokasi
                  </option>
                </select>
              </div>

              {/* Dynamic Fields Section */}
              {kategoriPeserta === "vokasi" && (
                <div className="space-y-6 pt-2 animate-in fade-in slide-in-from-top-3 duration-300">
                  <div className="space-y-2">
                    <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block" htmlFor="inputNRP">
                      NRP *
                    </label>
                    <input 
                      required 
                      type="text" 
                      id="inputNRP" 
                      value={identitas} 
                      onChange={e => setIdentitas(e.target.value)} 
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins placeholder:text-slate-400" 
                      placeholder="Masukkan Nomor Registrasi Pokok" 
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">
                      Upload Foto/Scan KTM *
                    </label>
                    <div className="relative w-full">
                      <input 
                        required 
                        accept="image/*,.pdf" 
                        type="file" 
                        onChange={e => setKtmFile(e.target.files?.[0] || null)} 
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                      />
                      <div className={`w-full border-2 border-dashed rounded-lg py-6 px-4 flex flex-col items-center justify-center transition-all ${
                        ktmFile 
                          ? "border-secondary bg-secondary/15" 
                          : "border-white/15 bg-white/5 hover:bg-white/10"
                      }`}>
                        <UploadCloud className={`w-8 h-8 mb-2 ${ktmFile ? "text-secondary" : "text-slate-300"}`} />
                        <span className="text-white font-poppins font-medium text-sm text-center truncate max-w-full px-4">
                          {ktmFile ? ktmFile.name : "Upload a file or drag and drop"}
                        </span>
                        <span className="text-xs text-slate-300 font-poppins mt-1">
                          PNG, JPG, PDF up to 5MB
                        </span>
                      </div>
                    </div>
                    {ktmFile && (
                      <button
                        type="button"
                        onClick={() => setKtmFile(null)}
                        className="text-xs text-error hover:underline flex items-center gap-1 font-poppins mt-1"
                      >
                        <X className="w-3 h-3" /> Hapus file
                      </button>
                    )}
                  </div>
                </div>
              )}

              {kategoriPeserta === "umum" && (
                <div className="space-y-2 pt-2 animate-in fade-in slide-in-from-top-3 duration-300">
                  <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block" htmlFor="inputInstansi">
                    Asal Instansi/Universitas *
                  </label>
                  <input 
                    required 
                    type="text" 
                    id="inputInstansi" 
                    value={identitas} 
                    onChange={e => setIdentitas(e.target.value)} 
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins placeholder:text-slate-400" 
                    placeholder="Contoh: Universitas Indonesia / PT Sukses Makmur" 
                  />
                </div>
              )}
            </div>
          </div>

          {/* SECTION 2: PEMBAYARAN */}
          <div className="bg-slate-950/60 backdrop-blur-xl rounded-2xl p-6 md:p-10 relative overflow-hidden shadow-[0_4px_25px_rgba(0,0,0,0.5)] border border-white/10">
            <div className="mb-8">
              <CustomHeading 
                as="h2" 
                text="Pembayaran" 
                className="text-2xl md:text-3xl text-primary-fixed flex items-center gap-3" 
              />
            </div>

            <div className="space-y-8 animate-in fade-in duration-300">
              {/* Total Pembayaran Banner */}
              <div className="p-4 rounded-xl border border-secondary/50 bg-secondary/10 flex justify-between items-center">
                <div>
                  <h3 className="font-semibold text-xs uppercase text-secondary tracking-wider">
                    Total Biaya (Fase: {cmsPricing.phase})
                  </h3>
                  <p className="font-headline-md text-2xl text-white font-bold mt-1">
                    Rp {cmsPricing.price.toLocaleString("id-ID")}
                  </p>
                </div>
              </div>

              {/* Metode Pembayaran Selection */}
              <div className="space-y-4">
                <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">
                  Metode Pembayaran *
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Option 1: Bank Transfer (BNI) */}
                  <label 
                    className={`cursor-pointer rounded-xl p-4 border flex items-center gap-3.5 transition-all duration-300 ${
                      metodeBayar === "bni" 
                        ? "bg-secondary/20 border-secondary shadow-[0_0_15px_rgba(176,198,255,0.15)]" 
                        : "bg-black/30 border-white/10 hover:border-white/20"
                    }`}
                  >
                    <input 
                      type="radio" 
                      name="metodeBayar" 
                      value="bni" 
                      checked={metodeBayar === "bni"} 
                      onChange={() => setMetodeBayar("bni")} 
                      className="hidden" 
                    />
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${metodeBayar === "bni" ? "border-secondary" : "border-slate-400"}`}>
                      {metodeBayar === "bni" && <div className="w-2.5 h-2.5 rounded-full bg-secondary" />}
                    </div>
                    <CreditCard className="w-5 h-5 text-secondary" />
                    <span className="text-white font-medium text-sm">
                      Bank Transfer (BNI)
                    </span>
                  </label>

                  {/* Option 2: QRIS Digital */}
                  <label 
                    className={`cursor-pointer rounded-xl p-4 border flex items-center justify-between gap-3.5 transition-all duration-300 ${
                      metodeBayar === "qris" 
                        ? "bg-secondary/20 border-secondary shadow-[0_0_15px_rgba(176,198,255,0.15)]" 
                        : "bg-black/30 border-white/10 hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <input 
                        type="radio" 
                        name="metodeBayar" 
                        value="qris" 
                        checked={metodeBayar === "qris"} 
                        onChange={() => setMetodeBayar("qris")} 
                        className="hidden" 
                      />
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${metodeBayar === "qris" ? "border-secondary" : "border-slate-400"}`}>
                        {metodeBayar === "qris" && <div className="w-2.5 h-2.5 rounded-full bg-secondary" />}
                      </div>
                      <QrCode className="w-5 h-5 text-secondary" />
                      <span className="text-white font-medium text-sm">
                        QRIS Digital
                      </span>
                    </div>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Belum Tersedia
                    </span>
                  </label>
                </div>

                {/* Transfer Destination Details / QRIS Notice */}
                <div className="mt-4 transition-all duration-300">
                  {metodeBayar === "bni" ? (
                    <div className="p-6 rounded-xl border-l-4 border-l-secondary bg-black/30 border border-white/10 animate-in fade-in duration-300">
                      <h4 className="text-secondary mb-2 text-xs uppercase tracking-wider font-semibold">
                        Tujuan Transfer:
                      </h4>
                      <p className="text-white text-base font-medium mb-1">
                        BNI (Bank Negara Indonesia)
                      </p>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-white font-mono text-2xl tracking-wider font-bold">
                          1433025776
                        </span>
                        <button 
                          type="button" 
                          onClick={handleCopyAccountNumber} 
                          className="px-3 py-1 rounded bg-secondary/20 hover:bg-secondary/30 text-secondary text-xs font-semibold flex items-center gap-1.5 transition-colors border border-secondary/30"
                          title="Salin Nomor Rekening"
                        >
                          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copied ? "Tersalin" : "Salin"}</span>
                        </button>
                      </div>
                      <p className="text-slate-300 text-sm font-medium">
                        a.n Amalia Fitria Damaiyanti
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-6 md:p-8 text-center rounded-xl bg-amber-500/10 border border-amber-500/30 animate-in fade-in duration-300">
                      <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center mb-3">
                        <AlertCircle className="w-6 h-6 text-amber-400" />
                      </div>
                      <h4 className="text-amber-300 font-semibold text-base mb-1.5">
                        Untuk Saat Ini Layanan QRIS Belum Tersedia
                      </h4>
                      <p className="text-xs text-neutral-300 max-w-md leading-relaxed">
                        Mohon gunakan metode pembayaran <strong className="text-white">Bank Transfer (BNI)</strong> untuk menyelesaikan transaksi Anda.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Nama Pemilik Rekening */}
              <div className="space-y-2">
                <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block" htmlFor="namaPemilikRekening">
                  Nama Pemilik Rekening / Akun E-Wallet *
                </label>
                <input 
                  required 
                  type="text" 
                  id="namaPemilikRekening" 
                  value={namaPemilikRekening} 
                  onChange={e => setNamaPemilikRekening(e.target.value)} 
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-medium placeholder:text-slate-400" 
                  placeholder="Nama yang tertera pada rekening pengirim" 
                />
              </div>

              {/* Upload Bukti Transfer */}
              <div className="space-y-2">
                <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">
                  Upload Bukti Transfer *
                </label>
                <div className="relative w-full">
                  <input 
                    required 
                    accept="image/*,.pdf" 
                    type="file" 
                    onChange={e => setBuktiBayar(e.target.files?.[0] || null)} 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                  />
                  <div className="w-full border-2 border-dashed border-white/15 rounded-lg py-8 flex flex-col items-center justify-center bg-white/5 hover:bg-white/10 transition-colors">
                    <UploadCloud className="w-8 h-8 text-slate-300 mb-2" />
                    <span className="text-white font-medium">
                      {buktiBayar ? buktiBayar.name : "Unggah Bukti Transfer (JPG/PNG/PDF)"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Submit Action */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4">
            <p className="text-xs md:text-sm font-poppins text-on-surface-variant text-center sm:text-left">
              {!isFormValid 
                ? "Lengkapi seluruh data wajib dan bukti transfer di atas untuk dapat mengirim pembayaran." 
                : "Pastikan nominal dan bukti transfer telah sesuai sebelum mengirim."}
            </p>
            <button 
              disabled={!isFormValid || isSubmitting} 
              type="submit" 
              className={`w-full sm:w-auto px-10 py-4 rounded-full font-semibold tracking-wider uppercase flex items-center justify-center gap-3 transition-all font-poppins ${
                !isFormValid || isSubmitting 
                  ? "bg-primary-container text-primary opacity-50 cursor-not-allowed" 
                  : "bg-primary-container text-primary hover:bg-primary-container/80 shadow-lg hover:shadow-primary-container/25 active:scale-95 cursor-pointer"
              }`}
            >
              {isSubmitting ? "Mengirim Pembayaran..." : "Kirim Pendaftaran Tenant"}
              {!isSubmitting && <ChevronRight className="w-5 h-5" />}
            </button>
          </div>

        </form>
      </main>

      <Footer />
      </div>
    </GatewayGuard>
  );
}
