"use client";

import { useState, useMemo, useEffect } from "react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import CustomHeading from "@/components/ui/CustomHeading";
import { createClient } from "@/lib/supabase/client";
import { 
  User, 
  CheckCircle, 
  ArrowRight, 
  Info, 
  Banknote, 
  UploadCloud, 
  QrCode, 
  ShieldCheck, 
  CreditCard, 
  Copy, 
  Check, 
  AlertCircle,
  Loader2
} from "lucide-react";
import Link from "next/link";
import GatewayGuard from "@/components/gateway/GatewayGuard";
import { checkQuotaAvailability, dispatchQuotaRefresh } from "@/lib/quota";
import { useLivePricingAndQuota } from "@/hooks/useLivePricingAndQuota";
import SubEventQuotaBadge from "@/components/registration/SubEventQuotaBadge";
import PromoVoucherInput from "@/components/registration/PromoVoucherInput";
import WhatsAppChannelSection from "@/components/registration/WhatsAppChannelSection";
import { incrementPromoQuota } from "@/lib/promo";
import { Promo } from "@/types/database";
import { validatePreCheckoutGuard } from "@/app/actions/checkout";

export default function SeminarRegisterPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // SECTION 1: Data Diri
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  
  type CategoryType = "bpc_bcc" | "vokasi_its" | "umum";
  const [category, setCategory] = useState<CategoryType>("bpc_bcc");
  
  // Dynamic fields
  const [nrp, setNrp] = useState("");
  const [asalInstansi, setAsalInstansi] = useState("");
  const [ktmProof, setKtmProof] = useState<File | null>(null);

  // SECTION 2: Pembayaran
  const [paymentMethod, setPaymentMethod] = useState<"bni" | "qris">("bni");
  const [accountName, setAccountName] = useState("");
  const [paymentProof, setPaymentProof] = useState<File | null>(null);

  // SECTION 3: Persyaratan
  const [igProof, setIgProof] = useState<File | null>(null);
  const [storyProof, setStoryProof] = useState<File | null>(null);

  // Dynamic Pricing & Two-Tier Quota via Supabase Realtime
  const {
    pricing: cmsPricing,
    quota: subQuota,
    activePromos,
    isPhaseFull,
    isEventFull,
    isAvailable,
    availabilityReason,
  } = useLivePricingAndQuota("seminar");

  const [appliedPromo, setAppliedPromo] = useState<Promo | null>(null);
  const [promoDiscount, setPromoDiscount] = useState(0);

  // CRITICAL EXCEPTION LOGIC: Vokasi ITS & BPC/BCC participants are free (Rp 0)
  const isFreeCategory = category === "vokasi_its" || category === "bpc_bcc";
  const effectivePrice = isFreeCategory
    ? 0
    : Math.max(0, cmsPricing.price - promoDiscount);

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

    const { error: uploadError } = await supabase.storage
      .from("registrations")
      .upload(filePath, file);

    if (uploadError) {
      throw new Error(`Failed to upload ${file.name}: ${uploadError.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from("registrations")
      .getPublicUrl(filePath);

    return publicUrlData.publicUrl;
  };

  // Comprehensive Form Validation Check
  const isFormValid = useMemo(() => {
    // 1. Data Diri
    if (!fullName.trim()) return false;
    if (!phone.trim()) return false;
    if (!email.trim()) return false;

    // 2. Dynamic fields based on category
    if (category === "vokasi_its") {
      if (!nrp.trim()) return false;
      if (!ktmProof) return false;
    } else if (category === "umum") {
      if (!asalInstansi.trim()) return false;
      if (paymentMethod !== "bni") return false;
      if (!accountName.trim()) return false;
      if (!paymentProof) return false;
    }

    // 3. Persyaratan proofs (always required)
    if (!igProof) return false;
    if (!storyProof) return false;

    return true;
  }, [
    fullName,
    phone,
    email,
    category,
    nrp,
    ktmProof,
    asalInstansi,
    paymentMethod,
    accountName,
    paymentProof,
    igProof,
    storyProof,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    if (!isFormValid || !isAvailable) {
      if (!isAvailable) {
        setError(
          isEventFull || isPhaseFull
            ? "Maaf, kuota untuk kategori tiket/promo yang Anda pilih baru saja habis."
            : availabilityReason === "phase_date_not_started"
            ? "Periode Belum Dimulai. Pendaftaran belum dibuka."
            : "Periode Berakhir. Periode pendaftaran telah berakhir."
        );
      }
      setIsSubmitting(false);
      return;
    }

    // Lifecycle Rule 1: Server-Side Pre-Checkout Guard
    const serverGuard = await validatePreCheckoutGuard("seminar", 1, appliedPromo?.id);
    if (!serverGuard.valid) {
      setError(serverGuard.error || "Maaf, kuota untuk kategori tiket/promo yang Anda pilih baru saja habis.");
      setIsSubmitting(false);
      return;
    }

    const quotaCheck = await checkQuotaAvailability("seminar", 1, appliedPromo?.id);
    if (!quotaCheck.available) {
      setError(quotaCheck.error || "Maaf, kuota untuk kategori tiket/promo yang Anda pilih baru saja habis.");
      setIsSubmitting(false);
      return;
    }

    try {
      // Basic Validation for files
      if (!igProof) throw new Error("Bukti Follow IG wajib diupload");
      if (!storyProof) throw new Error("Bukti Repost Story wajib diupload");
      if (category === "umum" && !paymentProof) throw new Error("Bukti Transfer wajib diupload untuk kategori Umum");
      if (category === "umum" && paymentMethod !== "bni") throw new Error("Untuk Saat Ini Layanan QRIS Belum Tersedia. Silakan gunakan transfer Bank BNI.");
      if (category === "vokasi_its" && !ktmProof) throw new Error("Scan Kartu Pelajar/KTM wajib diupload");

      // 1. Upload Persyaratan Files
      const igProofUrl = await handleFileUpload(igProof, "seminar/requirements");
      const storyProofUrl = await handleFileUpload(storyProof, "seminar/requirements");

      // 2. Map Category to DB format
      let mappedParticipantType = "general";
      let mappedInstitution = "";

      if (category === "bpc_bcc") {
        mappedParticipantType = "bpc";
        mappedInstitution = "BPC/BCC Participant";
      } else if (category === "vokasi_its") {
        mappedParticipantType = "general";
        mappedInstitution = `Fakultas Vokasi ITS - ${nrp}`;
      } else if (category === "umum") {
        mappedParticipantType = "general";
        mappedInstitution = asalInstansi;
      }

      // 3. Insert Seminar Registration
      const { data: seminarData, error: insertError } = await supabase
        .from("seminar_registrations")
        .insert({
          full_name: fullName,
          email: email,
          phone: phone,
          institution: mappedInstitution,
          participant_type: mappedParticipantType,
          ig_proof_url: igProofUrl,
          story_proof_url: storyProofUrl
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // 4. Handle Payment for 'Umum'
      if (category === "umum" && paymentProof) {
        const paymentProofUrl = await handleFileUpload(paymentProof, "seminar/payments");
        
        const { error: txError } = await supabase
          .from("transactions")
          .insert({
            source_type: "seminar",
            source_id: seminarData.id,
            sub_event_type: "SEMINAR",
            amount: effectivePrice,
            payment_proof_url: paymentProofUrl,
            status: "Pending",
            ticket_phase: cmsPricing.phase || "Normal Price",
            promo_id: appliedPromo?.id || null,
          });

        if (txError) throw txError;

        if (appliedPromo) {
          await incrementPromoQuota(supabase, appliedPromo.id, 1);
        }
      }

      dispatchQuotaRefresh();
      setIsSuccess(true);
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan yang tidak terduga.");
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="text-on-background font-body-md overflow-x-hidden relative min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-grow flex items-center justify-center pt-24 pb-12 px-4 relative z-10">
          <div className="bg-slate-950/60 backdrop-blur-xl border border-white/10 border-t-4 border-t-secondary-fixed shadow-[0_4px_25px_rgba(0,0,0,0.5)] max-w-xl md:max-w-2xl w-full p-6 md:p-8 rounded-2xl text-center animate-in fade-in duration-300">
            <CheckCircle className="w-20 h-20 text-secondary-fixed mx-auto mb-6" />
            <h1 className="font-display-lg-mobile text-3xl text-white mb-4">Pendaftaran Berhasil</h1>
            <p className="text-on-surface-variant mb-6">
              Your response has been recorded.
            </p>

            {/* Official WhatsApp Channel Invitation */}
            <WhatsAppChannelSection />

            <div className="mt-8 pt-6 border-t border-white/10 flex justify-center">
              <Link href="/" className="inline-flex items-center justify-center bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold px-8 py-3.5 rounded-full tracking-wider uppercase transition-all duration-200 shadow-lg hover:shadow-amber-400/25 hover:scale-[1.02] active:scale-95 font-poppins text-xs md:text-sm cursor-pointer">
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
    <GatewayGuard event="seminar">
      <div className="text-on-background font-body-md overflow-x-hidden relative min-h-screen">
        <Navbar />

      <main className="flex-grow pt-32 pb-24 px-6 md:px-12 lg:px-24 mx-auto w-full max-w-[1280px] relative z-10">
        <div className="text-center mb-16">
          <CustomHeading 
            as="h1" 
            text="Seminar Registration" 
            className="text-4xl md:text-6xl text-white mb-4 drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)] drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] [text-shadow:0_3px_12px_rgba(0,0,0,0.85),0_0_20px_rgba(0,0,0,0.6)] tracking-tight text-center" 
          />
          <p className="font-body-lg text-lg text-secondary-fixed-dim max-w-2xl mx-auto drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] [text-shadow:0_2px_8px_rgba(0,0,0,0.9)]">
            Daftarkan diri Anda untuk mengikuti Seminar VOITSFEST.
          </p>
        </div>

        {error && (
          <div className="mb-8 p-4 bg-error-container/20 border border-error text-error rounded-xl flex items-center gap-3 max-w-3xl mx-auto">
            <Info className="w-6 h-6 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <SubEventQuotaBadge
          eventName="Cosmic Seminar Kewirausahaan"
          pricing={cmsPricing}
          quota={subQuota}
          className="mb-8 max-w-3xl mx-auto"
        />

        <form onSubmit={handleSubmit} className="space-y-12 max-w-3xl mx-auto">
          {/* SECTION 1: DATA DIRI PESERTA */}
          <div className="bg-slate-950/60 backdrop-blur-xl rounded-2xl p-6 md:p-10 relative overflow-hidden shadow-[0_4px_25px_rgba(0,0,0,0.5)] border border-white/10">
            <div className="mb-8">
              <CustomHeading as="h2" text="Data Diri Peserta" className="text-2xl md:text-3xl text-primary-fixed flex items-center gap-3" />
            </div>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="font-semibold text-sm text-slate-100 uppercase tracking-wider block">Nama Lengkap *</label>
                <input required type="text" value={fullName} onChange={e => setFullName(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-medium" placeholder="Masukkan nama lengkap" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="font-semibold text-sm text-slate-100 uppercase tracking-wider block">Nomor WhatsApp *</label>
                  <input required type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-medium" placeholder="08xxxxxxxxxx" />
                </div>
                <div className="space-y-2">
                  <label className="font-semibold text-sm text-slate-100 uppercase tracking-wider block">Email Aktif *</label>
                  <input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-medium" placeholder="email@contoh.com" />
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-white/10">
                <label className="font-semibold text-sm text-slate-100 uppercase tracking-wider block">Kategori Peserta *</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <label className={`cursor-pointer rounded-xl p-4 border flex items-center gap-3 transition-all ${category === 'bpc_bcc' ? 'bg-secondary/20 border-secondary' : 'bg-black/30 border-white/10 hover:border-white/20'}`}>
                    <input type="radio" name="category" value="bpc_bcc" checked={category === 'bpc_bcc'} onChange={() => setCategory('bpc_bcc')} className="hidden" />
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${category === 'bpc_bcc' ? 'border-secondary' : 'border-slate-400'}`}>
                      {category === 'bpc_bcc' && <div className="w-2.5 h-2.5 rounded-full bg-secondary"></div>}
                    </div>
                    <span className="text-white font-medium text-sm">BPC & BCC Participant</span>
                  </label>
                  
                  <label className={`cursor-pointer rounded-xl p-4 border flex items-center gap-3 transition-all ${category === 'vokasi_its' ? 'bg-secondary/20 border-secondary' : 'bg-black/30 border-white/10 hover:border-white/20'}`}>
                    <input type="radio" name="category" value="vokasi_its" checked={category === 'vokasi_its'} onChange={() => setCategory('vokasi_its')} className="hidden" />
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${category === 'vokasi_its' ? 'border-secondary' : 'border-slate-400'}`}>
                      {category === 'vokasi_its' && <div className="w-2.5 h-2.5 rounded-full bg-secondary"></div>}
                    </div>
                    <span className="text-white font-medium text-sm">Mahasiswa Fakultas Vokasi ITS</span>
                  </label>
                  
                  <label className={`cursor-pointer rounded-xl p-4 border flex items-center gap-3 transition-all ${category === 'umum' ? 'bg-secondary/20 border-secondary' : 'bg-black/30 border-white/10 hover:border-white/20'}`}>
                    <input type="radio" name="category" value="umum" checked={category === 'umum'} onChange={() => setCategory('umum')} className="hidden" />
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${category === 'umum' ? 'border-secondary' : 'border-slate-400'}`}>
                      {category === 'umum' && <div className="w-2.5 h-2.5 rounded-full bg-secondary"></div>}
                    </div>
                    <span className="text-white font-medium text-sm">Umum & Mahasiswa Luar Vokasi</span>
                  </label>
                </div>
              </div>

              {/* DYNAMIC FIELDS */}
              {category === "vokasi_its" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
                  <div className="space-y-2">
                    <label className="font-semibold text-sm text-slate-100 uppercase tracking-wider block">NRP *</label>
                    <input required type="text" value={nrp} onChange={e => setNrp(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-medium" placeholder="Masukkan NRP" />
                  </div>
                  <div className="space-y-2">
                    <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">Upload Scan Kartu Pelajar/KTM (PDF) *</label>
                    <div className="relative w-full mt-2">
                      <input required accept=".pdf" type="file" onChange={e => setKtmProof(e.target.files?.[0] || null)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                      <div className="w-full border-2 border-dashed border-white/15 rounded-lg py-6 flex flex-col items-center justify-center bg-white/5 hover:bg-white/10 transition-colors">
                        <UploadCloud className="w-6 h-6 text-slate-300 mb-2" />
                        <span className="text-white font-medium text-sm">{ktmProof ? ktmProof.name : "Pilih File (.pdf)"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {category === "umum" && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-4 duration-300">
                  <label className="font-semibold text-sm text-slate-100 uppercase tracking-wider block">Asal Instansi/Universitas *</label>
                  <input required type="text" value={asalInstansi} onChange={e => setAsalInstansi(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-medium" placeholder="Contoh: Universitas Brawijaya" />
                </div>
              )}
            </div>
          </div>

          {/* SECTION 2: PEMBAYARAN */}
          <div className="bg-slate-950/60 backdrop-blur-xl rounded-2xl p-6 md:p-10 relative overflow-hidden shadow-[0_4px_25px_rgba(0,0,0,0.5)] border border-white/10">
            <div className="mb-8">
              <CustomHeading as="h2" text="Pembayaran" className="text-2xl md:text-3xl text-primary-fixed flex items-center gap-3" />
            </div>
            
            {(category === "bpc_bcc" || category === "vokasi_its") ? (
              <div className="p-6 rounded-xl border border-secondary/30 bg-secondary/10 flex items-center gap-4">
                <CheckCircle className="w-8 h-8 text-secondary" />
                <div>
                  <h3 className="font-semibold text-lg text-white">Harga Tiket: GRATIS (Rp 0)</h3>
                  <p className="text-sm text-slate-300">Tidak perlu melakukan pembayaran untuk kategori Anda.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-8 animate-in fade-in duration-300">
                <div className="p-4 rounded-xl border border-secondary/50 bg-secondary/10 flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold text-xs uppercase text-secondary tracking-wider">
                      Tiket Seminar Umum (Fase: {cmsPricing.phase})
                    </h3>
                    <p className="font-headline-md text-2xl text-white font-bold mt-1">
                      Pembayaran Rp {effectivePrice.toLocaleString("id-ID")}
                    </p>
                  </div>
                </div>

                {/* Promo / Voucher Input */}
                <PromoVoucherInput
                  activePromos={activePromos}
                  targetEventContext="Seminar"
                  basePrice={cmsPricing.price}
                  appliedPromo={appliedPromo}
                  onApplyPromo={(promo, discount) => {
                    setAppliedPromo(promo);
                    setPromoDiscount(discount);
                  }}
                  onRemovePromo={() => {
                    setAppliedPromo(null);
                    setPromoDiscount(0);
                  }}
                  disabled={isEventFull || isPhaseFull}
                />

                <div className="space-y-4">
                  <label className="font-semibold text-sm text-slate-100 uppercase tracking-wider block">Metode Pembayaran *</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Option 1: Bank Transfer (BNI) */}
                    <label 
                      className={`cursor-pointer rounded-xl p-4 border flex items-center gap-3.5 transition-all duration-300 ${
                        paymentMethod === 'bni' 
                          ? 'bg-secondary/20 border-secondary shadow-[0_0_15px_rgba(176,198,255,0.15)]' 
                          : 'bg-black/30 border-white/10 hover:border-white/20'
                      }`}
                    >
                      <input 
                        type="radio" 
                        name="paymentMethod" 
                        value="bni" 
                        checked={paymentMethod === 'bni'} 
                        onChange={() => setPaymentMethod('bni')} 
                        className="hidden" 
                      />
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${paymentMethod === 'bni' ? 'border-secondary' : 'border-slate-400'}`}>
                        {paymentMethod === 'bni' && <div className="w-2.5 h-2.5 rounded-full bg-secondary" />}
                      </div>
                      <CreditCard className="w-5 h-5 text-secondary" />
                      <span className="text-white font-medium text-sm">Bank Transfer (BNI)</span>
                    </label>
                    
                    {/* Option 2: QRIS Digital */}
                    <label 
                      className={`cursor-pointer rounded-xl p-4 border flex items-center justify-between gap-3.5 transition-all duration-300 ${
                        paymentMethod === 'qris' 
                          ? 'bg-secondary/20 border-secondary shadow-[0_0_15px_rgba(176,198,255,0.15)]' 
                          : 'bg-black/30 border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <input 
                          type="radio" 
                          name="paymentMethod" 
                          value="qris" 
                          checked={paymentMethod === 'qris'} 
                          onChange={() => setPaymentMethod('qris')} 
                          className="hidden" 
                        />
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${paymentMethod === 'qris' ? 'border-secondary' : 'border-slate-400'}`}>
                          {paymentMethod === 'qris' && <div className="w-2.5 h-2.5 rounded-full bg-secondary" />}
                        </div>
                        <QrCode className="w-5 h-5 text-secondary" />
                        <span className="text-white font-medium text-sm">QRIS Digital</span>
                      </div>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Belum Tersedia
                      </span>
                    </label>
                  </div>

                  {/* Transfer Destination Details / QRIS Notice */}
                  <div className="mt-4 transition-all duration-300">
                    {paymentMethod === 'bni' ? (
                      <div className="p-6 rounded-xl border-l-4 border-l-secondary bg-black/30 border border-white/10 animate-in fade-in duration-300">
                        <h4 className="text-secondary mb-2 text-xs uppercase tracking-wider font-semibold">Tujuan Transfer:</h4>
                        <p className="text-white text-base font-medium mb-1">BNI (Bank Negara Indonesia)</p>
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-white font-mono text-2xl tracking-wider font-bold">1433025776</span>
                          <button
                            type="button"
                            onClick={handleCopyAccountNumber}
                            className="px-3 py-1 rounded bg-secondary/20 hover:bg-secondary/30 text-secondary text-xs font-semibold flex items-center gap-1.5 transition-colors border border-secondary/30"
                          >
                            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{copied ? "Tersalin" : "Salin"}</span>
                          </button>
                        </div>
                        <p className="text-slate-300 text-sm font-medium">a.n Amalia Fitria Damaiyanti</p>
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

                <div className="space-y-2">
                  <label className="font-semibold text-sm text-slate-100 uppercase tracking-wider block">Nama Pemilik Rekening / Akun E-Wallet *</label>
                  <input required type="text" value={accountName} onChange={e => setAccountName(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-medium" placeholder="Nama yang tertera pada rekening pengirim" />
                </div>

                <div className="space-y-2">
                  <label className="font-semibold text-sm text-slate-100 uppercase tracking-wider block">Upload Bukti Transfer *</label>
                  <div className="relative w-full">
                    <input required accept="image/*" type="file" onChange={e => setPaymentProof(e.target.files?.[0] || null)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                    <div className="w-full border-2 border-dashed border-white/15 rounded-lg py-8 flex flex-col items-center justify-center bg-white/5 hover:bg-white/10 transition-colors">
                      <UploadCloud className="w-8 h-8 text-slate-300 mb-2" />
                      <span className="text-white font-medium">{paymentProof ? paymentProof.name : "Unggah Bukti Transfer (JPG/PNG/PDF)"}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 3: PERSYARATAN */}
          <div className="bg-slate-950/60 backdrop-blur-xl rounded-2xl p-6 md:p-10 relative overflow-hidden shadow-[0_4px_25px_rgba(0,0,0,0.5)] border border-white/10">
            <div className="mb-8">
              <CustomHeading as="h2" text="Persyaratan" className="text-2xl md:text-3xl text-primary-fixed flex items-center gap-3" />
            </div>
            
            <div className="space-y-8">
              <div className="space-y-2">
                <label className="font-semibold text-sm text-slate-100 uppercase tracking-wider block flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-secondary" /> Upload Bukti Follow IG (@voitsfest) *
                </label>
                <div className="relative w-full mt-2">
                  <input required accept="image/*" type="file" onChange={e => setIgProof(e.target.files?.[0] || null)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                  <div className="w-full border-2 border-dashed border-white/15 rounded-lg py-6 flex flex-col items-center justify-center bg-white/5 hover:bg-white/10 transition-colors">
                    <UploadCloud className="w-6 h-6 text-slate-300 mb-2" />
                    <span className="text-white font-medium text-sm">{igProof ? igProof.name : "Pilih File Gambar (JPG/PNG)"}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="font-semibold text-sm text-slate-100 uppercase tracking-wider block flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-secondary" /> Upload Screenshot Repost Story *
                </label>
                <p className="text-xs text-slate-300 mb-2 font-medium">Pastikan mention @voitsfest & 3 teman</p>
                <div className="relative w-full mt-2">
                  <input required accept="image/*" type="file" onChange={e => setStoryProof(e.target.files?.[0] || null)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                  <div className="w-full border-2 border-dashed border-white/15 rounded-lg py-6 flex flex-col items-center justify-center bg-white/5 hover:bg-white/10 transition-colors">
                    <UploadCloud className="w-6 h-6 text-slate-300 mb-2" />
                    <span className="text-white font-medium text-sm">{storyProof ? storyProof.name : "Pilih File Gambar (JPG/PNG)"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 pt-4">
            <button 
              disabled={!isFormValid || isSubmitting || !isAvailable} 
              type="submit" 
              className={`px-8 py-4 rounded-full font-medium tracking-wider uppercase flex items-center gap-3 transition-all ${
                isSubmitting
                  ? "bg-primary-container text-primary opacity-60 cursor-not-allowed pointer-events-none"
                  : !isFormValid || !isAvailable
                  ? "bg-primary-container text-primary opacity-50 cursor-not-allowed" 
                  : "bg-primary-container text-primary hover:bg-primary-container/80 shadow-[0_0_20px_rgba(176,198,255,0.2)] cursor-pointer"
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Memproses Pendaftaran...</span>
                </>
              ) : isEventFull || isPhaseFull ? (
                <span>Sold Out / Kuota Habis</span>
              ) : !isAvailable ? (
                <span>{availabilityReason === "phase_date_not_started" ? "Periode Belum Dimulai" : "Periode Berakhir"}</span>
              ) : (
                <>
                  <span>Submit Registration</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
            {isEventFull || isPhaseFull ? (
              <p className="text-xs text-error font-medium">
                Kuota pendaftaran seminar saat ini telah habis (Sold Out / Kuota Habis).
              </p>
            ) : !isAvailable ? (
              <p className="text-xs text-slate-300 font-medium">
                {availabilityReason === "phase_date_not_started" ? "Periode pendaftaran belum dimulai." : "Periode pendaftaran telah berakhir."}
              </p>
            ) : !isFormValid ? (
              <p className="text-xs text-on-surface-variant/70 font-poppins">
                Lengkapi seluruh data wajib &amp; persyaratan di atas untuk dapat mengirim pendaftaran.
              </p>
            ) : null}
          </div>
        </form>
      </main>
      
      <Footer />
      </div>
    </GatewayGuard>
  );
}
