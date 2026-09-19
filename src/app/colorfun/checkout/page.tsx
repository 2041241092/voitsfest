"use client";

import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import CustomHeading from "@/components/ui/CustomHeading";
import GatewayGuard from "@/components/gateway/GatewayGuard";
import { createClient } from "@/lib/supabase/client";
import { 
  Lock, 
  UploadCloud, 
  CheckCircle, 
  ArrowRight, 
  Copy, 
  Check, 
  Info, 
  QrCode, 
  CreditCard,
  Activity,
  Loader2,
  FileText,
  AlertCircle,
  Tag,
  Sparkles,
  Users,
  UserPlus,
  Download,
  Maximize2,
  X,
  Clock,
  Ban,
  Infinity
} from "lucide-react";
import { fetchPricingTiers, EventPricing, DEFAULT_PRICING_TIERS } from "@/lib/pricing";
import { itsDepartments } from "@/lib/departments";
import { Promo } from "@/types/database";
import { validatePromoForEvent, incrementPromoQuota, calculatePromoPrice } from "@/lib/promo";
import { checkQuotaAvailability, fetchAllSubEventQuotas, dispatchQuotaRefresh, listenToQuotaRefresh, QuotaStatus } from "@/lib/quota";
import { formatDisplayWIB, getEventTimeStatus, parseWibDate } from "@/lib/timeUtils";
import { formatBIB } from "@/lib/bib";
import SubEventQuotaBadge from "@/components/registration/SubEventQuotaBadge";
import WhatsAppChannelSection from "@/components/registration/WhatsAppChannelSection";
import imageCompression from "browser-image-compression";
import { validatePreCheckoutGuard, validateRegistrationBeforeInsert } from "@/app/actions/checkout";

async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    return file;
  }
  try {
    const options = {
      maxSizeMB: 0.2,
      maxWidthOrHeight: 1024,
      useWebWorker: true,
    };
    const compressedBlob = await imageCompression(file, options);
    return new File([compressedBlob], file.name, {
      type: compressedBlob.type || file.type,
      lastModified: Date.now(),
    });
  } catch (err) {
    console.warn("Kompresi gambar gagal, menggunakan file asli:", err);
    return file;
  }
}

export default function ColorFunCheckoutPage() {
  const router = useRouter();
  const pathname = usePathname();
  const currentPath = pathname || "/colorfun/checkout";

  // Stable Client Initialization: memoized to prevent re-instantiation across renders
  const supabase = useMemo(() => createClient(), []);

  // Auth & Session State (keep loading === true until setUserData completes)
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<{ fullName: string; phone: string; email: string }>({
    fullName: "",
    phone: "",
    email: "",
  });

  // Form State - Kategori Peserta (Section 1)
  const [kategoriPeserta, setKategoriPeserta] = useState<"Umum" | "Mahasiswa ITS">("Umum");
  const [departemen, setDepartemen] = useState("");
  const [nrp, setNrp] = useState("");
  const [ktmFile, setKtmFile] = useState<File | null>(null);

  // Dynamic Group Registration State
  interface ExtraMemberState {
    nama_lengkap: string;
    whatsapp: string;
    email: string;
    kategori_peserta: "Umum" | "Mahasiswa ITS";
    departemen: string;
    nrp: string;
    ktm_file: File | null;
    is_compressing_ktm?: boolean;
  }
  const [extraMembers, setExtraMembers] = useState<ExtraMemberState[]>([]);

  // Form State - Emergency Contact
  const [kontakDarurat, setKontakDarurat] = useState("");
  const [nomorWADarurat, setNomorWADarurat] = useState("");
  const [hubunganDarurat, setHubunganDarurat] = useState("");
  const [riwayatPenyakit, setRiwayatPenyakit] = useState("");
  const [riwayatAlergi, setRiwayatAlergi] = useState("");

  // Form State - Payment
  const [metodeBayar, setMetodeBayar] = useState<"bni" | "qris">("bni");
  const [rekeningPengirim, setRekeningPengirim] = useState("");
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [paymentProofPreview, setPaymentProofPreview] = useState<string | null>(null);
  const [persetujuanSehat, setPersetujuanSehat] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isQrisModalOpen, setIsQrisModalOpen] = useState(false);
  const [copiedNmid, setCopiedNmid] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);

  // Promo State
  const [promoCode, setPromoCode] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<Promo | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [isValidatingPromo, setIsValidatingPromo] = useState(false);
  const [activePromos, setActivePromos] = useState<Promo[]>([]);
  const [loadingPromos, setLoadingPromos] = useState(true);
  const [selectedPricingId, setSelectedPricingId] = useState<string>("standard");

  // Status & Feedback
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingStep, setSubmittingStep] = useState<string>("Mengompresi gambar...");
  const [isCompressingKtm, setIsCompressingKtm] = useState(false);
  const [isCompressingProof, setIsCompressingProof] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submittedRegistrations, setSubmittedRegistrations] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const ktmInputRef = useRef<HTMLInputElement>(null);

  // Dynamic Pricing & Quota from cms_settings & live registrations
  const [cmsPricing, setCmsPricing] = useState<EventPricing>(DEFAULT_PRICING_TIERS.colorfun);
  const [subQuota, setSubQuota] = useState<QuotaStatus | null>(null);

  const loadPricingAndQuota = useCallback(async () => {
    try {
      const [tiers, allQuotas] = await Promise.all([
        fetchPricingTiers(),
        fetchAllSubEventQuotas(),
      ]);
      if (tiers.colorfun) {
        setCmsPricing(tiers.colorfun);
      }
      if (allQuotas.colorfun) {
        setSubQuota(allQuotas.colorfun);
      }
    } catch (err) {
      console.warn("Error loading colorfun pricing and quota:", err);
    }
  }, []);

  useEffect(() => {
    loadPricingAndQuota();
  }, [loadPricingAndQuota]);

  // Fetch active promo bundles targeting ColorFun Run
  useEffect(() => {
    async function loadActivePromos() {
      setLoadingPromos(true);
      try {
        const { data, error: promoErr } = await supabase
          .from("promos")
          .select("*")
          .eq("is_active", true)
          .eq("target_event", "ColorFun Run")
          .order("created_at", { ascending: false });

        if (!promoErr && data) {
          setActivePromos(data as Promo[]);
        }
      } catch (err) {
        console.warn("Error loading active promos for ColorFun Run:", err);
      } finally {
        setLoadingPromos(false);
      }
    }
    loadActivePromos();

    const unsubscribe = listenToQuotaRefresh(() => {
      loadActivePromos();
      loadPricingAndQuota();
    });

    const channel = supabase
      .channel(`realtime-colorfun-checkout-${Math.random().toString(36).substring(2, 7)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cms_settings" }, () => {
        loadActivePromos();
        loadPricingAndQuota();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "promos" }, () => {
        loadActivePromos();
        loadPricingAndQuota();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "colorfun_registrations" }, () => {
        loadActivePromos();
        loadPricingAndQuota();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => {
        loadActivePromos();
        loadPricingAndQuota();
      })
      .subscribe();

    return () => {
      unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [supabase, loadPricingAndQuota]);

  // Read URL query parameter ?promoId=... on mount
  const [urlPromoId, setUrlPromoId] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const pId = params.get("promoId");
      if (pId) {
        setUrlPromoId(pId);
      }
    }
  }, []);

  // Auto-select promo card matching urlPromoId once promos are loaded
  useEffect(() => {
    if (!urlPromoId || activePromos.length === 0) return;
    const target = activePromos.find((p) => p.id === urlPromoId);
    if (target && selectedPricingId !== target.id) {
      const calc = validatePromoForEvent(target, "ColorFun Run", cmsPricing.price);
      if (calc.valid) {
        setSelectedPricingId(target.id);
        setAppliedPromo(calc.promo || target);
        setPromoCode(target.title);
        setPromoError(null);
      } else {
        setPromoError(calc.error || "Paket bundling dari tautan tidak tersedia atau telah habis.");
      }
    }
  }, [urlPromoId, activePromos, cmsPricing.price, selectedPricingId]);

  const CFR_TICKET_PRICE = cmsPricing.price;

  // Dynamic capacity tracking based on selected ticket/promo (Regular ticket defaults to 1)
  const kapasitas = useMemo(() => {
    if (selectedPricingId !== "standard" && appliedPromo?.kapasitas) {
      const k = Number(appliedPromo.kapasitas);
      return isNaN(k) || k < 1 ? 1 : k;
    }
    return 1;
  }, [selectedPricingId, appliedPromo]);

  // Strict Discount Calculation (Tipe A: %, Tipe B: Nominal, Tipe C: Bundling direct override)
  const { finalPrice, discountAmount, totalBasePrice } = useMemo(() => {
    return calculatePromoPrice(appliedPromo, CFR_TICKET_PRICE, kapasitas);
  }, [appliedPromo, CFR_TICKET_PRICE, kapasitas]);

  // Check if primary participant's category is locked by the active promo
  const isKategoriLocked = Boolean(
    appliedPromo?.kategori_peserta && appliedPromo.kategori_peserta !== "Semua"
  );
  const promoRequiredCategory = isKategoriLocked
    ? (appliedPromo!.kategori_peserta as "Umum" | "Mahasiswa ITS")
    : null;

  // Auto-Select Primary Participant Category when promo specifies a target category
  useEffect(() => {
    if (promoRequiredCategory) {
      setKategoriPeserta(promoRequiredCategory);
      if (promoRequiredCategory === "Umum") {
        setDepartemen("");
        setNrp("");
        setKtmFile(null);
        if (ktmInputRef.current) {
          ktmInputRef.current.value = "";
        }
      }
    }
  }, [promoRequiredCategory]);

  // Synchronize extraMembers array length dynamically when kapasitas changes
  useEffect(() => {
    const targetCount = Math.max(0, kapasitas - 1);
    setExtraMembers((prev) => {
      if (prev.length === targetCount) return prev;
      if (prev.length < targetCount) {
        const added: ExtraMemberState[] = Array.from(
          { length: targetCount - prev.length },
          () => ({
            nama_lengkap: "",
            whatsapp: "",
            email: "",
            kategori_peserta: "Umum",
            departemen: "",
            nrp: "",
            ktm_file: null,
          })
        );
        return [...prev, ...added];
      }
      return prev.slice(0, targetCount);
    });
  }, [kapasitas]);

  const handleExtraMemberChange = (index: number, field: keyof ExtraMemberState, value: any) => {
    setExtraMembers((prev) => {
      const updated = [...prev];
      if (!updated[index]) return prev;
      updated[index] = { ...updated[index], [field]: value };
      if (field === "kategori_peserta" && value === "Umum") {
        updated[index].departemen = "";
        updated[index].nrp = "";
        updated[index].ktm_file = null;
      }
      return updated;
    });
  };

  const handleExtraMemberKtmChange = async (index: number, file: File | null) => {
    if (!file) {
      handleExtraMemberChange(index, "ktm_file", null);
      return;
    }

    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    if (!isImage && !isPdf) {
      setError(`File Scan Kartu Pelajar / KTM Anggota ${index + 1} harus berformat Gambar (JPG/PNG) atau PDF.`);
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setError(`Ukuran file KTM Anggota ${index + 1} maksimal 15MB sebelum kompresi.`);
      return;
    }

    setError(null);
    if (isImage) {
      setExtraMembers((prev) => {
        const updated = [...prev];
        if (updated[index]) updated[index] = { ...updated[index], is_compressing_ktm: true };
        return updated;
      });
      try {
        const compressed = await compressImage(file);
        setExtraMembers((prev) => {
          const updated = [...prev];
          if (updated[index]) {
            updated[index] = { ...updated[index], ktm_file: compressed, is_compressing_ktm: false };
          }
          return updated;
        });
      } catch (err) {
        console.error(`Gagal kompresi KTM Anggota ${index + 1}:`, err);
        setExtraMembers((prev) => {
          const updated = [...prev];
          if (updated[index]) {
            updated[index] = { ...updated[index], ktm_file: file, is_compressing_ktm: false };
          }
          return updated;
        });
      }
    } else {
      handleExtraMemberChange(index, "ktm_file", file);
    }
  };

  // 1. Client-Side Auth Guard with getUser() & 3-Second Fallback Timeout
  useEffect(() => {
    let isMounted = true;
    let authResolved = false;

    // Safety Fallback Timeout: ensures setLoading(false) is reached within 3 seconds
    const fallbackTimer = setTimeout(() => {
      if (isMounted && !authResolved) {
        console.warn("Auth check exceeded 3s timeout. Triggering safety fallback.");
        setLoading(false);
        // If no user was resolved by timeout, redirect to login
        router.replace(`/login?redirect=${encodeURIComponent(currentPath)}`);
      }
    }, 3000);

    async function checkAuth() {
      try {
        // Use getUser() instead of getSession() to avoid hanging promise locks
        const { data: { user: authUser }, error: userError } = await supabase.auth.getUser();

        if (!isMounted) return;

        if (userError || !authUser) {
          authResolved = true;
          clearTimeout(fallbackTimer);
          setLoading(false);
          router.replace(`/login?redirect=${encodeURIComponent(currentPath)}`);
          return;
        }

        authResolved = true;
        setUser(authUser);

        // Fetch user profile from profiles table by id === authUser.id
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", authUser.id)
          .maybeSingle();

        console.log('--- DEBUG PROFILE FETCH ---', { rawUser: authUser, profileData: profile });

        if (!isMounted) return;

        const profileData = profile as any;
        const meta = authUser?.user_metadata as any;

        // Fallback Resolution:
        const fullName =
          profileData?.full_name ||
          meta?.full_name ||
          authUser?.email?.split("@")[0] ||
          "Nama belum diatur";

        const resolvedPhone = 
          profileData?.phone || 
          profileData?.phone_number || 
          profileData?.whatsapp || 
          profileData?.whatsapp_number || 
          profileData?.no_wa || 
          meta?.phone || 
          meta?.phone_number || 
          meta?.whatsapp || 
          meta?.whatsapp_number || 
          authUser?.phone || 
          'Nomor belum diatur';

        const email =
          profileData?.email ||
          authUser?.email ||
          "Email tidak ditemukan";

        // Update dedicated state
        setUserData({
          fullName,
          phone: resolvedPhone,
          email,
        });

        // Keep loading === true until setUserData has completed, ensuring inputs never mount with empty strings
        setLoading(false);
      } catch (err) {
        console.error("Client auth verification error:", err);
        if (isMounted) {
          router.replace(`/login?redirect=${encodeURIComponent(currentPath)}`);
        }
      } finally {
        if (isMounted) {
          clearTimeout(fallbackTimer);
          setLoading(false);
        }
      }
    }

    checkAuth();

    return () => {
      isMounted = false;
      clearTimeout(fallbackTimer);
    };
  }, [currentPath, router, supabase]);

  // Handle Kategori Peserta Change
  const handleKategoriChange = (newCategory: "Umum" | "Mahasiswa ITS") => {
    setKategoriPeserta(newCategory);
    if (newCategory === "Umum") {
      setDepartemen("");
      setNrp("");
      setKtmFile(null);
      if (ktmInputRef.current) {
        ktmInputRef.current.value = "";
      }
    }
  };

  // Handle KTM File Change with client-side image compression
  const handleKtmFileChange = async (file: File | null) => {
    if (!file) {
      setKtmFile(null);
      return;
    }

    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    if (!isImage && !isPdf) {
      setError("File Scan Kartu Pelajar / KTM harus berformat Gambar (JPG/PNG) atau PDF (.pdf).");
      setKtmFile(null);
      if (ktmInputRef.current) {
        ktmInputRef.current.value = "";
      }
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setError("Ukuran file KTM maksimal 15MB sebelum kompresi.");
      setKtmFile(null);
      if (ktmInputRef.current) {
        ktmInputRef.current.value = "";
      }
      return;
    }

    setError(null);
    if (isImage) {
      setIsCompressingKtm(true);
      try {
        const compressed = await compressImage(file);
        setKtmFile(compressed);
      } catch (err) {
        console.error("Gagal kompresi file KTM:", err);
        setKtmFile(file);
      } finally {
        setIsCompressingKtm(false);
      }
    } else {
      setKtmFile(file);
    }
  };

  // Handle Payment Proof File Change with client-side image compression
  const handleFileChange = async (file: File | null) => {
    if (!file) {
      setPaymentProofFile(null);
      setPaymentProofPreview(null);
      return;
    }

    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    if (!isImage && !isPdf) {
      setError("File bukti transfer harus berformat JPG, PNG, atau PDF.");
      return;
    }

    if (isPdf && file.size > 2 * 1024 * 1024) {
      setError("Ukuran file PDF bukti transfer maksimal 2MB.");
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setError("Ukuran file bukti transfer maksimal 15MB sebelum kompresi.");
      return;
    }

    setError(null);

    if (isImage) {
      setIsCompressingProof(true);
      try {
        const compressed = await compressImage(file);
        setPaymentProofFile(compressed);
        const objectUrl = URL.createObjectURL(compressed);
        setPaymentProofPreview(objectUrl);
      } catch (err) {
        console.error("Gagal kompresi bukti transfer:", err);
        setPaymentProofFile(file);
        const objectUrl = URL.createObjectURL(file);
        setPaymentProofPreview(objectUrl);
      } finally {
        setIsCompressingProof(false);
      }
    } else {
      setPaymentProofFile(file);
      setPaymentProofPreview(null);
    }
  };

  // Select Standard Base Price
  const handleSelectStandardPrice = () => {
    setSelectedPricingId("standard");
    setAppliedPromo(null);
    setPromoCode("");
    setPromoError(null);
  };

  // Select a Promo Bundle Card
  const handleSelectPromoOption = (promo: Promo) => {
    if (selectedPricingId === promo.id) {
      // Toggle off if already selected -> return to standard
      handleSelectStandardPrice();
      return;
    }

    const result = validatePromoForEvent(promo, "ColorFun Run", CFR_TICKET_PRICE);
    if (!result.valid) {
      setPromoError(result.error || "Promo ini tidak dapat diterapkan.");
      return;
    }

    setSelectedPricingId(promo.id);
    setAppliedPromo(result.promo || promo);
    setPromoCode(promo.title);
    setPromoError(null);
  };

  // Apply Promo Handler (manual code input)
  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return;
    setPromoError(null);
    setIsValidatingPromo(true);

    try {
      const { data, error: fetchErr } = await supabase
        .from("promos")
        .select("*")
        .ilike("title", promoCode.trim())
        .maybeSingle();

      if (fetchErr || !data) {
        setPromoError("Kode promo tidak ditemukan.");
        setAppliedPromo(null);
        setSelectedPricingId("standard");
        return;
      }

      const p = data as Promo;
      const { isActive } = getEventTimeStatus(p.start_date, p.end_date);
      const isQuotaFull = p.kuota_maksimal !== null && p.kuota_maksimal !== undefined && (p.kuota_terpakai ?? 0) >= p.kuota_maksimal;
      if (!p.is_active || !isActive || isQuotaFull) {
        setPromoError("Kode promo sudah melewati periode aktif atau kuota telah habis");
        setAppliedPromo(null);
        setSelectedPricingId("standard");
        return;
      }

      const result = validatePromoForEvent(p, "ColorFun Run", CFR_TICKET_PRICE);
      if (!result.valid) {
        setPromoError(result.error || "Kode promo sudah melewati periode aktif atau kuota telah habis");
        setAppliedPromo(null);
        setSelectedPricingId("standard");
        return;
      }

      setAppliedPromo(result.promo || null);
      setSelectedPricingId(result.promo?.id || "custom");
      setPromoError(null);
    } catch (err: any) {
      setPromoError("Gagal memvalidasi kode promo: " + (err.message || ""));
    } finally {
      setIsValidatingPromo(false);
    }
  };

  const handleRemovePromo = () => {
    setAppliedPromo(null);
    setPromoCode("");
    setPromoError(null);
    setSelectedPricingId("standard");
  };

  // Copy BNI Account Number
  const handleCopyAccountNumber = () => {
    navigator.clipboard.writeText("1433025776");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Copy QRIS NMID
  const handleCopyNmid = () => {
    navigator.clipboard.writeText("ID1026592450039");
    setCopiedNmid(true);
    setTimeout(() => setCopiedNmid(false), 2000);
  };

  // Copy Total Amount
  const handleCopyAmount = () => {
    navigator.clipboard.writeText(finalPrice.toString());
    setCopiedAmount(true);
    setTimeout(() => setCopiedAmount(false), 2000);
  };

  // Comprehensive Form Validation Check
  const isFormValid = useMemo(() => {
    if (loading || !user || isCompressingKtm || isCompressingProof) return false;

    // 0. Payment method must be selected (bni or qris)
    if (metodeBayar !== "bni" && metodeBayar !== "qris") return false;

    // 1. Payment proof file selected
    if (!paymentProofFile) return false;

    // 2. Personal & Emergency details
    if (!kontakDarurat.trim()) return false;
    if (!nomorWADarurat.trim()) return false;
    if (!hubunganDarurat) return false;

    // 3. Sender account name
    if (!rekeningPengirim.trim()) return false;

    // 4. Terms / Waiver agreement
    if (!persetujuanSehat) return false;

    // 5. Category-specific validation: Mahasiswa ITS requires Departemen, NRP & KTM
    if (kategoriPeserta === "Mahasiswa ITS") {
      if (!departemen.trim()) return false;
      if (!nrp.trim()) return false;
      if (!ktmFile) return false;
    }

    // 6. Dynamic Extra Members validation
    for (const member of extraMembers) {
      if (!member.nama_lengkap.trim()) return false;
      if (!member.whatsapp.trim()) return false;
      if (!member.email.trim()) return false;
      if (member.is_compressing_ktm) return false;
      if (member.kategori_peserta === "Mahasiswa ITS") {
        if (!member.departemen.trim()) return false;
        if (!member.nrp.trim()) return false;
        if (!member.ktm_file) return false;
      }
    }

    return true;
  }, [
    loading,
    user,
    isCompressingKtm,
    isCompressingProof,
    metodeBayar,
    paymentProofFile,
    kontakDarurat,
    nomorWADarurat,
    hubunganDarurat,
    rekeningPengirim,
    persetujuanSehat,
    kategoriPeserta,
    departemen,
    nrp,
    ktmFile,
    extraMembers,
  ]);

  // Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    if (!isFormValid) {
      setIsSubmitting(false);
      return;
    }

    if (!user) {
      setError("Sesi pengguna telah berakhir. Silakan login kembali.");
      setIsSubmitting(false);
      router.replace(`/login?redirect=${encodeURIComponent(currentPath)}`);
      return;
    }

    if (kategoriPeserta === "Mahasiswa ITS") {
      if (!departemen.trim()) {
        setError("Departemen wajib dipilih untuk Mahasiswa ITS.");
        setIsSubmitting(false);
        return;
      }
      if (!nrp.trim()) {
        setError("NRP (Nomor Pokok Mahasiswa) wajib diisi untuk Mahasiswa ITS.");
        setIsSubmitting(false);
        return;
      }
      if (!ktmFile) {
        setError("Scan Kartu Pelajar / KTM wajib diunggah untuk Mahasiswa ITS.");
        setIsSubmitting(false);
        return;
      }
    }

    if (!kontakDarurat.trim()) {
      setError("Nama kontak darurat wajib diisi.");
      setIsSubmitting(false);
      return;
    }

    if (!nomorWADarurat.trim()) {
      setError("Nomor WhatsApp kontak darurat wajib diisi.");
      setIsSubmitting(false);
      return;
    }

    if (!hubunganDarurat) {
      setError("Silakan pilih hubungan dengan kontak darurat.");
      setIsSubmitting(false);
      return;
    }

    if (!rekeningPengirim.trim()) {
      setError("Nama pemilik rekening pengirim wajib diisi.");
      setIsSubmitting(false);
      return;
    }

    if (!paymentProofFile) {
      setError("Silakan unggah bukti transfer pembayaran.");
      setIsSubmitting(false);
      return;
    }

    if (!persetujuanSehat) {
      setError("Anda harus menyetujui pernyataan kondisi fisik dan pelepasan tanggung jawab.");
      setIsSubmitting(false);
      return;
    }

    // Extra Members validation
    for (let i = 0; i < extraMembers.length; i++) {
      const m = extraMembers[i];
      const memberNum = i + 1;
      if (!m.nama_lengkap.trim()) {
        setError(`Nama lengkap Anggota ${memberNum} wajib diisi.`);
        setIsSubmitting(false);
        return;
      }
      if (!m.whatsapp.trim()) {
        setError(`Nomor WhatsApp Anggota ${memberNum} wajib diisi.`);
        setIsSubmitting(false);
        return;
      }
      if (!m.email.trim()) {
        setError(`Email Anggota ${memberNum} wajib diisi.`);
        setIsSubmitting(false);
        return;
      }
      if (m.kategori_peserta === "Mahasiswa ITS") {
        if (!m.departemen.trim()) {
          setError(`Departemen Anggota ${memberNum} wajib dipilih.`);
          setIsSubmitting(false);
          return;
        }
        if (!m.nrp.trim()) {
          setError(`NRP Anggota ${memberNum} wajib diisi.`);
          setIsSubmitting(false);
          return;
        }
        if (!m.ktm_file) {
          setError(`Scan Kartu Pelajar / KTM Anggota ${memberNum} wajib diunggah.`);
          setIsSubmitting(false);
          return;
        }
      }
    }

    if (subQuota?.isEventFull || (selectedPricingId === "standard" && subQuota && !subQuota.isAvailable)) {
      setError(
        subQuota?.isEventFull
          ? "Sold Out / Kapasitas Penuh. Total kuota pendaftaran untuk event ini telah mencapai kapasitas maksimal."
          : subQuota?.isPhaseFull
          ? "Kuota Fase Penuh. Kuota tiket fase ini sudah habis terjual."
          : subQuota?.availabilityReason === "phase_date_not_started"
          ? "Periode Belum Dimulai. Pendaftaran belum dibuka."
          : "Periode Berakhir. Periode pendaftaran telah berakhir."
      );
      setIsSubmitting(false);
      return;
    }

    // Lifecycle Rule 1: Verify remaining quota & execute Server-Side Pre-Checkout Guard
    const registrantCount = Math.max(appliedPromo?.kapasitas || 1, 1 + extraMembers.length);
    const serverGuard = await validatePreCheckoutGuard("colorfun", registrantCount, appliedPromo?.id);
    if (!serverGuard.valid) {
      setError(serverGuard.error || "Pendaftaran tidak dapat diproses karena batas kuota atau periode aktif.");
      setIsSubmitting(false);
      return;
    }

    const quotaCheck = await checkQuotaAvailability("colorfun", registrantCount, appliedPromo?.id);
    if (!quotaCheck.available) {
      setError(quotaCheck.error || "Maaf, kuota tiket ColorFun Run 5K tidak mencukupi.");
      setIsSubmitting(false);
      return;
    }

    setSubmittingStep("Mengompresi gambar...");

    try {
      // 1. Client-Side Image Compression check & preparation (maxSizeMB: 0.2, maxWidthOrHeight: 1024, useWebWorker: true)
      setSubmittingStep("Mengompresi gambar...");
      const compressedProof = await compressImage(paymentProofFile);

      // 2. Upload KTM if category is Mahasiswa ITS to 'colorfun_ktm' bucket
      let ktmUrl: string | null = null;
      if (kategoriPeserta === "Mahasiswa ITS" && ktmFile) {
        setSubmittingStep("Mengompresi gambar...");
        const compressedKtm = await compressImage(ktmFile);
        const cleanKtmName = compressedKtm.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const ktmPath = `${user.id}/${Date.now()}-${cleanKtmName}`;

        setSubmittingStep("Mengunggah berkas...");
        const { error: ktmUploadError } = await supabase.storage
          .from("colorfun_ktm")
          .upload(ktmPath, compressedKtm, {
            cacheControl: "3600",
            upsert: false,
          });

        if (ktmUploadError) {
          throw new Error(`Gagal mengunggah Scan Kartu Pelajar / KTM: ${ktmUploadError.message}`);
        }

        const { data: ktmPublicData } = supabase.storage
          .from("colorfun_ktm")
          .getPublicUrl(ktmPath);

        ktmUrl = ktmPublicData?.publicUrl || null;
      }

      // 3. Upload payment proof to 'payment_proofs' bucket
      setSubmittingStep("Mengunggah berkas...");
      const cleanProofName = compressedProof.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const proofPath = `${user.id}/${Date.now()}-${cleanProofName}`;

      const { error: proofUploadError } = await supabase.storage
        .from("payment_proofs")
        .upload(proofPath, compressedProof, {
          cacheControl: "3600",
          upsert: false,
        });

      if (proofUploadError) {
        throw new Error(`Gagal mengunggah bukti pembayaran: ${proofUploadError.message}`);
      }

      // 4. Retrieve Public URL for Payment Proof
      const { data: proofPublicData } = supabase.storage
        .from("payment_proofs")
        .getPublicUrl(proofPath);

      const paymentProofUrl = proofPublicData?.publicUrl || "";

      // 5. Upload extra members' KTMs to 'colorfun_ktm' storage bucket (atomic — abort all on any failure)
      const extraMemberKtmUrls: (string | null)[] = [];
      for (let i = 0; i < extraMembers.length; i++) {
        const m = extraMembers[i];
        let memberKtmUrl: string | null = null;

        if (m.kategori_peserta === "Mahasiswa ITS" && m.ktm_file) {
          setSubmittingStep(`Mengunggah KTM Anggota ${i + 1}...`);
          const compressedMemberKtm = await compressImage(m.ktm_file);
          const cleanMemberKtmName = compressedMemberKtm.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const memberKtmPath = `${user.id}/${Date.now()}-anggota-${i + 1}-${cleanMemberKtmName}`;

          const { error: memberKtmUploadErr } = await supabase.storage
            .from("colorfun_ktm")
            .upload(memberKtmPath, compressedMemberKtm, {
              cacheControl: "3600",
              upsert: false,
            });

          if (memberKtmUploadErr) {
            throw new Error(`Gagal mengunggah Scan Kartu Pelajar / KTM Anggota ${i + 1}: ${memberKtmUploadErr.message}`);
          }

          const { data: memberKtmData } = supabase.storage
            .from("colorfun_ktm")
            .getPublicUrl(memberKtmPath);

          memberKtmUrl = memberKtmData?.publicUrl || null;
        }

        extraMemberKtmUrls.push(memberKtmUrl);
      }

      // 6. Build participants array for bulk insert (each participant = separate row, linked by group_id)
      setSubmittingStep("Memproses pendaftaran...");
      const groupId = crypto.randomUUID();

      // Shared payment/promo context for the entire group
      const registrantCount = Math.max(appliedPromo?.kapasitas || 1, 1 + extraMembers.length);
      const resolvedPhase = appliedPromo
        ? `${appliedPromo.title} [PROMO:${appliedPromo.id}:${registrantCount}]`
        : (cmsPricing.phase || "Tiket Reguler");

      const sharedPaymentContext = {
        bukti_transfer_url: paymentProofUrl,
        rekening_pengirim: rekeningPengirim.trim(),
        payment_status: "Pending",
        amount_paid: finalPrice,
        ticket_phase: resolvedPhase,
        promo_id: appliedPromo?.id || null,
        nomor_bib: null, // BIB must NOT be generated on form submission; generated upon Admin verification
        ticket_qr_code: null,
      };

      // Primary Registrant row
      const primaryRow: Record<string, any> = {
        user_id: user.id,
        group_id: groupId,
        is_primary: true,
        nama_lengkap: userData.fullName || user.user_metadata?.full_name || "",
        email: userData.email || user.email || "",
        whatsapp: userData.phone || user.user_metadata?.phone || "",
        kategori_peserta: kategoriPeserta,
        departemen: kategoriPeserta === "Mahasiswa ITS" ? departemen.trim() : null,
        nrp: kategoriPeserta === "Mahasiswa ITS" ? nrp.trim() : null,
        ktm_url: ktmUrl,
        darurat_nama: kontakDarurat.trim(),
        darurat_wa: nomorWADarurat.trim(),
        darurat_hubungan: hubunganDarurat,
        riwayat_penyakit: riwayatPenyakit.trim() || null,
        riwayat_alergi: riwayatAlergi.trim() || null,
        ...sharedPaymentContext,
      };

      // Additional Member rows
      const additionalRows: Record<string, any>[] = extraMembers.map((m, i) => ({
        user_id: user.id,
        group_id: groupId,
        is_primary: false,
        nama_lengkap: m.nama_lengkap.trim(),
        email: m.email.trim(),
        whatsapp: m.whatsapp.trim(),
        kategori_peserta: m.kategori_peserta,
        departemen: m.kategori_peserta === "Mahasiswa ITS" ? m.departemen.trim() : null,
        nrp: m.kategori_peserta === "Mahasiswa ITS" ? m.nrp.trim() : null,
        ktm_url: extraMemberKtmUrls[i] || null,
        darurat_nama: kontakDarurat.trim(),
        darurat_wa: nomorWADarurat.trim(),
        darurat_hubungan: hubunganDarurat,
        riwayat_penyakit: null,
        riwayat_alergi: null,
        ...sharedPaymentContext,
      }));

      // Combine into single array for atomic bulk insert (DB SERIAL nomor_bib auto-assigns sequential BIBs)
      const participantsArray = [primaryRow, ...additionalRows];

      // Pre-Submission Final Guard: validate sub-event status & promo before database insert
      setSubmittingStep("Memvalidasi status pendaftaran & kuota promo...");
      const finalGuard = await validateRegistrationBeforeInsert("colorfun", participantsArray.length, appliedPromo?.id || null);
      if (!finalGuard.valid) {
        throw new Error(finalGuard.error || "Pendaftaran untuk sub-event ini sedang ditutup atau kuota promo telah habis.");
      }

      let { data: regResults, error: regError } = await supabase
        .from("colorfun_registrations")
        .insert(participantsArray)
        .select();

      // Graceful schema fallback if nomor_bib causes constraint issue: retry omitting nomor_bib
      if (regError && regError.message?.includes("nomor_bib")) {
        console.warn("Retrying colorfun_registrations bulk insert omitting nomor_bib:", regError.message);
        const fallbackArray = participantsArray.map((row) => {
          const { nomor_bib: _nb, ...rest } = row;
          return rest;
        });
        const retryRes = await supabase
          .from("colorfun_registrations")
          .insert(fallbackArray)
          .select();
        if (!retryRes.error) {
          regError = null;
          regResults = retryRes.data;
        }
      }

      // Graceful schema fallback if group_id/is_primary columns have not yet been migrated
      if (regError && (regError.message?.includes("group_id") || regError.message?.includes("is_primary") || regError.code === "PGRST204")) {
        console.warn("Retrying colorfun_registrations bulk insert with schema fallback:", regError.message);
        const fallbackArray = participantsArray.map((row) => {
          const { group_id: _gid, is_primary: _ip, ...rest } = row;
          return rest;
        });
        const retryRes = await supabase
          .from("colorfun_registrations")
          .insert(fallbackArray)
          .select();
        if (!retryRes.error) {
          regError = null;
          regResults = retryRes.data;
        }
      }

      // Second fallback: strip departemen if that column is also missing
      if (regError && (regError.message?.includes("departemen") || regError.code === "PGRST204")) {
        console.warn("Retrying colorfun_registrations bulk insert without departemen:", regError.message);
        const fallbackArray = participantsArray.map((row) => {
          const { group_id: _gid, is_primary: _ip, departemen: _dep, ...rest } = row;
          return rest;
        });
        const retryRes = await supabase
          .from("colorfun_registrations")
          .insert(fallbackArray)
          .select();
        if (!retryRes.error) {
          regError = null;
          regResults = retryRes.data;
        }
      }

      if (regError) {
        console.error("Supabase colorfun_registrations bulk insert error:", regError);
        throw new Error(`Gagal menyimpan data pendaftaran: ${regError.message}`);
      }

      // Identify the primary registration row for transaction sync
      const primaryResult = regResults?.find((r: any) => r.is_primary === true) || regResults?.[0] || null;

      // 7. Sync to 'transactions' table so user dashboard and admin verification show the record
      try {
        await supabase.from("transactions").insert({
          user_id: user.id,
          source_type: "cfr",
          source_id: primaryResult?.id || null,
          sub_event_type: "CFR",
          amount: finalPrice,
          payment_proof_url: paymentProofUrl,
          status: "Pending",
          participant_category: kategoriPeserta,
          student_id_number: kategoriPeserta === "Mahasiswa ITS" ? nrp.trim() : null,
          student_card_url: ktmUrl,
        });
      } catch (txErr) {
        console.warn("Transactions record sync notice:", txErr);
      }

      // Lifecycle Rule 2: Initial Submission ('pending') immediately counts towards Used Quota.
      // If promo was applied, hold promo quota atomically so slot is reserved.
      if (appliedPromo?.id) {
        await incrementPromoQuota(supabase, appliedPromo.id, registrantCount);
      }
      dispatchQuotaRefresh();

      setSubmittedRegistrations(regResults || []);
      setIsSuccess(true);
      setTimeout(() => {
        router.push("/dashboard");
      }, 5000);

    } catch (err: any) {
      console.error("Submission error:", err);
      setError(err.message || "Terjadi kesalahan saat memproses pendaftaran.");
      setIsSubmitting(false);
    }
  };

  // Clean Spinner while verifying session (loading === true)
  if (loading) {
    return (
      <div className="text-on-background font-poppins overflow-x-hidden relative min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-grow flex items-center justify-center pt-28 pb-16 px-4 relative z-10">
          <div className="bg-slate-950/60 backdrop-blur-xl max-w-sm w-full p-8 rounded-2xl text-center border border-white/10 shadow-[0_4px_25px_rgba(0,0,0,0.5)] flex flex-col items-center">
            <div className="relative mb-4">
              <div className="w-14 h-14 rounded-full border-2 border-secondary/20 border-t-secondary animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-secondary animate-pulse" />
              </div>
            </div>
            <h3 className="font-semibold text-lg text-white mb-1">Memeriksa Sesi Akun</h3>
            <p className="text-xs text-slate-300 font-medium">
              Memverifikasi otentikasi login Anda...
            </p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Success Confirmation Screen
  if (isSuccess) {
    return (
      <div className="text-on-background font-poppins overflow-x-hidden relative min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-grow flex items-center justify-center pt-28 pb-16 px-4 relative z-10">
          <div className="bg-slate-950/60 backdrop-blur-xl max-w-xl md:max-w-2xl w-full p-6 md:p-8 rounded-2xl text-center border border-white/10 border-t-4 border-t-secondary-fixed shadow-[0_4px_25px_rgba(0,0,0,0.5)] animate-in fade-in duration-300">
            <CheckCircle className="w-20 h-20 text-secondary-fixed mx-auto mb-6 drop-shadow-[0_0_15px_rgba(176,198,255,0.5)]" />
            <CustomHeading as="h1" text="Pendaftaran Berhasil Dikirim" className="text-2xl md:text-3xl text-white mb-4" />
            <p className="text-slate-300 font-poppins mb-6 leading-relaxed text-sm">
              Bukti pembayaran pendaftaran ColorFun Run Anda telah tercatat dengan status{" "}
              <span className="text-secondary font-bold">Pending</span>. Anda akan dialihkan ke Dashboard untuk memantau proses verifikasi tiket race Anda.
            </p>
            <div className="bg-black/30 border border-white/10 rounded-xl p-4 mb-6 text-left text-xs space-y-1.5">
              <div className="flex justify-between text-on-surface-variant">
                <span>Sub-Event</span>
                <span className="text-white font-semibold">COLORFUN RUN (CFR)</span>
              </div>
              <div className="flex justify-between text-on-surface-variant">
                <span>Kategori</span>
                <span className="text-white font-semibold">5K Fun Run</span>
              </div>
              <div className="flex justify-between text-on-surface-variant">
                <span>Total Biaya</span>
                <span className="text-secondary font-bold">
                  Rp {(submittedRegistrations[0]?.amount_paid ?? finalPrice).toLocaleString("id-ID")}
                </span>
              </div>

              {submittedRegistrations.length > 0 && (
                <div className="pt-2.5 border-t border-white/10 space-y-1.5">
                  <div className="flex justify-between items-center text-on-surface-variant">
                    <span className="text-white font-semibold">Nomor BIB Peserta</span>
                    <span className="text-[10px] uppercase tracking-wider text-amber-300 font-mono">Menunggu Verifikasi</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {submittedRegistrations.map((reg, idx) => (
                      <div
                        key={reg.id || idx}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-300 font-mono text-xs font-bold"
                      >
                        <span>{reg.nomor_bib != null ? `BIB #${formatBIB(reg.nomor_bib)}` : "BIB: Menunggu Verifikasi"}</span>
                        <span className="text-[10px] font-sans font-normal text-on-surface-variant">
                          ({reg.is_primary ? "Utama" : `Anggota ${idx}`})
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-neutral-400 italic pt-1">
                    Nomor BIB dan tiket QR resmi akan otomatis terbit setelah pembayaran diverifikasi oleh Admin.
                  </p>
                </div>
              )}
            </div>

            {/* Official WhatsApp Channel Invitation */}
            <WhatsAppChannelSection />

            {/* Dashboard Navigation CTA */}
            <div className="mt-8 pt-6 border-t border-white/10 flex justify-center">
              <Link 
                href="/dashboard" 
                className="inline-flex items-center justify-center gap-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold px-8 py-3.5 rounded-full tracking-wider uppercase transition-all duration-200 shadow-lg hover:shadow-amber-400/25 hover:scale-[1.02] active:scale-95 font-poppins text-xs md:text-sm cursor-pointer"
              >
                Lihat di Dashboard
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <GatewayGuard event="cfr">
      <div className="text-on-background font-poppins overflow-x-hidden relative min-h-screen flex flex-col">
        <Navbar />

        <main className="flex-grow pt-32 pb-24 px-6 md:px-12 lg:px-24 mx-auto w-full max-w-[1280px] relative z-10">
          {/* Header Section */}
          <div className="text-center mb-14">
            <CustomHeading 
              as="h1" 
              text="ColorFun Run Registration" 
              className="text-4xl md:text-6xl text-white mb-4 drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)] drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] [text-shadow:0_3px_12px_rgba(0,0,0,0.85),0_0_20px_rgba(0,0,0,0.6)] tracking-tight text-center" 
            />
            <p className="font-body-lg text-base md:text-lg text-secondary-fixed-dim max-w-2xl mx-auto drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] [text-shadow:0_2px_8px_rgba(0,0,0,0.9)]">
              Confirm your details for the cosmic 5K race. Lengkapi formulir pendaftaran dan pembayaran di bawah ini.
            </p>
          </div>

          {/* Real-time SubEvent Quota & Availability Badge */}
          <SubEventQuotaBadge
            eventName="ColorFun Run 5K"
            pricing={cmsPricing}
            quota={subQuota}
            className="mb-8 max-w-4xl mx-auto"
          />

          {/* Global Error Banner */}
          {error && (
            <div className="mb-8 p-4 bg-error-container/30 border border-error text-error rounded-xl flex items-center gap-3 max-w-4xl mx-auto animate-in fade-in duration-300">
              <Info className="w-6 h-6 flex-shrink-0" />
              <p className="font-poppins text-sm font-medium">{error}</p>
            </div>
          )}

          {/* Checkout Form */}
          <form onSubmit={handleSubmit} className="space-y-10 max-w-4xl mx-auto">
            
            {/* ======================================================== */}
            {/* SECTION 1: KONFIRMASI DATA PESERTA */}
            {/* ======================================================== */}
            <div className="bg-slate-950/60 backdrop-blur-xl rounded-2xl p-6 md:p-10 relative overflow-hidden shadow-[0_4px_25px_rgba(0,0,0,0.5)] border border-white/10">
              <div className="mb-6 pb-4 border-b border-white/10">
                <CustomHeading 
                  as="h2" 
                  text="Konfirmasi Data Peserta" 
                  className="text-2xl md:text-3xl text-primary-fixed flex items-center gap-3" 
                />
                <p className="text-xs text-slate-300 mt-1">
                  Data ini diambil secara otomatis dari akun profil terdaftar Anda
                </p>
              </div>

              <div className="space-y-6">
                {/* Nama Lengkap */}
                <div className="space-y-2">
                  <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">
                    Nama Lengkap
                  </label>
                  <div className="relative">
                    <input 
                      type="text" 
                      value={userData.fullName || ''} 
                      readOnly 
                      className="text-slate-100 bg-black/20 border border-white/10 cursor-not-allowed z-10 relative px-4 py-3 w-full rounded-lg outline-none font-poppins pr-10" 
                    />
                    <Lock className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 z-20 pointer-events-none" />
                  </div>
                </div>

                {/* WhatsApp & Email */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">
                      Nomor WhatsApp
                    </label>
                    <div className="relative">
                      <input 
                        type="text" 
                        value={userData.phone || ''} 
                        readOnly 
                        className="text-slate-100 bg-black/20 border border-white/10 cursor-not-allowed z-10 relative px-4 py-3 w-full rounded-lg outline-none font-poppins pr-10" 
                      />
                      <Lock className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 z-20 pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">
                      Email
                    </label>
                    <div className="relative">
                      <input 
                        type="email" 
                        value={userData.email || ''} 
                        readOnly 
                        className="text-slate-100 bg-black/20 border border-white/10 cursor-not-allowed z-10 relative px-4 py-3 w-full rounded-lg outline-none font-poppins pr-10" 
                      />
                      <Lock className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 z-20 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Kategori Peserta */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">
                      Kategori Peserta *
                    </label>
                    {isKategoriLocked && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 animate-in fade-in">
                        <Lock className="w-3 h-3" />
                        Terkunci otomatis oleh syarat Promo ({appliedPromo?.kategori_peserta})
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <select
                      value={kategoriPeserta}
                      disabled={isKategoriLocked}
                      onChange={(e) => handleKategoriChange(e.target.value as "Umum" | "Mahasiswa ITS")}
                      className={`w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins ${
                        isKategoriLocked ? "opacity-75 cursor-not-allowed bg-black/20 border-white/10 pr-10" : "cursor-pointer"
                      }`}
                    >
                      <option value="Umum" className="bg-[#101415] text-white">Umum</option>
                      <option value="Mahasiswa ITS" className="bg-[#101415] text-white">Mahasiswa ITS</option>
                    </select>
                    {isKategoriLocked && (
                      <Lock className="w-4 h-4 text-amber-300/80 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    )}
                  </div>
                </div>

                {/* Conditional Fields for Mahasiswa ITS */}
                {kategoriPeserta === "Mahasiswa ITS" && (
                  <div className="space-y-6 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                    {/* Departemen */}
                    <div className="space-y-2">
                      <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">
                        Departemen *
                      </label>
                      <select
                        required
                        value={departemen}
                        onChange={(e) => setDepartemen(e.target.value)}
                        className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins cursor-pointer"
                      >
                        <option value="" disabled className="bg-[#101415] text-slate-400">
                          -- Pilih Departemen --
                        </option>
                        {itsDepartments.map((dept) => (
                          <option key={dept} value={dept} className="bg-[#101415] text-white">
                            {dept}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* NRP */}
                    <div className="space-y-2">
                      <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">
                        NRP (Nomor Pokok Mahasiswa) *
                      </label>
                      <input
                        required
                        type="text"
                        value={nrp}
                        onChange={(e) => setNrp(e.target.value)}
                        placeholder="e.g. 5001211001"
                        className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins"
                      />
                    </div>

                    {/* Scan Kartu Pelajar / KTM (Gambar/PDF) */}
                    <div className="space-y-2">
                      <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">
                        Scan Kartu Pelajar / KTM (JPG/PNG/PDF) *
                      </label>
                      <div className="relative w-full">
                        <input
                          ref={ktmInputRef}
                          required
                          accept="image/*,application/pdf,.pdf"
                          type="file"
                          onChange={(e) => handleKtmFileChange(e.target.files?.[0] || null)}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <div
                          className={`w-full border-2 border-dashed rounded-lg py-6 px-4 flex flex-col items-center justify-center transition-colors ${
                            ktmFile
                              ? "border-secondary bg-secondary/15"
                              : "border-white/15 bg-white/5 hover:bg-white/10"
                          }`}
                        >
                          {ktmFile ? (
                            <div className="flex items-center gap-3 text-secondary">
                              <FileText className="w-8 h-8 flex-shrink-0" />
                              <div className="text-left">
                                <p className="font-medium text-sm text-white truncate max-w-xs">{ktmFile.name}</p>
                                <p className="text-xs text-secondary-fixed-dim">
                                  {isCompressingKtm ? "Mengompresi..." : `${(ktmFile.size / 1024).toFixed(1)} KB - File Terunggah`}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <>
                              <UploadCloud className="w-8 h-8 mb-2 text-slate-400" />
                              <span className="text-white font-medium text-sm text-center">
                                {isCompressingKtm ? "Mengompresi file KTM..." : "Unggah Scan Kartu Pelajar / KTM (JPG/PNG/PDF)"}
                              </span>
                              <span className="text-xs text-slate-400 mt-1">Klik atau seret file ke sini</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Dynamic Extra Participants Rendering inside Section 1 */}
                {extraMembers.length > 0 && (
                  <div className="pt-8 border-t border-white/10 space-y-6">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-secondary/20 border border-secondary/30 flex items-center justify-center">
                        <Users className="w-4 h-4 text-secondary" />
                      </div>
                      <div>
                        <h3 className="font-poppins font-semibold text-base text-white flex items-center gap-2">
                          Data Anggota Tambahan
                          <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-secondary/20 text-secondary border border-secondary/30">
                            {extraMembers.length} Peserta
                          </span>
                        </h3>
                        <p className="text-xs text-slate-300 mt-0.5">
                          Lengkapi data anggota rombongan/bundle paket yang Anda daftarkan
                        </p>
                      </div>
                    </div>

                    {extraMembers.map((member, idx) => (
                      <div
                        key={idx}
                        className="p-5 md:p-6 rounded-2xl bg-black/30 border border-white/10 space-y-5 relative backdrop-blur-xl shadow-xl"
                      >
                        <div className="flex items-center justify-between pb-3 border-b border-white/10">
                          <h4 className="font-poppins font-semibold text-sm text-primary-fixed flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-secondary/20 text-secondary border border-secondary/30 flex items-center justify-center text-xs font-bold">
                              {idx + 1}
                            </span>
                            Data Anggota {idx + 1}
                          </h4>
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-white/5 text-slate-400 border border-white/10">
                            Anggota {idx + 1} dari {extraMembers.length}
                          </span>
                        </div>

                        {/* Nama Lengkap */}
                        <div className="space-y-2">
                          <label className="font-poppins font-semibold text-xs text-slate-100 uppercase tracking-wider block">
                            Nama Lengkap *
                          </label>
                          <input
                            required
                            type="text"
                            value={member.nama_lengkap}
                            onChange={(e) => handleExtraMemberChange(idx, "nama_lengkap", e.target.value)}
                            placeholder="Masukkan nama lengkap sesuai kartu identitas"
                            className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins"
                          />
                        </div>

                        {/* Nomor WhatsApp & Email */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="font-poppins font-semibold text-xs text-slate-100 uppercase tracking-wider block">
                              Nomor WhatsApp *
                            </label>
                            <input
                              required
                              type="text"
                              value={member.whatsapp}
                              onChange={(e) => handleExtraMemberChange(idx, "whatsapp", e.target.value)}
                              placeholder="e.g. 081234567890"
                              className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="font-poppins font-semibold text-xs text-slate-100 uppercase tracking-wider block">
                              Email *
                            </label>
                            <input
                              required
                              type="email"
                              value={member.email}
                              onChange={(e) => handleExtraMemberChange(idx, "email", e.target.value)}
                              placeholder="e.g. email@example.com"
                              className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins"
                            />
                          </div>
                        </div>

                        {/* Kategori Peserta */}
                        <div className="space-y-2">
                          <label className="font-poppins font-semibold text-xs text-slate-100 uppercase tracking-wider block">
                            Kategori Peserta *
                          </label>
                          <select
                            value={member.kategori_peserta}
                            onChange={(e) =>
                              handleExtraMemberChange(
                                idx,
                                "kategori_peserta",
                                e.target.value as "Umum" | "Mahasiswa ITS"
                              )
                            }
                            className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins cursor-pointer"
                          >
                            <option value="Umum" className="bg-[#101415] text-white">
                              Umum
                            </option>
                            <option value="Mahasiswa ITS" className="bg-[#101415] text-white">
                              Mahasiswa ITS
                            </option>
                          </select>
                        </div>

                        {/* Conditional ITS Fields */}
                        {member.kategori_peserta === "Mahasiswa ITS" && (
                          <div className="space-y-4 pt-3 border-t border-white/10 animate-in fade-in slide-in-from-top-2 duration-300">
                            {/* Departemen */}
                            <div className="space-y-2">
                              <label className="font-poppins font-semibold text-xs text-slate-100 uppercase tracking-wider block">
                                Departemen *
                              </label>
                              <select
                                required
                                value={member.departemen}
                                onChange={(e) => handleExtraMemberChange(idx, "departemen", e.target.value)}
                                className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins cursor-pointer"
                              >
                                <option value="" disabled className="bg-[#101415] text-slate-400">
                                  -- Pilih Departemen --
                                </option>
                                {itsDepartments.map((dept) => (
                                  <option key={dept} value={dept} className="bg-[#101415] text-white">
                                    {dept}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* NRP */}
                            <div className="space-y-2">
                              <label className="font-poppins font-semibold text-xs text-slate-100 uppercase tracking-wider block">
                                NRP (Nomor Pokok Mahasiswa) *
                              </label>
                              <input
                                required
                                type="text"
                                value={member.nrp}
                                onChange={(e) => handleExtraMemberChange(idx, "nrp", e.target.value)}
                                placeholder="e.g. 5001211001"
                                className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins"
                              />
                            </div>

                            {/* Scan KTM */}
                            <div className="space-y-2">
                              <label className="font-poppins font-semibold text-xs text-slate-100 uppercase tracking-wider block">
                                Scan Kartu Pelajar / KTM (JPG/PNG/PDF) *
                              </label>
                              <div className="relative w-full">
                                <input
                                  required
                                  accept="image/*,application/pdf,.pdf"
                                  type="file"
                                  onChange={(e) => handleExtraMemberKtmChange(idx, e.target.files?.[0] || null)}
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                />
                                <div
                                  className={`w-full border-2 border-dashed rounded-lg py-4 px-4 flex flex-col items-center justify-center transition-colors ${
                                    member.ktm_file
                                      ? "border-secondary bg-secondary/15"
                                      : "border-white/15 bg-white/5 hover:bg-white/10"
                                  }`}
                                >
                                  {member.ktm_file ? (
                                    <div className="flex items-center gap-3 text-secondary">
                                      <FileText className="w-7 h-7 flex-shrink-0" />
                                      <div className="text-left">
                                        <p className="font-medium text-xs text-white truncate max-w-xs">{member.ktm_file.name}</p>
                                        <p className="text-[11px] text-secondary-fixed-dim">
                                          {member.is_compressing_ktm ? "Mengompresi..." : `${(member.ktm_file.size / 1024).toFixed(1)} KB - File Terunggah`}
                                        </p>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <UploadCloud className="w-6 h-6 mb-1 text-slate-400" />
                                      <span className="text-white font-medium text-xs text-center">
                                        {member.is_compressing_ktm ? "Mengompresi KTM..." : `Unggah Scan KTM Anggota ${idx + 1} (JPG/PNG/PDF)`}
                                      </span>
                                      <span className="text-[10px] text-slate-400 mt-0.5">Klik atau seret file ke sini</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>            {/* ======================================================== */}
            {/* ======================================================== */}
            {/* SECTION 2: DETAIL PERLENGKAPAN & KESELAMATAN */}
            {/* ======================================================== */}
            <div className="bg-slate-950/60 backdrop-blur-xl rounded-2xl p-6 md:p-10 relative overflow-hidden shadow-[0_4px_25px_rgba(0,0,0,0.5)] border border-white/10">
              <div className="mb-6 pb-4 border-b border-white/10">
                <CustomHeading 
                  as="h2" 
                  text="Detail Perlengkapan &amp; Keselamatan" 
                  className="text-2xl md:text-3xl text-primary-fixed flex items-center gap-3" 
                />
                <p className="text-xs text-slate-300 mt-1">
                  Informasi medis dan kontak darurat untuk kenyamanan serta keselamatan Anda selama 5K Race
                </p>
              </div>

              <div className="space-y-6">
                {/* Emergency Contact Name */}
                <div className="space-y-2">
                  <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">
                    Nama Kontak Darurat (Emergency Contact) *
                  </label>
                  <input 
                    required 
                    type="text" 
                    value={kontakDarurat} 
                    onChange={e => setKontakDarurat(e.target.value)} 
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins" 
                    placeholder="Masukkan nama kontak darurat yang dapat dihubungi" 
                  />
                </div>

                {/* Emergency WA & Relationship */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">
                      Nomor WA Kontak Darurat *
                    </label>
                    <input 
                      required 
                      type="tel" 
                      value={nomorWADarurat} 
                      onChange={e => setNomorWADarurat(e.target.value)} 
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins" 
                      placeholder="Contoh: 081234567890" 
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">
                      Hubungan dengan Kontak Darurat *
                    </label>
                    <select 
                      required 
                      value={hubunganDarurat} 
                      onChange={e => setHubunganDarurat(e.target.value)} 
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins cursor-pointer"
                    >
                      <option value="" disabled className="bg-[#101415] text-slate-400">Pilih Hubungan</option>
                      <option value="orangTua" className="bg-[#101415] text-white">Orang Tua</option>
                      <option value="saudara" className="bg-[#101415] text-white">Saudara</option>
                      <option value="pasangan" className="bg-[#101415] text-white">Pasangan</option>
                      <option value="teman" className="bg-[#101415] text-white">Teman</option>
                    </select>
                  </div>
                </div>

                {/* Medical History & Allergies */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  <div className="space-y-2">
                    <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">
                      Riwayat Penyakit (Opsional)
                    </label>
                    <input 
                      type="text" 
                      value={riwayatPenyakit} 
                      onChange={e => setRiwayatPenyakit(e.target.value)} 
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins" 
                      placeholder="Contoh: Asma, Jantung, atau tulis 'Tidak Ada'" 
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="font-poppins font-semibold text-sm text-slate-100 uppercase tracking-wider block">
                      Riwayat Alergi (Opsional)
                    </label>
                    <input 
                      type="text" 
                      value={riwayatAlergi} 
                      onChange={e => setRiwayatAlergi(e.target.value)} 
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-poppins" 
                      placeholder="Contoh: Obat-obatan, Makanan, atau tulis 'Tidak Ada'" 
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ======================================================== */}
            {/* SECTION 3: PEMBAYARAN & FINALISASI */}
            {/* ======================================================== */}
            <div className="bg-slate-950/60 backdrop-blur-xl rounded-2xl p-6 md:p-10 relative overflow-hidden shadow-[0_4px_25px_rgba(0,0,0,0.5)] border border-white/10">
              <div className="mb-6 pb-4 border-b border-white/10">
                <CustomHeading 
                  as="h2" 
                  text="Pembayaran &amp; Finalisasi" 
                  className="text-2xl md:text-3xl text-primary-fixed flex items-center gap-3" 
                />
                <p className="text-xs text-slate-300 mt-1">
                  Biaya registrasi sudah mencakup Race Kit, Glow Powder Zone Access, &amp; Finisher Medal
                </p>
              </div>

              {/* ── PRICING SELECTION (Standard Phase vs Active Promo Bundles) ── */}
              <div className="mb-8 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-xs text-primary-fixed uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#ffd700]" />
                    Pilihan Paket &amp; Tiket Pendaftaran
                  </label>
                  {!loadingPromos && activePromos.length > 0 && (
                    <span className="text-[11px] text-secondary font-medium hidden sm:inline">
                      Pilih salah satu paket di bawah
                    </span>
                  )}
                </div>

                {loadingPromos ? (
                  <div className="p-6 rounded-2xl bg-black/30 border border-white/10 animate-pulse flex items-center justify-center">
                    <Loader2 className="w-5 h-5 text-secondary animate-spin" />
                  </div>
                ) : activePromos.length === 0 ? (
                  /* Scenario A: No Active Promos -> Dynamic Base Price Card */
                  <div className={`p-5 md:p-6 rounded-2xl border-2 transition-all flex items-center justify-between gap-4 ${
                    subQuota && !subQuota.isAvailable
                      ? "bg-black/20 border-white/10 opacity-60 pointer-events-none cursor-not-allowed backdrop-blur-sm grayscale-[25%]"
                      : "bg-gradient-to-r from-secondary/15 via-slate-800/80 to-primary/15 border-secondary/50 shadow-[0_0_25px_rgba(176,198,255,0.15)]"
                  }`}>
                    <div>
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider text-slate-300 bg-white/10 border border-white/20">
                          Fase Pendaftaran Aktif
                        </span>
                        {subQuota?.isEventFull ? (
                          <span className="text-[10px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-error/20 text-error border border-error/40 uppercase tracking-wider flex items-center gap-1">
                            <Ban className="w-2.5 h-2.5" />
                            Sold Out / Kapasitas Penuh
                          </span>
                        ) : subQuota?.isPhaseFull ? (
                          <span className="text-[10px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase tracking-wider flex items-center gap-1">
                            <Ban className="w-2.5 h-2.5" />
                            Kuota Fase Penuh
                          </span>
                        ) : subQuota && !subQuota.isPhaseDateActive ? (
                          <span className="text-[10px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-slate-500/20 text-slate-300 border border-slate-500/40 uppercase tracking-wider flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {subQuota.availabilityReason === "phase_date_not_started" ? "Periode Belum Dimulai" : "Periode Berakhir"}
                          </span>
                        ) : subQuota?.remainingPhaseQuota !== null && subQuota?.remainingPhaseQuota !== undefined ? (
                          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-white/5 text-slate-300 border border-white/10">
                            Sisa: {subQuota.remainingPhaseQuota} Slot
                          </span>
                        ) : null}
                      </div>
                      <h3 className="text-xl md:text-2xl font-bold text-white tracking-wide">
                        {cmsPricing?.phase?.trim() || "Tiket Reguler"}
                      </h3>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Total</p>
                      <p className="text-2xl md:text-3xl font-headline-md font-bold text-white">
                        Rp {CFR_TICKET_PRICE.toLocaleString("id-ID")}
                      </p>
                    </div>
                  </div>
                ) : (
                  /* Scenario B: Active Promos Exist (Side-by-Side Selectable Cards) */
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Left Card: Dynamic Phase Name / Base Ticket */}
                    {(() => {
                      const isBaseAvailable = !subQuota || subQuota.isAvailable;
                      return (
                        <div
                          role="button"
                          tabIndex={isBaseAvailable ? 0 : -1}
                          aria-disabled={!isBaseAvailable}
                          onClick={() => {
                            if (!isBaseAvailable) {
                              if (subQuota?.isEventFull) {
                                setError("Maaf, Sold Out / Kapasitas Penuh.");
                              } else if (subQuota?.isPhaseFull) {
                                setError("Maaf, Kuota Fase Penuh.");
                              } else if (subQuota && !subQuota.isPhaseDateActive) {
                                setError(
                                  subQuota.availabilityReason === "phase_date_not_started"
                                    ? "Periode Belum Dimulai. Pendaftaran belum dibuka."
                                    : "Periode Berakhir. Periode pendaftaran telah berakhir."
                                );
                              }
                              return;
                            }
                            handleSelectStandardPrice();
                          }}
                          onKeyDown={(e) => {
                            if ((e.key === "Enter" || e.key === " ") && isBaseAvailable) {
                              handleSelectStandardPrice();
                            }
                          }}
                          className={`relative rounded-2xl p-5 border-2 transition-all duration-300 flex flex-col justify-between select-none ${
                            !isBaseAvailable
                              ? "bg-black/20 border-white/10 opacity-60 pointer-events-none cursor-not-allowed backdrop-blur-sm grayscale-[25%]"
                              : selectedPricingId === "standard"
                              ? "bg-secondary/15 border-secondary shadow-[0_0_25px_rgba(176,198,255,0.2)] ring-1 ring-secondary/50 cursor-pointer"
                              : "bg-black/30 border-white/10 hover:border-white/20 hover:bg-black/40 opacity-90 hover:opacity-100 cursor-pointer"
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider text-slate-300 bg-white/10 border border-white/20">
                                  Fase Aktif
                                </span>
                                {subQuota?.isEventFull ? (
                                  <span className="text-[10px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-error/20 text-error border border-error/40 uppercase tracking-wider flex items-center gap-1">
                                    <Ban className="w-2.5 h-2.5" />
                                    Sold Out / Kapasitas Penuh
                                  </span>
                                ) : subQuota?.isPhaseFull ? (
                                  <span className="text-[10px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase tracking-wider flex items-center gap-1">
                                    <Ban className="w-2.5 h-2.5" />
                                    Kuota Fase Penuh
                                  </span>
                                ) : subQuota && !subQuota.isPhaseDateActive ? (
                                  <span className="text-[10px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-slate-500/20 text-slate-300 border border-slate-500/40 uppercase tracking-wider flex items-center gap-1">
                                    <Clock className="w-2.5 h-2.5" />
                                    {subQuota.availabilityReason === "phase_date_not_started" ? "Periode Belum Dimulai" : "Periode Berakhir"}
                                  </span>
                                ) : subQuota?.remainingPhaseQuota !== null && subQuota?.remainingPhaseQuota !== undefined ? (
                                  <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-white/5 text-slate-300 border border-white/10">
                                    Sisa: {subQuota.remainingPhaseQuota}
                                  </span>
                                ) : null}
                              </div>

                              {!isBaseAvailable ? (
                                <span className="text-[10px] font-bold font-mono px-2.5 py-1 rounded-full bg-error/20 text-error border border-error/40 uppercase tracking-wider flex items-center gap-1 shrink-0">
                                  <Ban className="w-3 h-3" />
                                  {subQuota?.isEventFull
                                    ? "Sold Out / Kapasitas Penuh"
                                    : subQuota?.isPhaseFull
                                    ? "Kuota Fase Penuh"
                                    : subQuota?.availabilityReason === "phase_date_not_started"
                                    ? "Periode Belum Dimulai"
                                    : "Periode Berakhir"}
                                </span>
                              ) : (
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors shrink-0 ${
                                  selectedPricingId === "standard"
                                    ? "border-secondary bg-secondary"
                                    : "border-neutral-600"
                                }`}>
                                  {selectedPricingId === "standard" && (
                                    <Check className="w-3 h-3 text-primary-container font-bold stroke-[3]" />
                                  )}
                                </div>
                              )}
                            </div>

                            <h4 className="font-bold text-base text-white mb-1">
                              {cmsPricing?.phase?.trim() || "Tiket Reguler"}
                            </h4>
                          </div>

                          <div className="pt-3 border-t border-white/10 flex items-baseline justify-between">
                            <span className="text-[11px] text-slate-400 uppercase tracking-wider">Total</span>
                            <span className="text-xl font-bold font-headline-md text-white">
                              Rp {CFR_TICKET_PRICE.toLocaleString("id-ID")}
                            </span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Right Card(s): Promo / Bundling Options */}
                    {activePromos.map((promo) => {
                      const isSelected = selectedPricingId === promo.id;
                      const calc = validatePromoForEvent(promo, "ColorFun Run", CFR_TICKET_PRICE);
                      const promoFinalPrice = calc.finalPrice ?? CFR_TICKET_PRICE;
                      const discountVal = calc.discountAmount ?? 0;

                      const { isStarted: isDateStarted, isEnded: isDateEnded, isActive: isDateActive } = getEventTimeStatus(promo.start_date, promo.end_date);
                      const isOutsideDateRange = !isDateActive;

                      const isUnlimited = promo.kuota_maksimal == null;
                      const usedQuota = promo.kuota_terpakai ?? 0;
                      const isSoldOut = !isUnlimited && promo.kuota_maksimal != null && usedQuota >= promo.kuota_maksimal;
                      const remainingQuota = !isUnlimited && promo.kuota_maksimal != null 
                        ? Math.max(0, promo.kuota_maksimal - usedQuota) 
                        : null;

                      const isAvailable = !isOutsideDateRange && !isSoldOut;

                      return (
                        <div
                          key={promo.id}
                          role="button"
                          tabIndex={isAvailable ? 0 : -1}
                          aria-disabled={!isAvailable}
                          onClick={() => {
                            if (!isAvailable) {
                              if (isSoldOut) {
                                setPromoError(`Maaf, kuota paket bundling "${promo.title}" sudah habis (Sold Out).`);
                              } else if (isDateEnded) {
                                setPromoError(`Maaf, periode pembelian paket bundling "${promo.title}" telah berakhir.`);
                              } else if (!isDateStarted) {
                                setPromoError(`Maaf, periode pembelian paket bundling "${promo.title}" belum dimulai.`);
                              }
                              return;
                            }
                            handleSelectPromoOption(promo);
                          }}
                          onKeyDown={(e) => {
                            if ((e.key === "Enter" || e.key === " ") && isAvailable) {
                              handleSelectPromoOption(promo);
                            }
                          }}
                          className={`relative rounded-2xl p-5 border-2 transition-all duration-300 flex flex-col justify-between select-none overflow-hidden ${
                            !isAvailable
                              ? "bg-black/20 border-white/10 opacity-60 pointer-events-none cursor-not-allowed backdrop-blur-sm"
                              : isSelected
                              ? "bg-[#ffd700]/15 border-[#ffd700] shadow-[0_0_25px_rgba(255,215,0,0.25)] ring-1 ring-[#ffd700]/60 cursor-pointer"
                              : "bg-black/30 border-[#ffd700]/30 hover:border-[#ffd700]/60 hover:bg-black/40 cursor-pointer"
                          }`}
                        >
                          <div className="absolute -top-10 -right-10 w-24 h-24 bg-[#ffd700]/10 rounded-full blur-2xl pointer-events-none" />

                          <div>
                            <div className="flex items-center justify-between mb-3 relative z-10">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider text-white ${
                                  !isAvailable 
                                    ? "bg-slate-700/60 border border-slate-600/40" 
                                    : "bg-gradient-to-r from-purple-500 to-blue-500 border border-purple-400/50 shadow-[0_0_12px_rgba(168,85,247,0.35)]"
                                }`}>
                                  <Sparkles className={`w-3 h-3 ${!isAvailable ? "text-slate-400" : "text-amber-300"}`} />
                                  Bundle Package
                                </span>
                                {promo.kategori_peserta && promo.kategori_peserta !== "Semua" && (
                                  <span className="text-[10px] font-sans font-semibold px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                                    Khusus {promo.kategori_peserta}
                                  </span>
                                )}

                                {/* Condition 1: Quota Full */}
                                {isSoldOut ? (
                                  <span className="text-[10px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-error/20 text-error border border-error/40 uppercase tracking-wider flex items-center gap-1">
                                    <Ban className="w-2.5 h-2.5" />
                                    Kuota Habis
                                  </span>
                                ) : isDateEnded ? (
                                  /* Condition 3: Date Expired */
                                  <span className="text-[10px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase tracking-wider flex items-center gap-1">
                                    <Clock className="w-2.5 h-2.5" />
                                    Promo Berakhir
                                  </span>
                                ) : !isDateStarted ? (
                                  <span className="text-[10px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-slate-500/20 text-slate-300 border border-slate-500/40 uppercase tracking-wider flex items-center gap-1">
                                    <Clock className="w-2.5 h-2.5" />
                                    Periode Belum Dimulai
                                  </span>
                                ) : isUnlimited ? (
                                  /* Condition 2: Unlimited Quota */
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                                    <Infinity className="w-3 h-3" />
                                    Tanpa Batas Kuota
                                  </span>
                                ) : remainingQuota != null ? (
                                  <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-white/5 text-slate-300 border border-white/10">
                                    Sisa: {remainingQuota}
                                  </span>
                                ) : null}
                              </div>

                              {!isAvailable ? (
                                <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-400 border border-slate-700 uppercase tracking-wider flex items-center gap-1 shrink-0">
                                  <Ban className="w-2.5 h-2.5" />
                                  {isSoldOut ? "Kuota Habis" : "Promo Berakhir"}
                                </span>
                              ) : (
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors shrink-0 ${
                                  isSelected 
                                    ? "border-[#ffd700] bg-[#ffd700]" 
                                    : "border-neutral-600"
                                }`}>
                                  {isSelected && (
                                    <Check className="w-3 h-3 text-neutral-950 font-bold stroke-[3]" />
                                  )}
                                </div>
                              )}
                            </div>

                            <h4 className={`font-bold text-base mb-1 relative z-10 ${!isAvailable ? "text-slate-300" : "text-white"}`}>
                              {promo.title}
                            </h4>
                            <p className="text-xs text-slate-400 mb-2 line-clamp-2 relative z-10 font-poppins">
                              {promo.description || "Penawaran promo terbatas untuk event ini."}
                            </p>
                            {promo.end_date && (
                              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono mb-3 relative z-10">
                                <Clock className="w-3 h-3 text-secondary shrink-0" />
                                <span>Berlaku s/d: {formatDisplayWIB(promo.end_date)}</span>
                              </div>
                            )}
                          </div>

                          <div className="pt-3 border-t border-white/10 flex items-baseline justify-between relative z-10">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                !isAvailable
                                  ? "bg-slate-700/40 text-slate-400 border border-slate-600/30"
                                  : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              }`}>
                                {promo.discount_type === "percent"
                                  ? `${promo.discount_value}% OFF`
                                  : promo.discount_type === "bundling"
                                  ? "Paket Bundling"
                                  : `Hemat Rp ${discountVal.toLocaleString("id-ID")}`}
                              </span>
                            </div>
                            <div className="text-right">
                              <div className="flex items-baseline gap-1.5 justify-end">
                                <span className="text-xs text-slate-400 line-through font-mono">
                                  Rp {(CFR_TICKET_PRICE * (promo.kapasitas || 1)).toLocaleString("id-ID")}
                                </span>
                                <span className={`text-xl font-bold font-headline-md ${!isAvailable ? "text-slate-400" : "text-[#ffd700]"}`}>
                                  Rp {promoFinalPrice.toLocaleString("id-ID")}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Promo Code Input & Summary */}
              <div className="mb-6 p-5 rounded-xl bg-black/30 border border-white/10 space-y-3">
                <label className="font-semibold text-xs text-primary-fixed uppercase tracking-wider flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-secondary" />
                  Kupon Promo / Diskon
                </label>
                {appliedPromo ? (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                        <Check className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-white text-sm tracking-wider uppercase">
                            {appliedPromo.title}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                            {appliedPromo.discount_type === "percent"
                              ? `${appliedPromo.discount_value}% OFF`
                              : appliedPromo.discount_type === "bundling"
                              ? "Paket Bundling"
                              : `Hemat Rp ${Number(appliedPromo.discount_value).toLocaleString("id-ID")}`}
                          </span>
                        </div>
                        <p className="text-xs text-emerald-400/90 mt-0.5 font-medium">
                          Potongan harga: -Rp {discountAmount.toLocaleString("id-ID")}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemovePromo}
                      className="text-xs text-red-400 hover:text-red-300 px-2.5 py-1 rounded bg-red-500/10 hover:bg-red-500/20 transition-colors font-medium border border-red-500/20 shrink-0"
                    >
                      Hapus
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={promoCode}
                        onChange={(e) => {
                          setPromoCode(e.target.value.toUpperCase());
                          if (promoError) setPromoError(null);
                        }}
                        placeholder="Masukkan kode promo (cth: CFRHEMAT)"
                        className="flex-1 bg-black/30 border border-white/10 rounded-lg px-4 py-2.5 text-white font-mono text-sm tracking-wider placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary outline-none uppercase"
                      />
                      <button
                        type="button"
                        disabled={!promoCode.trim() || isValidatingPromo}
                        onClick={handleApplyPromo}
                        className="px-5 py-2.5 rounded-lg bg-secondary/20 hover:bg-secondary/30 disabled:opacity-50 disabled:cursor-not-allowed text-secondary text-xs font-semibold uppercase tracking-wider transition-colors border border-secondary/30 flex items-center gap-1.5 shrink-0"
                      >
                        {isValidatingPromo ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Cek...</span>
                          </>
                        ) : (
                          "Gunakan"
                        )}
                      </button>
                    </div>
                    {promoError && (
                      <p className="text-xs text-red-400 font-medium flex items-center gap-1.5 animate-in fade-in">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        {promoError}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Total Payment Bar */}
              <div className="p-5 rounded-xl border border-secondary/50 bg-secondary/10 flex justify-between items-center mb-8">
                <div>
                  <h3 className="font-semibold text-xs uppercase text-secondary tracking-wider">
                    Total Biaya (Fase: {cmsPricing.phase}{kapasitas > 1 ? ` • ${kapasitas} Peserta` : ""})
                  </h3>
                  <div className="flex items-baseline gap-2.5 mt-1">
                    <p className="font-headline-md text-2xl text-white font-bold">
                      Rp {finalPrice.toLocaleString("id-ID")}
                    </p>
                    {discountAmount > 0 && (
                      <p className="text-xs text-slate-400 line-through font-mono">
                        Rp {totalBasePrice.toLocaleString("id-ID")}
                      </p>
                    )}
                  </div>
                </div>
                {appliedPromo && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-secondary/20 text-secondary border border-secondary/30">
                    Kupon Aktif
                  </span>
                )}
              </div>

              {/* Payment Method */}
              <div className="space-y-4 mb-6">
                <label className="font-semibold text-sm text-slate-100 uppercase tracking-wider block">
                  Pilih Metode Pembayaran *
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
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${metodeBayar === "bni" ? "border-secondary" : "border-neutral-600"}`}>
                      {metodeBayar === "bni" && <div className="w-2.5 h-2.5 rounded-full bg-secondary" />}
                    </div>
                    <CreditCard className="w-5 h-5 text-secondary" />
                    <span className="text-white font-medium text-sm">Bank Transfer (BNI)</span>
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
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${metodeBayar === "qris" ? "border-secondary" : "border-neutral-600"}`}>
                        {metodeBayar === "qris" && <div className="w-2.5 h-2.5 rounded-full bg-secondary" />}
                      </div>
                      <QrCode className="w-5 h-5 text-secondary" />
                      <span className="text-white font-medium text-sm">QRIS Digital</span>
                    </div>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Instant &amp; Otomatis
                    </span>
                  </label>
                </div>

                {/* Transfer Destination Details / QRIS Details */}
                <div className="mt-5 transition-all duration-300">
                  {metodeBayar === "bni" ? (
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
                    /* Dedicated QRIS Card Layout with Frosted Glass Styling */
                    <div className="p-6 md:p-8 rounded-2xl bg-slate-950/60 backdrop-blur-xl border border-white/10 shadow-[0_4px_25px_rgba(0,0,0,0.5)] animate-in fade-in duration-300 space-y-6">
                      {/* Merchant Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
                        <div>
                          <span className="text-[11px] font-semibold text-secondary uppercase tracking-wider block mb-1">
                            Merchant Resmi QRIS
                          </span>
                          <h4 className="text-white font-bold text-lg md:text-xl tracking-wide">
                            AMALIA FITRIA - BOOK &amp; STATIONERY
                          </h4>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-xs text-slate-400 font-mono">NMID:</span>
                            <span className="text-xs font-mono font-bold text-slate-200">ID1026592450039</span>
                            <button
                              type="button"
                              onClick={handleCopyNmid}
                              className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-slate-300 text-[10px] font-medium flex items-center gap-1 transition-colors border border-white/10"
                            >
                              {copiedNmid ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedNmid ? "Tersalin" : "Salin NMID"}</span>
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 self-start sm:self-auto">
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-secondary/20 text-secondary border border-secondary/30">
                            QRIS Standar Nasional
                          </span>
                        </div>
                      </div>

                      {/* Order Summary / Total Amount Due */}
                      <div className="p-4 rounded-xl bg-black/40 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <span className="text-xs text-slate-400 font-medium uppercase tracking-wider block">
                            Total Tagihan Pembayaran
                          </span>
                          <div className="text-2xl md:text-3xl font-bold font-mono text-emerald-400 mt-0.5">
                            Rp {finalPrice.toLocaleString("id-ID")}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleCopyAmount}
                          className="self-start sm:self-auto px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors border border-white/10"
                        >
                          {copiedAmount ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-secondary" />}
                          <span>{copiedAmount ? "Nominal Tersalin" : "Salin Nominal"}</span>
                        </button>
                      </div>

                      {/* QR Code Container */}
                      <div className="flex flex-col items-center">
                        <div className="bg-white p-3 sm:p-4 rounded-2xl shadow-2xl border-4 border-white/20 max-w-[260px] sm:max-w-[280px] w-full text-center">
                          <div 
                            onClick={() => setIsQrisModalOpen(true)} 
                            className="relative group cursor-pointer overflow-hidden rounded-xl bg-white"
                          >
                            <img 
                              src="/qris-voitsfest.jpg" 
                              alt="QRIS VOITSFEST 2026 - AMALIA FITRIA" 
                              className="w-full h-auto object-contain transition-transform duration-300 group-hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-semibold backdrop-blur-[2px]">
                              <Maximize2 className="w-4 h-4 text-secondary" />
                              <span>Klik untuk Perbesar</span>
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons: Download & Enlarge */}
                        <div className="flex items-center gap-3 mt-4 w-full max-w-[280px]">
                          <a
                            href="/qris-voitsfest.jpg"
                            download="QRIS-VOITSFEST-2026.jpg"
                            className="flex-1 py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border border-white/10 shadow-sm"
                          >
                            <Download className="w-3.5 h-3.5 text-secondary" />
                            <span>Unduh QR</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => setIsQrisModalOpen(true)}
                            className="flex-1 py-2.5 px-3 rounded-xl bg-secondary/20 hover:bg-secondary/30 text-secondary text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border border-secondary/30"
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                            <span>Perbesar</span>
                          </button>
                        </div>
                      </div>

                      {/* 3-Step Guide */}
                      <div className="p-4 rounded-xl bg-black/30 border border-white/10 space-y-2.5">
                        <h5 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                          <Info className="w-4 h-4 text-secondary shrink-0" />
                          Panduan Pembayaran QRIS (3 Langkah)
                        </h5>
                        <ol className="text-xs text-slate-300 space-y-2 leading-relaxed">
                          <li className="flex items-start gap-2">
                            <span className="w-5 h-5 rounded-full bg-secondary/20 text-secondary flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">1</span>
                            <span>Pindai / Scan QRIS menggunakan aplikasi e-wallet (GoPay, OVO, DANA, ShopeePay) atau m-Banking pilihan Anda.</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="w-5 h-5 rounded-full bg-secondary/20 text-secondary flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">2</span>
                            <span>Pastikan nama penerima tertera <strong className="text-emerald-400 font-semibold">AMALIA FITRIA - BOOK &amp; STATIONERY</strong> dengan nominal tepat.</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="w-5 h-5 rounded-full bg-secondary/20 text-secondary flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">3</span>
                            <span>Unggah bukti transfer/pembayaran di kolom bawah ini setelah transaksi berhasil.</span>
                          </li>
                        </ol>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sender Account Name */}
              <div className="space-y-2 mb-6">
                <label className="font-semibold text-sm text-slate-100 uppercase tracking-wider block">
                  {metodeBayar === "bni" ? "Nama Pemilik Rekening Pengirim *" : "Nama Akun Pengirim (E-Wallet / Bank) *"}
                </label>
                <input 
                  required 
                  type="text" 
                  value={rekeningPengirim} 
                  onChange={(e) => setRekeningPengirim(e.target.value)} 
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all font-medium font-poppins" 
                  placeholder={metodeBayar === "bni" ? "Nama yang tertera pada rekening pengirim" : "Nama akun e-wallet atau bank pengirim"} 
                />
              </div>

              {/* Upload Proof */}
              <div className="space-y-2 mb-6">
                <label className="font-semibold text-sm text-slate-100 uppercase tracking-wider block">
                  Upload Bukti Transfer / Pembayaran *
                </label>
                <div className="relative w-full">
                  <input 
                    required 
                    ref={fileInputRef}
                    accept=".png,.jpg,.jpeg,.pdf,image/*" 
                    type="file" 
                    onChange={e => handleFileChange(e.target.files?.[0] || null)} 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                  />
                  <div className="w-full border-2 border-dashed border-white/15 rounded-lg py-8 flex flex-col items-center justify-center bg-white/5 hover:bg-white/10 transition-colors">
                    <UploadCloud className="w-8 h-8 text-slate-400 mb-2" />
                    <span className="text-white font-medium text-center px-4">
                      {isCompressingProof
                        ? "Mengompresi gambar..."
                        : paymentProofFile
                        ? paymentProofFile.name
                        : "Unggah Bukti Pembayaran (JPG, PNG, PDF maks. 2MB)"}
                    </span>
                  </div>
                </div>
                {paymentProofFile && (
                  <div className="mt-3">
                    {paymentProofPreview ? (
                      <img 
                        src={paymentProofPreview} 
                        alt="Preview Bukti Transfer" 
                        className="w-24 h-24 object-cover rounded-lg border border-white/20 shadow-md" 
                      />
                    ) : (
                      <div className="flex items-center gap-2.5 p-3 rounded-lg bg-black/40 border border-white/15 w-fit">
                        <FileText className="w-5 h-5 text-secondary shrink-0" />
                        <span className="text-xs text-slate-200 font-medium">{paymentProofFile.name}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Waiver Checkbox */}
              <label className="flex items-start gap-4 p-4 rounded-xl bg-black/30 border border-white/10 cursor-pointer hover:bg-black/40 transition-colors">
                <div className="flex items-center h-5 mt-0.5">
                  <input 
                    required 
                    type="checkbox" 
                    checked={persetujuanSehat} 
                    onChange={e => setPersetujuanSehat(e.target.checked)} 
                    className="w-5 h-5 rounded border-white/20 text-secondary focus:ring-secondary bg-black/40" 
                  />
                </div>
                <span className="text-sm font-poppins text-white/90 leading-relaxed">
                  Saya menyatakan dalam kondisi fisik yang sehat, siap mengikuti seluruh rangkaian ColorFun Run 5K, dan membebaskan panitia dari segala bentuk tuntutan atas cedera fisik yang terjadi di luar kendali pihak penyelenggara.
                </span>
              </label>
            </div>

            {/* Submit Button */}
            <div className="flex flex-col items-end gap-2 pt-4">
              <button 
                disabled={!isFormValid || isSubmitting || Boolean(subQuota?.isEventFull) || (selectedPricingId === "standard" && Boolean(subQuota && !subQuota.isAvailable))} 
                type="submit" 
                className={`bg-primary-container text-primary px-10 py-4 rounded-full font-medium tracking-wider uppercase flex items-center gap-3 transition-all ${
                  isSubmitting
                    ? "opacity-60 cursor-not-allowed pointer-events-none"
                    : !isFormValid || subQuota?.isEventFull || (selectedPricingId === "standard" && subQuota && !subQuota.isAvailable)
                    ? "opacity-50 cursor-not-allowed" 
                    : "hover:bg-primary-container/80 shadow-[0_0_20px_rgba(176,198,255,0.2)] cursor-pointer"
                }`}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Memproses Pendaftaran...</span>
                  </>
                ) : subQuota?.isEventFull ? (
                  <span>Sold Out / Kapasitas Penuh</span>
                ) : selectedPricingId === "standard" && subQuota?.isPhaseFull ? (
                  <span>Kuota Fase Penuh</span>
                ) : selectedPricingId === "standard" && subQuota && !subQuota.isPhaseDateActive ? (
                  <span>{subQuota.availabilityReason === "phase_date_not_started" ? "Periode Belum Dimulai" : "Periode Berakhir"}</span>
                ) : (
                  <>
                    <span>Kirim Pembayaran</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
              {subQuota?.isEventFull ? (
                <p className="text-xs text-error font-medium">
                  Pendaftaran ColorFun Run saat ini ditutup karena kapasitas maksimal event telah penuh (Sold Out / Kapasitas Penuh).
                </p>
              ) : selectedPricingId === "standard" && subQuota?.isPhaseFull ? (
                <p className="text-xs text-amber-300 font-medium">
                  Kuota tiket fase ini telah habis (Kuota Fase Penuh). Silakan pilih paket bundling atau tunggu pembukaan fase berikutnya.
                </p>
              ) : selectedPricingId === "standard" && subQuota && !subQuota.isPhaseDateActive ? (
                <p className="text-xs text-slate-300 font-medium">
                  {subQuota.availabilityReason === "phase_date_not_started" ? "Periode pendaftaran tiket belum dimulai." : "Periode pendaftaran tiket telah berakhir."}
                </p>
              ) : !isFormValid ? (
                <p className="text-xs text-on-surface-variant/70 font-poppins">
                  Lengkapi seluruh data wajib &amp; persetujuan di atas untuk dapat mengirim pembayaran.
                </p>
              ) : null}
            </div>
          </form>

          {/* QRIS Enlarge Modal */}
          {isQrisModalOpen && (
            <div 
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
              onClick={() => setIsQrisModalOpen(false)}
            >
              <div 
                className="relative bg-slate-950/90 border border-white/15 rounded-2xl max-w-sm w-full p-5 sm:p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div>
                    <h4 className="text-sm font-bold text-white">QRIS VOITSFEST 2026</h4>
                    <p className="text-[11px] text-slate-400">AMALIA FITRIA - BOOK &amp; STATIONERY</p>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setIsQrisModalOpen(false)} 
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="bg-white rounded-xl p-3 flex items-center justify-center shadow-inner">
                  <img 
                    src="/qris-voitsfest.jpg" 
                    alt="QRIS Enlarged" 
                    className="w-full h-auto object-contain rounded-lg max-h-[55vh]" 
                  />
                </div>

                <div className="text-center space-y-1">
                  <div className="text-xs text-slate-300 font-mono">NMID: ID1026592450039</div>
                  <div className="text-base text-emerald-400 font-bold font-mono">
                    Total: Rp {finalPrice.toLocaleString("id-ID")}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <a 
                    href="/qris-voitsfest.jpg" 
                    download="QRIS-VOITSFEST-2026.jpg" 
                    className="w-full py-2.5 px-4 rounded-xl bg-secondary text-slate-950 font-bold text-xs flex items-center justify-center gap-2 hover:bg-secondary/90 transition-colors shadow-lg"
                  >
                    <Download className="w-4 h-4" />
                    <span>Unduh Gambar QRIS</span>
                  </a>
                </div>
              </div>
            </div>
          )}
        </main>

        <Footer />
      </div>
    </GatewayGuard>
  );
}
