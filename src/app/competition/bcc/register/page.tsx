"use client";

import { useState, useMemo, useEffect } from "react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import CustomHeading from "@/components/ui/CustomHeading";
import { createClient } from "@/lib/supabase/client";
import { 
  UploadCloud, 
  User, 
  Star, 
  CheckCircle, 
  ArrowRight, 
  Banknote, 
  QrCode, 
  FileText,
  Info,
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

export default function BccRegisterPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Dynamic Pricing & Two-Tier Quota via Supabase Realtime
  const {
    pricing: cmsPricing,
    quota: subQuota,
    activePromos,
    isPhaseFull,
    isEventFull,
    isAvailable,
    availabilityReason,
  } = useLivePricingAndQuota("bcc");

  const [appliedPromo, setAppliedPromo] = useState<Promo | null>(null);
  const [promoDiscount, setPromoDiscount] = useState(0);

  const effectivePrice = Math.max(0, cmsPricing.price - promoDiscount);

  // Form State
  const [teamName, setTeamName] = useState("");
  const [institution, setInstitution] = useState("");

  const [leader, setLeader] = useState({ name: "", email: "", whatsapp: "", jenjang: "", fakultas: "", jurusan: "" });
  const [member2, setMember2] = useState({ name: "", jenjang: "", fakultas: "", jurusan: "" });
  const [member3, setMember3] = useState({ name: "", jenjang: "", fakultas: "", jurusan: "" });

  const [paymentMethod, setPaymentMethod] = useState<"bni" | "qris">("bni");
  const [accountName, setAccountName] = useState("");

  const handleCopyAccountNumber = () => {
    navigator.clipboard.writeText("1433025776");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Files State
  const [leaderKtm, setLeaderKtm] = useState<File | null>(null);
  const [member2Ktm, setMember2Ktm] = useState<File | null>(null);
  const [member3Ktm, setMember3Ktm] = useState<File | null>(null);
  const [proposalFile, setProposalFile] = useState<File | null>(null);
  const [igProofs, setIgProofs] = useState<FileList | null>(null);
  const [storyProofs, setStoryProofs] = useState<FileList | null>(null);
  const [commentProofs, setCommentProofs] = useState<FileList | null>(null);
  const [paymentProof, setPaymentProof] = useState<File | null>(null);

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

  const uploadMultipleFiles = async (files: FileList | null, path: string): Promise<string[]> => {
    if (!files) return [];
    const urls: string[] = [];
    for (let i = 0; i < files.length; i++) {
      urls.push(await handleFileUpload(files[i], path));
    }
    return urls;
  };

  // Comprehensive Form Validation Check
  const isFormValid = useMemo(() => {
    // 1. Team & Institution
    if (!teamName.trim()) return false;
    if (!institution.trim()) return false;

    // 2. Leader details
    if (!leader.name.trim()) return false;
    if (!leader.whatsapp.trim()) return false;
    if (!leader.email.trim()) return false;
    if (!leader.jenjang) return false;
    if (!leader.fakultas.trim()) return false;
    if (!leader.jurusan.trim()) return false;
    if (!leaderKtm) return false;

    // 3. Optional Member 2 (if name provided, other fields must be complete)
    if (member2.name.trim()) {
      if (!member2.jenjang || !member2.fakultas.trim() || !member2.jurusan.trim() || !member2Ktm) {
        return false;
      }
    }

    // 4. Optional Member 3 (if name provided, other fields must be complete)
    if (member3.name.trim()) {
      if (!member3.jenjang || !member3.fakultas.trim() || !member3.jurusan.trim() || !member3Ktm) {
        return false;
      }
    }

    // 5. Proposal file
    if (!proposalFile) return false;

    // 6. Requirements proofs
    if (!igProofs || igProofs.length === 0) return false;
    if (!storyProofs || storyProofs.length === 0) return false;
    if (!commentProofs || commentProofs.length === 0) return false;

    // 7. Payment method & proof
    if (paymentMethod !== "bni") return false;
    if (!paymentProof) return false;

    return true;
  }, [
    teamName,
    institution,
    leader,
    leaderKtm,
    member2,
    member2Ktm,
    member3,
    member3Ktm,
    proposalFile,
    igProofs,
    storyProofs,
    commentProofs,
    paymentMethod,
    paymentProof,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    if (!isFormValid || !isAvailable) {
      if (!isAvailable) {
        setError(
          isEventFull
            ? "Sold Out / Kapasitas Penuh. Total kuota pendaftaran telah mencapai batas maksimal."
            : isPhaseFull
            ? "Kuota Fase Penuh. Kuota pendaftaran fase ini sudah habis terjual."
            : availabilityReason === "phase_date_not_started"
            ? "Periode Belum Dimulai. Pendaftaran belum dibuka."
            : "Periode Berakhir. Periode pendaftaran telah berakhir."
        );
      }
      setIsSubmitting(false);
      return;
    }

    // Lifecycle Rule 1: Server-Side Pre-Checkout Guard
    const serverGuard = await validatePreCheckoutGuard("bcc", 1, appliedPromo?.id);
    if (!serverGuard.valid) {
      setError(serverGuard.error || "Pendaftaran tidak dapat diproses karena batas kuota atau periode aktif.");
      setIsSubmitting(false);
      return;
    }

    // Quota Availability Check with Guard 1 & Guard 2
    const quotaCheck = await checkQuotaAvailability("bcc", 1, appliedPromo?.id);
    if (!quotaCheck.available) {
      setError(quotaCheck.error || "Kuota pendaftaran BCC telah penuh. Silakan hubungi panitia.");
      setIsSubmitting(false);
      return;
    }

    try {
      // Validation
      if (paymentMethod !== "bni") throw new Error("Untuk Saat Ini Layanan QRIS Belum Tersedia. Silakan gunakan transfer Bank BNI.");
      if (!leaderKtm) throw new Error("Ketua Tim KTM is required");
      if (!proposalFile) throw new Error("Proposal File is required");
      if (!paymentProof) throw new Error("Payment Proof is required");
      if (!igProofs || igProofs.length === 0) throw new Error("IG Follow proof is required");
      if (!storyProofs || storyProofs.length === 0) throw new Error("Story Repost proof is required");
      if (!commentProofs || commentProofs.length === 0) throw new Error("Comment proof is required");

      // 1. Upload Files
      const leaderKtmUrl = await handleFileUpload(leaderKtm!, "bcc/ktm");
      const member2KtmUrl = member2Ktm ? await handleFileUpload(member2Ktm!, "bcc/ktm") : null;
      const member3KtmUrl = member3Ktm ? await handleFileUpload(member3Ktm!, "bcc/ktm") : null;
      const proposalUrl = await handleFileUpload(proposalFile!, "bcc/proposals");
      
      const igProofUrls = await uploadMultipleFiles(igProofs!, "bcc/social");
      const storyProofUrls = await uploadMultipleFiles(storyProofs!, "bcc/social");
      const commentProofUrls = await uploadMultipleFiles(commentProofs!, "bcc/social");
      
      const paymentProofUrl = await handleFileUpload(paymentProof!, "bcc/payments");

      // 2. Prepare Member Data JSON
      const members = [
        {
          role: "leader",
          name: leader.name,
          email: leader.email,
          whatsapp: leader.whatsapp,
          jenjang: leader.jenjang,
          fakultas: leader.fakultas,
          jurusan: leader.jurusan,
          ktm_url: leaderKtmUrl,
          social_proofs: {
            ig: igProofUrls,
            story: storyProofUrls,
            comment: commentProofUrls
          }
        }
      ];

      if (member2.name) {
        members.push({
          role: "member",
          name: member2.name,
          email: "",
          whatsapp: "",
          jenjang: member2.jenjang,
          fakultas: member2.fakultas,
          jurusan: member2.jurusan,
          ktm_url: member2KtmUrl || "",
          social_proofs: { ig: [], story: [], comment: [] }
        });
      }

      if (member3.name) {
        members.push({
          role: "member",
          name: member3.name,
          email: "",
          whatsapp: "",
          jenjang: member3.jenjang,
          fakultas: member3.fakultas,
          jurusan: member3.jurusan,
          ktm_url: member3KtmUrl || "",
          social_proofs: { ig: [], story: [], comment: [] }
        });
      }

      // 3. Insert BCC Registration
      const { data: bccData, error: bccError } = await supabase
        .from("bcc_registrations")
        .insert({
          team_name: teamName,
          leader_name: leader.name,
          leader_email: leader.email,
          institution: institution,
          member_names: members,
          proposal_url: proposalUrl,
          stage: 3,
          status: "pending"
        })
        .select()
        .single();

      if (bccError) throw bccError;

      // 4. Insert Transaction
      const { error: txError } = await supabase
        .from("transactions")
        .insert({
          source_type: "bcc",
          source_id: bccData.id,
          sub_event_type: "BCC",
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

      // Real-time Quota Synchronization Dispatch
      dispatchQuotaRefresh();

      setIsSuccess(true);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="text-on-background font-poppins overflow-x-hidden relative min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-grow flex items-center justify-center pt-24 pb-12 px-4 relative z-10">
          <div className="bg-slate-950/60 backdrop-blur-xl border border-white/10 border-t-4 border-t-secondary-fixed shadow-[0_4px_25px_rgba(0,0,0,0.5)] rounded-2xl max-w-xl md:max-w-2xl w-full p-6 md:p-8 text-center animate-in fade-in duration-300">
            <CheckCircle className="w-20 h-20 text-secondary-fixed mx-auto mb-6 drop-shadow-[0_0_15px_rgba(176,198,255,0.5)]" />
            <CustomHeading as="h1" text="Registration Successful" className="text-3xl text-white mb-4" />
            <p className="text-slate-300 font-poppins mb-6 leading-relaxed">
              Your response has been recorded. Our team will verify your registration and payment shortly.
            </p>

            {/* Official WhatsApp Channel Invitation */}
            <WhatsAppChannelSection />

            <div className="mt-8 pt-6 border-t border-white/10 flex justify-center">
              <Link href="/" className="inline-flex items-center justify-center bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold px-8 py-3.5 rounded-full tracking-wider uppercase transition-all duration-200 shadow-lg hover:shadow-amber-400/25 hover:scale-[1.02] active:scale-95 font-poppins text-xs md:text-sm cursor-pointer">
                Return to Home
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <GatewayGuard event="bcc">
      <div className="text-on-background font-poppins overflow-x-hidden relative min-h-screen">
        <Navbar />

      <main className="flex-grow pt-32 pb-24 px-6 md:px-12 lg:px-24 mx-auto w-full max-w-[1280px] relative z-10">
        <div className="text-center mb-16">
          <CustomHeading 
            as="h1" 
            text="BCC Registration" 
            className="text-4xl md:text-6xl text-white mb-4 drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)] drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] [text-shadow:0_3px_12px_rgba(0,0,0,0.85),0_0_20px_rgba(0,0,0,0.6)] tracking-tight text-center" 
          />
          <p className="font-poppins text-lg text-secondary-fixed-dim max-w-2xl mx-auto drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] [text-shadow:0_2px_8px_rgba(0,0,0,0.9)]">
            Complete your team details, business proposal, and payment in one seamless step.
          </p>
        </div>

        {/* Real-time SubEvent Quota & Availability Badge */}
        <SubEventQuotaBadge
          eventName="Business Case Competition (BCC)"
          pricing={cmsPricing}
          quota={subQuota}
          className="mb-8 max-w-4xl mx-auto"
        />

        {error && (
          <div className="mb-8 p-4 bg-error-container/20 border border-error text-error rounded-xl flex items-center gap-3">
            <Info className="w-6 h-6 flex-shrink-0" />
            <p className="font-poppins text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-12 max-w-4xl mx-auto">
          {/* SECTION 1: TEAM INFORMATION */}
          <div className="bg-slate-950/60 backdrop-blur-xl rounded-2xl p-6 md:p-10 relative overflow-hidden shadow-[0_4px_25px_rgba(0,0,0,0.5)] border border-white/10">
            <div className="mb-8 flex items-center gap-3">
              <User className="w-8 h-8 text-primary-fixed" />
              <CustomHeading as="h2" text="Team Information" className="text-2xl md:text-3xl text-primary-fixed" />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
              <div className="space-y-2">
                <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">Nama Tim *</label>
                <input required type="text" value={teamName} onChange={e => setTeamName(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins" placeholder="Masukkan nama tim" />
              </div>
              <div className="space-y-2">
                <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">Asal Instansi/Universitas *</label>
                <input required type="text" value={institution} onChange={e => setInstitution(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins" placeholder="Contoh: Universitas Indonesia" />
              </div>
            </div>

            <div className="w-full h-px bg-white/10 my-8"></div>

            {/* LEADER */}
            <div className="mb-10">
              <div className="flex items-center gap-2 mb-6">
                <Star className="w-6 h-6 text-primary-fixed" />
                <h3 className="font-poppins font-semibold text-xl text-white">Member 1 (Ketua Tim) *</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="font-poppins font-semibold text-sm text-slate-100 uppercase block">Nama Lengkap</label>
                  <input required type="text" value={leader.name} onChange={e => setLeader({...leader, name: e.target.value})} className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins" placeholder="Sesuai kartu identitas" />
                </div>
                <div className="space-y-2">
                  <label className="font-poppins font-semibold text-sm text-slate-100 uppercase block">WhatsApp</label>
                  <input required type="tel" value={leader.whatsapp} onChange={e => setLeader({...leader, whatsapp: e.target.value})} className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins" placeholder="08xx (13-15 digit)" />
                </div>
                <div className="space-y-2">
                  <label className="font-poppins font-semibold text-sm text-slate-100 uppercase block">Email</label>
                  <input required type="email" value={leader.email} onChange={e => setLeader({...leader, email: e.target.value})} className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins" placeholder="Aktif dan sering diakses" />
                </div>
                <div className="space-y-2">
                  <label className="font-poppins font-semibold text-sm text-slate-100 uppercase block">Jenjang Pendidikan</label>
                  <select required value={leader.jenjang} onChange={e => setLeader({...leader, jenjang: e.target.value})} className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins cursor-pointer">
                    <option value="" disabled className="bg-slate-900 text-slate-400">Pilih Jenjang</option>
                    <option value="d1" className="bg-slate-900 text-white">D1</option>
                    <option value="d2" className="bg-slate-900 text-white">D2</option>
                    <option value="d3" className="bg-slate-900 text-white">D3</option>
                    <option value="d4" className="bg-slate-900 text-white">D4</option>
                    <option value="s1" className="bg-slate-900 text-white">S1</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="font-poppins font-semibold text-sm text-slate-100 uppercase block">Fakultas</label>
                  <input required type="text" value={leader.fakultas} onChange={e => setLeader({...leader, fakultas: e.target.value})} className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins" placeholder="Fakultas (Jika ada)" />
                </div>
                <div className="space-y-2">
                  <label className="font-poppins font-semibold text-sm text-slate-100 uppercase block">Jurusan</label>
                  <input required type="text" value={leader.jurusan} onChange={e => setLeader({...leader, jurusan: e.target.value})} className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins" placeholder="Jurusan" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="font-poppins font-semibold text-sm text-slate-100 uppercase block">Scan Kartu Pelajar/KTM (PDF)</label>
                  <div className="relative w-full">
                    <input required accept=".pdf" type="file" onChange={e => setLeaderKtm(e.target.files?.[0] || null)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                    <div className="w-full border-2 border-dashed border-white/15 rounded-lg py-8 flex flex-col items-center justify-center bg-white/5 hover:bg-white/10 transition-colors">
                      <UploadCloud className="w-8 h-8 text-slate-400 mb-2" />
                      <span className="text-white font-poppins font-medium">{leaderKtm ? leaderKtm.name : "Klik atau seret untuk unggah PDF"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="w-full h-px bg-white/10 my-8"></div>

            {/* MEMBERS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Member 2 */}
              <div className="p-6 border border-white/10 bg-black/30 rounded-xl space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-5 h-5 text-secondary" />
                  <h3 className="font-poppins font-semibold text-lg text-white">Member 2</h3>
                </div>
                <div className="space-y-4">
                  <input type="text" value={member2.name} onChange={e => setMember2({...member2, name: e.target.value})} className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary outline-none font-poppins" placeholder="Nama Lengkap" />
                  <select value={member2.jenjang} onChange={e => setMember2({...member2, jenjang: e.target.value})} className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-secondary focus:ring-1 focus:ring-secondary outline-none font-poppins cursor-pointer">
                    <option value="" disabled className="bg-slate-900 text-slate-400">Pilih Jenjang</option>
                    <option value="d1" className="bg-slate-900 text-white">D1</option>
                    <option value="d2" className="bg-slate-900 text-white">D2</option>
                    <option value="d3" className="bg-slate-900 text-white">D3</option>
                    <option value="d4" className="bg-slate-900 text-white">D4</option>
                    <option value="s1" className="bg-slate-900 text-white">S1</option>
                  </select>
                  <input type="text" value={member2.fakultas} onChange={e => setMember2({...member2, fakultas: e.target.value})} className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary outline-none font-poppins" placeholder="Fakultas" />
                  <input type="text" value={member2.jurusan} onChange={e => setMember2({...member2, jurusan: e.target.value})} className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary outline-none font-poppins" placeholder="Jurusan" />
                  <div className="relative w-full">
                    <input accept=".pdf" type="file" onChange={e => setMember2Ktm(e.target.files?.[0] || null)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                    <div className="w-full border-2 border-dashed border-white/15 rounded-lg py-4 flex flex-col items-center justify-center bg-white/5 hover:bg-white/10 transition-colors">
                      <span className="text-white font-poppins text-sm truncate px-2">{member2Ktm ? member2Ktm.name : "Unggah KTM (PDF)"}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Member 3 */}
              <div className="p-6 border border-white/10 bg-black/30 rounded-xl space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <User className="w-5 h-5 text-secondary" />
                    <h3 className="font-poppins font-semibold text-lg text-white">Member 3</h3>
                  </div>
                  <span className="text-[10px] bg-white/10 border border-white/10 text-slate-300 px-2 py-1 rounded-full uppercase font-poppins">Optional</span>
                </div>
                <div className="space-y-4">
                  <input type="text" value={member3.name} onChange={e => setMember3({...member3, name: e.target.value})} className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary outline-none font-poppins" placeholder="Nama Lengkap" />
                  <select value={member3.jenjang} onChange={e => setMember3({...member3, jenjang: e.target.value})} className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-secondary focus:ring-1 focus:ring-secondary outline-none font-poppins cursor-pointer">
                    <option value="" disabled className="bg-slate-900 text-slate-400">Pilih Jenjang</option>
                    <option value="d1" className="bg-slate-900 text-white">D1</option>
                    <option value="d2" className="bg-slate-900 text-white">D2</option>
                    <option value="d3" className="bg-slate-900 text-white">D3</option>
                    <option value="d4" className="bg-slate-900 text-white">D4</option>
                    <option value="s1" className="bg-slate-900 text-white">S1</option>
                  </select>
                  <input type="text" value={member3.fakultas} onChange={e => setMember3({...member3, fakultas: e.target.value})} className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary outline-none font-poppins" placeholder="Fakultas" />
                  <input type="text" value={member3.jurusan} onChange={e => setMember3({...member3, jurusan: e.target.value})} className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary outline-none font-poppins" placeholder="Jurusan" />
                  <div className="relative w-full">
                    <input accept=".pdf" type="file" onChange={e => setMember3Ktm(e.target.files?.[0] || null)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                    <div className="w-full border-2 border-dashed border-white/15 rounded-lg py-4 flex flex-col items-center justify-center bg-white/5 hover:bg-white/10 transition-colors">
                      <span className="text-white font-poppins text-sm truncate px-2">{member3Ktm ? member3Ktm.name : "Unggah KTM (PDF)"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: PROPOSAL & DOCS */}
          <div className="bg-slate-950/60 backdrop-blur-xl rounded-2xl p-6 md:p-10 relative overflow-hidden shadow-[0_4px_25px_rgba(0,0,0,0.5)] border border-white/10">
            <div className="mb-8 flex items-center gap-3">
              <FileText className="w-8 h-8 text-primary-fixed" />
              <CustomHeading as="h2" text="Documentation" className="text-2xl md:text-3xl text-primary-fixed" />
            </div>
            
            <div className="space-y-8">
              <div className="space-y-2">
                <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">Upload File Proposal BCC *</label>
                <p className="font-poppins text-xs text-slate-400 mb-2">Format Nama File: ProposalBCC_NamaTim_NamaKetuaTim. PDF (max. 1 file)</p>
                <div className="relative w-full">
                  <input required accept=".pdf" type="file" onChange={e => setProposalFile(e.target.files?.[0] || null)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                  <div className="w-full border-2 border-dashed border-white/15 rounded-lg py-12 flex flex-col items-center justify-center bg-white/5 hover:bg-white/10 transition-colors">
                    <UploadCloud className="w-10 h-10 text-slate-400 mb-3" />
                    <span className="text-white font-poppins font-medium">{proposalFile ? proposalFile.name : "Click to upload or drag and drop"}</span>
                  </div>
                </div>
              </div>

              <div className="w-full h-px bg-white/10 my-6"></div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="font-poppins font-semibold text-xs text-slate-100 uppercase tracking-wider block h-10">Bukti Follow IG (@voitsfest) *</label>
                  <div className="relative w-full h-32">
                    <input required accept="image/*" multiple type="file" onChange={e => setIgProofs(e.target.files)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                    <div className="w-full h-full border-2 border-dashed border-white/15 rounded-lg flex flex-col items-center justify-center bg-white/5 hover:bg-white/10 transition-colors">
                      <span className="text-white font-poppins text-xs text-center px-2">{igProofs?.length ? `${igProofs.length} files selected` : "Upload Image(s)"}</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="font-poppins font-semibold text-xs text-slate-100 uppercase tracking-wider block h-10">Screenshot Repost Story *</label>
                  <div className="relative w-full h-32">
                    <input required accept="image/*" multiple type="file" onChange={e => setStoryProofs(e.target.files)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                    <div className="w-full h-full border-2 border-dashed border-white/15 rounded-lg flex flex-col items-center justify-center bg-white/5 hover:bg-white/10 transition-colors">
                      <span className="text-white font-poppins text-xs text-center px-2">{storyProofs?.length ? `${storyProofs.length} files selected` : "Upload Image(s)"}</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="font-poppins font-semibold text-xs text-slate-100 uppercase tracking-wider block h-10">Screenshot Komentar Feed *</label>
                  <div className="relative w-full h-32">
                    <input required accept="image/*" multiple type="file" onChange={e => setCommentProofs(e.target.files)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                    <div className="w-full h-full border-2 border-dashed border-white/15 rounded-lg flex flex-col items-center justify-center bg-white/5 hover:bg-white/10 transition-colors">
                      <span className="text-white font-poppins text-xs text-center px-2">{commentProofs?.length ? `${commentProofs.length} files selected` : "Upload Image(s)"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 3: PEMBAYARAN */}
          <div className="bg-slate-950/60 backdrop-blur-xl rounded-2xl p-6 md:p-10 relative overflow-hidden shadow-[0_4px_25px_rgba(0,0,0,0.5)] border border-white/10">
            <div className="mb-8">
              <CustomHeading as="h2" text="Pembayaran" className="text-2xl md:text-3xl text-primary-fixed flex items-center gap-3" />
            </div>
            
            <div className="space-y-8 animate-in fade-in duration-300">
              {/* Total Price Banner */}
              <div className="p-5 rounded-xl border border-secondary/50 bg-secondary/10 flex justify-between items-center">
                <div>
                  <h3 className="font-semibold text-xs uppercase text-secondary tracking-wider">
                    Total Biaya Pendaftaran (Fase: {cmsPricing.phase})
                  </h3>
                  <p className="font-headline-md text-2xl text-white font-bold mt-1">
                    Rp {effectivePrice.toLocaleString("id-ID")}
                  </p>
                </div>
              </div>

              {/* Promo / Voucher Input */}
              <PromoVoucherInput
                activePromos={activePromos}
                targetEventContext="BCC"
                basePrice={cmsPricing.price}
                appliedPromo={appliedPromo}
                onApplyPromo={(p, discount) => {
                  setAppliedPromo(p);
                  setPromoDiscount(discount);
                }}
                onRemovePromo={() => {
                  setAppliedPromo(null);
                  setPromoDiscount(0);
                }}
                disabled={isEventFull || isPhaseFull}
              />

              {/* Metode Pembayaran */}
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
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${paymentMethod === 'bni' ? 'border-secondary' : 'border-neutral-600'}`}>
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
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${paymentMethod === 'qris' ? 'border-secondary' : 'border-neutral-600'}`}>
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

              {/* Sender Account Name */}
              <div className="space-y-2">
                <label className="font-semibold text-sm text-slate-100 uppercase tracking-wider block">Nama Pemilik Rekening Pengirim *</label>
                <input 
                  required 
                  type="text" 
                  value={accountName} 
                  onChange={e => setAccountName(e.target.value)} 
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-medium font-poppins" 
                  placeholder="Nama yang tertera pada rekening pengirim" 
                />
              </div>

              {/* Upload Proof */}
              <div className="space-y-2">
                <label className="font-semibold text-sm text-slate-100 uppercase tracking-wider block">Upload Bukti Transfer *</label>
                <div className="relative w-full">
                  <input 
                    required 
                    accept="image/*" 
                    type="file" 
                    onChange={e => setPaymentProof(e.target.files?.[0] || null)} 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                  />
                  <div className="w-full border-2 border-dashed border-white/15 rounded-lg py-8 flex flex-col items-center justify-center bg-white/5 hover:bg-white/10 transition-colors">
                    <UploadCloud className="w-8 h-8 text-slate-400 mb-2" />
                    <span className="text-white font-medium">
                      {paymentProof ? paymentProof.name : "Unggah Bukti Transfer (JPG/PNG/PDF)"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 pt-8">
            <button 
              disabled={!isFormValid || isSubmitting || !isAvailable} 
              type="submit" 
              className={`px-8 py-4 rounded-full font-medium tracking-wider uppercase flex items-center gap-3 transition-all font-poppins ${
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
              ) : isEventFull ? (
                <span>Sold Out / Kapasitas Penuh</span>
              ) : isPhaseFull ? (
                <span>Kuota Fase Penuh</span>
              ) : !isAvailable ? (
                <span>{availabilityReason === "phase_date_not_started" ? "Periode Belum Dimulai" : "Periode Berakhir"}</span>
              ) : (
                <>
                  <span>Submit Registration</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
            {isEventFull ? (
              <p className="text-xs text-error font-medium">
                Pendaftaran ditutup karena kapasitas maksimal BCC telah penuh (Sold Out / Kapasitas Penuh).
              </p>
            ) : isPhaseFull ? (
              <p className="text-xs text-amber-300 font-medium">
                Kuota pendaftaran untuk fase aktif ini sudah habis (Kuota Fase Penuh). Silakan menunggu pembukaan fase berikutnya.
              </p>
            ) : !isAvailable ? (
              <p className="text-xs text-slate-300 font-medium">
                {availabilityReason === "phase_date_not_started" ? "Periode pendaftaran belum dimulai." : "Periode pendaftaran telah berakhir."}
              </p>
            ) : !isFormValid ? (
              <p className="text-xs text-on-surface-variant/70 font-poppins">
                Lengkapi seluruh data tim, berkas, persyaratan, dan pembayaran untuk mengirim pendaftaran.
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
