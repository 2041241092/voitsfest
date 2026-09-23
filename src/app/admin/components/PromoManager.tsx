"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Tag, Plus, Trash2, Calendar, Sparkles, X, Loader2, Banknote, Check, Users, AlertCircle, RefreshCw, Edit, LayoutGrid, List, Upload, FileCheck } from "lucide-react";
import { Promo, DiscountType } from "@/types/database";
import {
  fetchPricingTiers,
  DEFAULT_PRICING_TIERS,
  PricingTiersConfig,
  PricingEvent,
  PRICING_EVENT_NAMES,
  formatRupiah,
} from "@/lib/pricing";
import {
  fetchAllSubEventQuotas,
  fetchPromoQuotas,
  SubEventQuotaMap,
  PromoQuotaStatus,
  dispatchQuotaRefresh,
} from "@/lib/quota";
import { extractSpecialTerms } from "@/lib/promo";
import {
  getInputValue,
  formatTableDate,
  toDateTimeLocalInput,
  formatPayloadToSupabase,
  formatDisplayWIB,
  formatDateRangeWIB,
  formatDisplayDateLongWIB,
  isEventActive,
  getEventTimeStatus,
  getLocalDatetimeString,
  parseWibDate,
} from "@/lib/timeUtils";

// Re-export for direct consumer access
export { getInputValue, formatTableDate };

interface PromoManagerProps {
  onToast?: (type: "success" | "error", message: string) => void;
}

export const PROMO_TARGET_EVENTS = [
  "BPC",
  "BCC",
  "Seminar",
  "Tenant",
  "ColorFun Run",
  "Festival",
] as const;

export type PromoTargetEvent = (typeof PROMO_TARGET_EVENTS)[number];

export default function PromoManager({ onToast }: PromoManagerProps) {
  const router = useRouter();
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");

  // Dynamic real-time quota state across all 6 sub-events and promos
  const [subEventQuotas, setSubEventQuotas] = useState<SubEventQuotaMap | null>(null);
  const [promoQuotas, setPromoQuotas] = useState<PromoQuotaStatus[]>([]);
  const [loadingQuotas, setLoadingQuotas] = useState(true);

  // Edit Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promo | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    discount_type: "percent" as DiscountType,
    discount_value: "",
    target_event: "ColorFun Run" as PromoTargetEvent,
    is_unlimited: false,
    kuota_maksimal: "",
    kapasitas: "1",
    kategori_peserta: "Semua",
    special_terms: [] as string[],
    requires_proof_file: false,
    proof_instruction: "",
    start_date: "",
    end_date: "",
    is_active: true,
  });

  // Form state for creating a new promo
  const [form, setForm] = useState({
    title: "",
    description: "",
    discount_type: "percent" as DiscountType,
    discount_value: "",
    target_event: "ColorFun Run" as PromoTargetEvent,
    is_unlimited: false,
    kuota_maksimal: "",
    kapasitas: "1",
    kategori_peserta: "Semua",
    special_terms: [] as string[],
    requires_proof_file: false,
    proof_instruction: "",
    start_date: getLocalDatetimeString(new Date()),
    end_date: getLocalDatetimeString(new Date(Date.now() + 30 * 86400000)),
    is_active: true,
  });

  // State for Manajemen Harga & Fase Pendaftaran (cms_settings: pricing_tiers)
  const [pricingTiers, setPricingTiers] = useState<PricingTiersConfig>(DEFAULT_PRICING_TIERS);
  const [loadingPricing, setLoadingPricing] = useState(true);
  const [savingPricing, setSavingPricing] = useState(false);

  // Sub-Event Dual-Quota & Pricing Edit Modal State
  const [subEventModalOpen, setSubEventModalOpen] = useState(false);
  const [editingEventKey, setEditingEventKey] = useState<PricingEvent | null>(null);
  const [savingSubEventPricing, setSavingSubEventPricing] = useState(false);
  const [subEventForm, setSubEventForm] = useState({
    phase: "",
    price: 0,
    start_date: "",
    end_date: "",
    is_phase_unlimited: false,
    phase_quota: "250",
    is_event_unlimited: false,
    event_quota: "500",
  });

  const openSubEventModal = (eventKey: PricingEvent) => {
    const current = pricingTiers[eventKey] || DEFAULT_PRICING_TIERS[eventKey];
    setEditingEventKey(eventKey);

    // CRITICAL RULE: Maintain backward compatibility if existing records still use max_quota by falling back event_quota = item.event_quota ?? item.max_quota
    const currentEventQuota = current.event_quota !== undefined
      ? current.event_quota
      : (current.total_event_quota !== undefined ? current.total_event_quota : current.max_quota);

    setSubEventForm({
      phase: current.phase || "",
      price: current.price ?? 0,
      start_date: getInputValue(current.start_date),
      end_date: getInputValue(current.end_date),
      is_phase_unlimited: current.phase_quota === null,
      phase_quota:
        current.phase_quota !== null && current.phase_quota !== undefined
          ? String(current.phase_quota)
          : "250",
      is_event_unlimited: currentEventQuota === null,
      event_quota:
        currentEventQuota !== null && currentEventQuota !== undefined
          ? String(currentEventQuota)
          : "500",
    });
    setSubEventModalOpen(true);
  };

  const handleSaveSubEventPricing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEventKey) return;

    setSavingSubEventPricing(true);
    try {
      const phaseQuotaVal = subEventForm.is_phase_unlimited
        ? null
        : Math.max(1, parseInt(subEventForm.phase_quota, 10) || 1);

      const eventQuotaVal = subEventForm.is_event_unlimited
        ? null
        : Math.max(1, parseInt(subEventForm.event_quota, 10) || 1);

      const updatedTiers: PricingTiersConfig = {
        ...pricingTiers,
        [editingEventKey]: {
          ...pricingTiers[editingEventKey],
          phase: subEventForm.phase.trim() || "Normal Price",
          price: Math.max(0, Number(subEventForm.price) || 0),
          start_date: subEventForm.start_date ? formatPayloadToSupabase(subEventForm.start_date) : null,
          end_date: subEventForm.end_date ? formatPayloadToSupabase(subEventForm.end_date) : null,
          phase_quota: phaseQuotaVal,
          event_quota: eventQuotaVal,
          total_event_quota: eventQuotaVal,
          max_quota: eventQuotaVal ?? (phaseQuotaVal ?? 500),
        },
      };

      const { error } = await supabase
        .from("cms_settings")
        .upsert({
          key: "pricing_tiers",
          value: updatedTiers,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      setPricingTiers(updatedTiers);
      onToast?.("success", `Pengaturan kuota & fase untuk ${PRICING_EVENT_NAMES[editingEventKey]} berhasil disimpan!`);
      setSubEventModalOpen(false);
      await fetchQuotas();
      dispatchQuotaRefresh();
    } catch (err: any) {
      console.error("Save sub-event pricing error:", err);
      onToast?.("error", `Gagal menyimpan kuota & fase: ${err.message}`);
    } finally {
      setSavingSubEventPricing(false);
    }
  };

  const supabase = createClient();

  // Load sub-event quotas and promo live calculations
  const fetchQuotas = useCallback(async () => {
    try {
      const [subQuotas, pQuotas] = await Promise.all([
        fetchAllSubEventQuotas(),
        fetchPromoQuotas(),
      ]);
      setSubEventQuotas(subQuotas);
      setPromoQuotas(pQuotas);
    } catch (err) {
      console.warn("Error fetching quota stats in PromoManager:", err);
    } finally {
      setLoadingQuotas(false);
    }
  }, []);

  useEffect(() => {
    async function loadPricing() {
      setLoadingPricing(true);
      const tiers = await fetchPricingTiers();
      setPricingTiers(tiers);
      setLoadingPricing(false);
    }
    loadPricing();
    fetchQuotas();
  }, [fetchQuotas]);

  const handlePricingChange = (
    eventKey: PricingEvent,
    field: "phase" | "price" | "max_quota" | "phase_quota" | "event_quota",
    val: any
  ) => {
    setPricingTiers((prev) => {
      const current = prev[eventKey];
      let updatedVal = val;
      if (field === "price") {
        updatedVal = Math.max(0, parseInt(val, 10) || 0);
      } else if (field === "phase_quota") {
        updatedVal = val === null ? null : Math.max(1, parseInt(val, 10) || 1);
      } else if (field === "event_quota" || field === "max_quota") {
        updatedVal = val === null ? null : Math.max(1, parseInt(val, 10) || 1);
      }

      const newTier = {
        ...current,
        [field]: updatedVal,
      };
      if (field === "event_quota" || field === "max_quota") {
        newTier.event_quota = updatedVal;
        newTier.total_event_quota = updatedVal;
        newTier.max_quota = updatedVal ?? 500;
      }

      return {
        ...prev,
        [eventKey]: newTier,
      };
    });
  };

  const handleSavePricing = async () => {
    setSavingPricing(true);
    try {
      const { error } = await supabase
        .from("cms_settings")
        .upsert({
          key: "pricing_tiers",
          value: pricingTiers,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
      onToast?.("success", "Pengaturan kuota, harga & fase pendaftaran berhasil disimpan ke cms_settings!");
      await fetchQuotas();
      dispatchQuotaRefresh();
    } catch (err: any) {
      console.error("Save pricing error:", err);
      onToast?.("error", `Gagal menyimpan harga & kuota: ${err.message}`);
    } finally {
      setSavingPricing(false);
    }
  };

  const fetchPromos = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const { data, error } = await supabase
        .from("promos")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching promos:", error);
        if (!isSilent) onToast?.("error", "Gagal memuat data promo: " + error.message);
      } else {
        setPromos((data as Promo[]) || []);
      }
    } catch (err: any) {
      console.error("Fetch promos error:", err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [supabase, onToast]);

  useEffect(() => {
    fetchPromos();
  }, [fetchPromos]);

  // Realtime subscription & window event listeners for instantaneous quota counter revalidation
  useEffect(() => {
    const handleRefresh = () => {
      fetchPromos(true);
      fetchQuotas();
    };

    window.addEventListener("promo-quota-updated", handleRefresh);
    window.addEventListener("admin-refresh-data", handleRefresh);

    const channel = supabase
      .channel("promo-manager-realtime-quota")
      .on("postgres_changes", { event: "*", schema: "public", table: "cms_settings" }, handleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "promos" }, handleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "festival_registrations" }, handleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "colorfun_registrations" }, handleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "bpc_registrations" }, handleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "bcc_registrations" }, handleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "seminar_registrations" }, handleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "tenant_registrations" }, handleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, handleRefresh)
      .subscribe();

    return () => {
      window.removeEventListener("promo-quota-updated", handleRefresh);
      window.removeEventListener("admin-refresh-data", handleRefresh);
      supabase.removeChannel(channel);
    };
  }, [fetchPromos, fetchQuotas, supabase]);

  // Handle Toggle Active Status
  const handleToggleActive = async (promo: Promo) => {
    const newStatus = !promo.is_active;
    // Optimistic UI update
    setPromos((prev) =>
      prev.map((p) => (p.id === promo.id ? { ...p, is_active: newStatus } : p))
    );

    try {
      const { error } = await supabase
        .from("promos")
        .update({ is_active: newStatus })
        .eq("id", promo.id);

      if (error) {
        // Revert
        setPromos((prev) =>
          prev.map((p) => (p.id === promo.id ? { ...p, is_active: promo.is_active } : p))
        );
        onToast?.("error", `Gagal mengubah status: ${error.message}`);
      } else {
        onToast?.(
          "success",
          `Promo "${promo.title}" sekarang ${newStatus ? "Aktif" : "Nonaktif"}.`
        );
        router.refresh();
        await fetchPromos(true);
        await fetchQuotas();
        dispatchQuotaRefresh();
      }
    } catch (err: any) {
      onToast?.("error", `Terjadi kesalahan: ${err.message}`);
    }
  };

  // Handle Delete Promo
  const handleDeletePromo = async (id: string, title: string) => {
    if (!confirm(`Hapus promo "${title}" secara permanen?`)) return;

    try {
      const { error } = await supabase.from("promos").delete().eq("id", id);
      if (error) {
        onToast?.("error", `Gagal menghapus promo: ${error.message}`);
      } else {
        setPromos((prev) => prev.filter((p) => p.id !== id));
        onToast?.("success", `Promo "${title}" berhasil dihapus.`);
        router.refresh();
        await fetchPromos(true);
        await fetchQuotas();
        dispatchQuotaRefresh();
      }
    } catch (err: any) {
      onToast?.("error", `Gagal menghapus promo: ${err.message}`);
    }
  };

  // Handle Create Promo Form Submit
  const handleCreatePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.discount_value) {
      onToast?.("error", "Harap isi semua kolom wajib!");
      return;
    }

    if (!form.start_date || !form.end_date) {
      onToast?.("error", "Harap tentukan tanggal mulai dan tanggal berakhir!");
      return;
    }

    const formattedStartDate = formatPayloadToSupabase(form.start_date);
    const formattedEndDate = formatPayloadToSupabase(form.end_date);
    if (!formattedStartDate || !formattedEndDate || formattedEndDate <= formattedStartDate) {
      onToast?.("error", "Tanggal berakhir harus setelah tanggal mulai!");
      return;
    }

    let kuotaMax: number | null = null;
    if (!form.is_unlimited) {
      const parsed = parseInt(form.kuota_maksimal, 10);
      if (isNaN(parsed) || parsed <= 0) {
        onToast?.("error", "Maksimal kuota harus berupa angka positif lebih dari 0 atau aktifkan 'Unlimited Kuota'!");
        return;
      }
      kuotaMax = parsed;
    }

    setSubmitting(true);
    try {
      // 1. Form State to Payload Sanitization (Create & Edit Modal)
      // Transform Special Terms Array: Handle both array of objects [{ text: '...' }] and array of strings
      const sanitizedSpecialTerms: string[] = Array.isArray(form.special_terms)
        ? form.special_terms
            .map((item: any) => (typeof item === "string" ? item : item?.text || item?.value || ""))
            .map((str: string) => String(str).trim())
            .filter((str: string) => str.length > 0)
        : [];

      // Boolean Cast for Proof Requirement
      const sanitizedRequiresProof: boolean = Boolean(form.requires_proof_file);

      // Normalize discount_type to valid PostgreSQL enum ('percent' | 'nominal' | 'bundling')
      let normalizedDiscountType: DiscountType = "percent";
      const dtRaw = String(form.discount_type || "").toLowerCase();
      if (dtRaw === "percentage" || dtRaw === "percent") {
        normalizedDiscountType = "percent";
      } else if (dtRaw === "fixed" || dtRaw === "nominal") {
        normalizedDiscountType = "nominal";
      } else if (dtRaw === "bundling" || dtRaw === "bundle_price" || dtRaw === "bundle") {
        normalizedDiscountType = "bundling";
      }

      // Explicitly include both properties in Mutation Payloads (Do NOT include proof_instructions / terms_and_conditions)
      const payload: Record<string, any> = {
        title: form.title.trim(),
        description: form.description ? form.description.trim() : "",
        target_event: form.target_event,
        kuota_maksimal: kuotaMax, // Integer or null if unlimited
        kuota_terpakai: 0,
        kapasitas: parseInt(form.kapasitas, 10) || 1,
        kategori_peserta: form.kategori_peserta || "Semua",
        discount_type: normalizedDiscountType,
        discount_value: Number(form.discount_value) || 0,
        start_date: formattedStartDate,
        end_date: formattedEndDate,
        is_active: Boolean(form.is_active),
        special_terms: sanitizedSpecialTerms,
        requires_proof_file: sanitizedRequiresProof,
        proof_instruction: (form.proof_instruction || "").trim(),
      };

      const toast = {
        success: (msg: string) => onToast?.("success", msg),
        error: (msg: string) => onToast?.("error", msg),
      };

      const { data, error } = await supabase
        .from("promos")
        .insert([payload])
        .select();

      if (error) {
        console.error("Supabase Promo Insert Error:", error.message, error.details);
        toast.error(`Gagal membuat promo: ${error.message}`);
        return;
      }

      toast.success("Promo berhasil ditambahkan!");
      if (data && data[0]) {
        setPromos((prev) => [data[0] as Promo, ...prev]);
      }
      setModalOpen(false);

      // Reset form
      setForm({
        title: "",
        description: "",
        discount_type: "percent",
        discount_value: "",
        target_event: "ColorFun Run",
        is_unlimited: false,
        kuota_maksimal: "",
        kapasitas: "1",
        kategori_peserta: "Semua",
        special_terms: [],
        requires_proof_file: false,
        proof_instruction: "",
        start_date: getLocalDatetimeString(new Date()),
        end_date: getLocalDatetimeString(new Date(Date.now() + 30 * 86400000)),
        is_active: true,
      });

      router.refresh();
      await fetchPromos(true);
      await fetchQuotas();
      dispatchQuotaRefresh();
    } catch (err: any) {
      console.error("Promo creation exception:", err);
      onToast?.("error", `Gagal membuat promo: ${err.message || "Terjadi kesalahan internal"}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Open Edit Modal for a promo (Direct extraction without timezone offset)
  const openEditModal = (promo: Promo) => {
    setEditingPromo(promo);
    const isUnlimited = promo.kuota_maksimal === null || promo.kuota_maksimal === undefined;
    const targetEvt = PROMO_TARGET_EVENTS.includes(promo.target_event as any)
      ? (promo.target_event as PromoTargetEvent)
      : "ColorFun Run";

    // 2. Edit Modal Initialization (Pre-fill Data)
    // special_terms: Pre-populate the dynamic input rows with currentPromo.special_terms || []
    const existingTerms: string[] = Array.isArray(promo.special_terms)
      ? promo.special_terms
          .map((item: any) => (typeof item === "string" ? item : item?.text || item?.value || ""))
          .map((str: string) => String(str).trim())
          .filter((str: string) => str.length > 0)
      : extractSpecialTerms(promo);

    setEditForm({
      title: promo.title || "",
      description: promo.description || "",
      discount_type: promo.discount_type || "percent",
      discount_value: String(promo.discount_value ?? ""),
      target_event: targetEvt,
      is_unlimited: isUnlimited,
      kuota_maksimal: isUnlimited ? "" : String(promo.kuota_maksimal ?? ""),
      kapasitas: String(promo.kapasitas || 1),
      kategori_peserta: promo.kategori_peserta || "Semua",
      special_terms: existingTerms,
      // requires_proof_file: Set toggle state to Boolean(currentPromo.requires_proof_file)
      requires_proof_file: Boolean(promo.requires_proof_file),
      proof_instruction: promo.proof_instruction || promo.proof_instructions || "",
      start_date: getInputValue(promo.start_date),
      end_date: getInputValue(promo.end_date),
      is_active: promo.is_active ?? true,
    });
    setEditModalOpen(true);
  };

  // Handle Save Promo Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPromo) return;

    if (!editForm.title.trim()) {
      onToast?.("error", "Judul promo wajib diisi!");
      return;
    }

    if (!editForm.start_date || !editForm.end_date) {
      onToast?.("error", "Tanggal mulai dan berakhir wajib ditentukan!");
      return;
    }

    const formattedStartDate = formatPayloadToSupabase(editForm.start_date);
    const formattedEndDate = formatPayloadToSupabase(editForm.end_date);
    if (!formattedStartDate || !formattedEndDate || formattedEndDate <= formattedStartDate) {
      onToast?.("error", "Tanggal berakhir harus setelah tanggal mulai!");
      return;
    }

    let kuotaVal: number | null = null;
    if (!editForm.is_unlimited) {
      const parsed = parseInt(editForm.kuota_maksimal, 10);
      if (isNaN(parsed) || parsed <= 0) {
        onToast?.("error", "Maksimal kuota harus berupa angka positif lebih dari 0 atau aktifkan 'Unlimited Kuota'!");
        return;
      }
      kuotaVal = parsed;
    }

    setSavingEdit(true);
    try {
      // 1. Form State to Payload Sanitization (Create & Edit Modal)
      // Transform Special Terms Array: Handle both array of objects [{ text: '...' }] and array of strings
      const sanitizedSpecialTerms: string[] = Array.isArray(editForm.special_terms)
        ? editForm.special_terms
            .map((item: any) => (typeof item === "string" ? item : item?.text || item?.value || ""))
            .map((str: string) => String(str).trim())
            .filter((str: string) => str.length > 0)
        : [];

      // Boolean Cast for Proof Requirement
      const sanitizedRequiresProof: boolean = Boolean(editForm.requires_proof_file);

      let normalizedDiscountType: DiscountType = "percent";
      const dtRaw = String(editForm.discount_type || "").toLowerCase();
      if (dtRaw === "percentage" || dtRaw === "percent") {
        normalizedDiscountType = "percent";
      } else if (dtRaw === "fixed" || dtRaw === "nominal") {
        normalizedDiscountType = "nominal";
      } else if (dtRaw === "bundling" || dtRaw === "bundle_price" || dtRaw === "bundle") {
        normalizedDiscountType = "bundling";
      }

      // Map all edited fields into update payload for Supabase public.promos (Explicitly include special_terms and requires_proof_file)
      const updatePayload: Record<string, any> = {
        title: editForm.title.trim(),
        description: editForm.description ? editForm.description.trim() : "",
        discount_type: normalizedDiscountType,
        discount_value: Number(editForm.discount_value) || 0,
        target_event: editForm.target_event,
        kuota_maksimal: kuotaVal,
        kapasitas: parseInt(editForm.kapasitas, 10) || 1,
        kategori_peserta: editForm.kategori_peserta || "Semua",
        special_terms: sanitizedSpecialTerms,
        requires_proof_file: sanitizedRequiresProof,
        proof_instruction: (editForm.proof_instruction || "").trim(),
        start_date: formattedStartDate,
        end_date: formattedEndDate,
        is_active: Boolean(editForm.is_active),
      };

      const toast = {
        success: (msg: string) => onToast?.("success", msg),
        error: (msg: string) => onToast?.("error", msg),
      };

      const { data, error } = await supabase
        .from("promos")
        .update(updatePayload)
        .eq("id", editingPromo.id)
        .select();

      if (error) {
        console.error("Supabase Promo Update Error:", error.message, error.details);
        toast.error(`Gagal memperbarui promo: ${error.message}`);
        return;
      }

      toast.success("Katalog promo berhasil diperbarui.");
      const updatedPromo: Promo = (data && data[0] ? data[0] : null) as Promo || {
        ...editingPromo,
        ...updatePayload,
        kuota_terpakai: editingPromo.kuota_terpakai,
        updated_at: new Date().toISOString(),
      };
      setPromos((prev) =>
        prev.map((p) => (p.id === editingPromo.id ? updatedPromo : p))
      );
      setEditModalOpen(false);

      // Immediately trigger table refetch & revalidation
      router.refresh();
      await fetchPromos(true);
      await fetchQuotas();
      dispatchQuotaRefresh();
      window.dispatchEvent(new CustomEvent("promo-quota-updated"));
      window.dispatchEvent(new CustomEvent("admin-refresh-data"));
    } catch (err: any) {
      console.error("Save promo edit error:", err);
      onToast?.("error", `Gagal memperbarui promo: ${err.message || "Terjadi kesalahan internal"}`);
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <section className="bg-surface-container/30 backdrop-blur-xl border border-white/20 rounded-2xl p-6 relative shadow-2xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-on-surface flex items-center gap-2.5">
            <Tag className="w-5 h-5 text-secondary" />
            Bundling &amp; Promo Control
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-secondary/15 text-secondary border border-secondary/30 uppercase">
              promos table
            </span>
          </h2>
          <p className="text-xs text-on-surface-variant mt-1">
            Kelola penawaran bundling dan diskon promo yang tampil di User Dashboard (Hot Deals)
          </p>
        </div>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-tertiary text-primary-container font-bold text-xs uppercase tracking-wider hover:bg-tertiary-fixed transition-all cursor-pointer shadow-lg hover:shadow-tertiary/20"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Promo Baru</span>
        </button>
      </div>

      {/* ── REAL-TIME QUOTA & PROMO SYNCHRONIZATION TABLE ── */}
      <div className="mb-8 p-5 rounded-2xl bg-surface-container-low/60 border border-white/15 shadow-xl">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-4 pb-3 border-b border-white/10">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-secondary" />
              Tabel Kontrol Kuota Terpusat (Real-Time)
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 uppercase">
                Live Formula: Pending + Approved
              </span>
            </h3>
            <p className="text-xs text-on-surface-variant mt-0.5 font-poppins">
              Menghitung seluruh pendaftaran <code className="text-secondary">status IN (&apos;pending&apos;, &apos;approved&apos;)</code>. Sisa Kuota = Total Kuota - Kuota Terpakai.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              fetchPromos(true);
              fetchQuotas();
            }}
            disabled={loadingQuotas}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white text-xs border border-white/15 transition-all cursor-pointer disabled:opacity-50"
            title="Refresh Live Quota Counts"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-secondary ${loadingQuotas ? "animate-spin" : ""}`} />
            <span>Segarkan Data</span>
          </button>
        </div>

        {/* Sub-Events Live Quota Table */}
        <div className="overflow-x-auto rounded-xl border border-white/10 mb-5">
          <table className="w-full text-left border-collapse text-xs font-poppins">
            <thead>
              <tr className="bg-surface-container-high text-on-surface-variant uppercase tracking-wider text-[11px] border-b border-white/10">
                <th className="py-3 px-4 font-semibold">Sub-Event</th>
                <th className="py-3 px-4 font-semibold">Fase &amp; Harga</th>
                <th className="py-3 px-4 font-semibold text-center">
                  <div>Total Kuota (Fase Pendaftaran)</div>
                  <div className="text-[9px] font-normal text-secondary normal-case">Hanya Tiket Reguler (Non-Promo)</div>
                </th>
                <th className="py-3 px-4 font-semibold text-center">
                  <div>Total Kuota (Slot Peserta)</div>
                  <div className="text-[9px] font-normal text-emerald-400 normal-case">Kumulatif Reguler + Bundling</div>
                </th>
                <th className="py-3 px-4 font-semibold text-center">Status Pendaftaran</th>
                <th className="py-3 px-4 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono">
              {(Object.keys(DEFAULT_PRICING_TIERS) as PricingEvent[]).map((eventKey) => {
                const item = pricingTiers[eventKey] || DEFAULT_PRICING_TIERS[eventKey];
                const eventName = PRICING_EVENT_NAMES[eventKey];
                const q = subEventQuotas?.[eventKey];

                const isPhaseUnlimited = item.phase_quota === null;
                const usedInPhase = q ? q.usedInPhase : 0;
                const remainingPhase = q ? q.remainingPhaseQuota : item.phase_quota;
                const isPhaseFull = q ? q.isPhaseFull : false;
                const phasePercent = !isPhaseUnlimited && item.phase_quota && item.phase_quota > 0
                  ? Math.min(100, Math.round((usedInPhase / item.phase_quota) * 100))
                  : 0;

                const effectiveEventQuota = item.event_quota !== undefined ? item.event_quota : (item.total_event_quota !== undefined ? item.total_event_quota : item.max_quota ?? null);
                const isEventUnlimited = effectiveEventQuota === null;
                const totalRegistered = q ? q.totalEventRegistered : 0;
                const remainingEvent = q ? q.remainingEventQuota : effectiveEventQuota;
                const isEventFull = q ? q.isEventFull : false;
                const eventPercent = !isEventUnlimited && effectiveEventQuota && effectiveEventQuota > 0
                  ? Math.min(100, Math.round((totalRegistered / effectiveEventQuota) * 100))
                  : 0;

                return (
                  <tr key={eventKey} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-4 font-sans font-medium text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-secondary shrink-0" />
                      <div>
                        <p className="font-semibold text-xs">{eventName}</p>
                        <p className="text-[10px] text-on-surface-variant font-mono uppercase">{eventKey}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-on-surface font-sans">
                      <span className="font-medium text-white">{item.phase}</span>
                      <span className="block text-[11px] text-[#ffd700] font-mono">{formatRupiah(item.price)}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="inline-flex flex-col items-center gap-1 w-full max-w-[160px] mx-auto">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-white/5 border border-white/10 font-bold text-white text-xs">
                          <span>{usedInPhase}</span>
                          <span className="text-on-surface-variant font-normal">/</span>
                          <span className={isPhaseUnlimited ? "text-secondary font-normal" : "text-white"}>
                            {isPhaseUnlimited ? "Unlimited" : item.phase_quota}
                          </span>
                        </span>
                        {!isPhaseUnlimited && (
                          <div className="w-full bg-surface-container-highest/80 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                isPhaseFull
                                  ? "bg-rose-500"
                                  : phasePercent >= 80
                                  ? "bg-amber-400"
                                  : "bg-[#87CEEB]"
                              }`}
                              style={{ width: `${phasePercent}%` }}
                            />
                          </div>
                        )}
                        <span className={`text-[10px] font-sans font-medium ${
                          isPhaseFull
                            ? "text-error"
                            : remainingPhase !== null && remainingPhase <= 20
                            ? "text-amber-300"
                            : "text-slate-400"
                        }`}>
                          {isPhaseFull ? "Kuota Fase Habis" : remainingPhase !== null ? `Sisa: ${remainingPhase} Slot (${phasePercent}%)` : "Tanpa Batas"}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="inline-flex flex-col items-center gap-1 w-full max-w-[160px] mx-auto">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-white/5 border border-white/10 font-bold text-white text-xs">
                          <span>{totalRegistered}</span>
                          <span className="text-on-surface-variant font-normal">/</span>
                          <span className={isEventUnlimited ? "text-secondary font-normal" : "text-white"}>
                            {isEventUnlimited ? "Unlimited" : effectiveEventQuota}
                          </span>
                        </span>
                        {!isEventUnlimited && (
                          <div className="w-full bg-surface-container-highest/80 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                isEventFull
                                  ? "bg-rose-500"
                                  : eventPercent >= 80
                                  ? "bg-amber-400"
                                  : "bg-emerald-400"
                              }`}
                              style={{ width: `${eventPercent}%` }}
                            />
                          </div>
                        )}
                        <span className="text-[10px] font-sans text-on-surface-variant">
                          ({q?.pendingCount || 0} P / {q?.approvedCount || 0} A) &bull;{" "}
                          <span className={isEventFull ? "text-error font-medium" : "text-slate-400"}>
                            {isEventFull ? "Penuh" : remainingEvent !== null ? `Sisa: ${remainingEvent} (${eventPercent}%)` : "Tanpa Batas"}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center font-sans">
                      {isEventFull ? (
                        <span className="text-[10.5px] font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1 bg-error/20 text-error border border-error/30 whitespace-nowrap">
                          Kapasitas Event Penuh / Sold Out
                        </span>
                      ) : isPhaseFull ? (
                        <span className="text-[10.5px] font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 whitespace-nowrap">
                          Kuota Fase Ini Habis
                        </span>
                      ) : q && !q.isPhaseDateActive ? (
                        <span className="text-[10.5px] font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1 bg-slate-500/20 text-slate-300 border border-slate-500/30 whitespace-nowrap">
                          {q.availabilityReason === "phase_date_not_started" ? "Fase Belum Dimulai" : "Fase Berakhir"}
                        </span>
                      ) : (
                        <span className="text-[10.5px] font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 whitespace-nowrap">
                          Tersedia
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-sans">
                      <button
                        type="button"
                        onClick={() => openSubEventModal(eventKey)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-secondary/10 hover:bg-secondary/20 text-secondary border border-secondary/20 text-xs font-semibold transition-all cursor-pointer"
                        title="Edit Kuota, Harga & Fase"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Promo List Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-tertiary" />
            Katalog Promo &amp; Bundling Aktif
          </h3>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Daftar penawaran voucher &amp; paket bundling rombongan beserta sisa kuota aktif
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-black/40 border border-white/10 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === "table"
                  ? "bg-secondary text-primary-container shadow"
                  : "text-on-surface-variant hover:text-white"
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Tabel</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === "cards"
                  ? "bg-secondary text-primary-container shadow"
                  : "text-on-surface-variant hover:text-white"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Kartu</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-tertiary text-primary-container font-bold text-xs uppercase tracking-wider hover:bg-tertiary-fixed transition-all cursor-pointer shadow-lg hover:shadow-tertiary/20"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Promo Baru</span>
          </button>
        </div>
      </div>

      {/* Promo Content */}
      {loading ? (
        <div className="p-8 text-center text-on-surface-variant text-sm">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-secondary" />
          Memuat data promo...
        </div>
      ) : promos.length === 0 ? (
        <div className="p-10 rounded-xl border border-dashed border-white/15 text-center text-on-surface-variant text-sm bg-surface-container-low/20">
          <Tag className="w-8 h-8 mx-auto mb-2 opacity-40 text-secondary" />
          <p className="font-semibold text-white">Belum Ada Promo Aktif</p>
          <p className="text-xs text-on-surface-variant/70 mt-1">
            Klik tombol &ldquo;Tambah Promo Baru&rdquo; untuk membuat voucher atau bundling diskon tiket.
          </p>
        </div>
      ) : viewMode === "table" ? (
        /* ── TABLE VIEW FOR BUNDLING & PROMO CONTROL ── */
        <div className="overflow-x-auto rounded-xl border border-white/10 mb-5 shadow-lg bg-surface-container-lowest/40">
          <table className="w-full text-left border-collapse text-xs font-poppins">
            <thead>
              <tr className="bg-surface-container-high text-on-surface-variant uppercase tracking-wider text-[11px] border-b border-white/10">
                <th className="py-3.5 px-4 font-semibold">Promo / Bundle</th>
                <th className="py-3.5 px-4 font-semibold">Event Target</th>
                <th className="py-3.5 px-4 font-semibold">Diskon / Harga</th>
                <th className="py-3.5 px-4 font-semibold">Periode Aktif</th>
                <th className="py-3.5 px-4 font-semibold text-center">Kuota (Terpakai / Sisa)</th>
                <th className="py-3.5 px-4 font-semibold text-center">Status</th>
                <th className="py-3.5 px-4 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono">
              {promos.map((promo) => {
                const promoStatus = promoQuotas.find((pq) => pq.promo.id === promo.id);
                const liveUsed = promoStatus ? promoStatus.usedQuota : (promo.kuota_terpakai ?? 0);
                const livePending = promoStatus ? promoStatus.pendingCount : 0;
                const liveApproved = promoStatus ? promoStatus.approvedCount : liveUsed;
                const isUnlimited = promo.kuota_maksimal == null;
                const maxQuota = isUnlimited ? null : promo.kuota_maksimal;
                const liveRemaining = isUnlimited ? null : Math.max(0, (maxQuota as number) - liveUsed);
                const isPromoFull = !isUnlimited && liveUsed >= (maxQuota as number);

                const { isStarted: isDateStarted, isEnded: isDateEnded, isActive: isDateActive } = getEventTimeStatus(promo.start_date, promo.end_date);
                const isExpired = !isDateActive;

                return (
                  <tr key={promo.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3.5 px-4 font-sans">
                      <div className="font-bold text-white text-sm">{promo.title}</div>
                      <div className="text-[11px] text-on-surface-variant line-clamp-1 max-w-xs">{promo.description || "-"}</div>
                    </td>
                    <td className="py-3.5 px-4 font-sans">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-primary/15 text-primary border border-primary/30">
                          {promo.target_event || "All"}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary/15 text-secondary border border-secondary/30">
                          {promo.kapasitas || 1} Org
                        </span>
                        {promo.kategori_peserta && promo.kategori_peserta !== "Semua" && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                            {promo.kategori_peserta}
                          </span>
                        )}
                        {(() => {
                          const terms = extractSpecialTerms(promo);
                          return terms.length > 0 ? (
                            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-sans" title={terms.join(" • ")}>
                              {terms.length} Syarat Khusus
                            </span>
                          ) : null;
                        })()}
                        {promo.requires_proof_file && (
                          <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 flex items-center gap-1 font-sans" title={promo.proof_instruction || promo.proof_instructions || "Wajib upload berkas bukti persyaratan"}>
                            <FileCheck className="w-2.5 h-2.5" /> Wajib Bukti
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-sans">
                      <span className="font-bold text-sm text-[#ffd700] block">
                        {promo.discount_type === "percent"
                          ? `${promo.discount_value}% OFF`
                          : promo.discount_type === "bundling"
                          ? `Rp ${Number(promo.discount_value).toLocaleString("id-ID")}`
                          : `Hemat Rp ${Number(promo.discount_value).toLocaleString("id-ID")}`}
                      </span>
                      <span className="text-[10px] font-mono text-on-surface-variant uppercase">{promo.discount_type}</span>
                    </td>
                    <td className="py-3.5 px-4 font-sans text-xs">
                      <div className="flex items-center gap-1.5 text-slate-200 font-mono text-[11px]">
                        <Calendar className="w-3.5 h-3.5 text-secondary shrink-0" />
                        <span>
                          {formatTableDate(promo.start_date)}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 ml-5 font-mono mt-0.5">
                        s/d {formatTableDate(promo.end_date)}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {isUnlimited ? (
                        <div className="inline-flex flex-col items-center gap-0.5">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-semibold text-xs">
                            <Sparkles className="w-3 h-3" />
                            <span>Tanpa Batas Kuota (∞)</span>
                          </span>
                          <span className="text-[10px] text-on-surface-variant">
                            {liveUsed} Terpakai ({livePending} P / {liveApproved} A)
                          </span>
                        </div>
                      ) : (
                        <div className="inline-flex flex-col items-center">
                          <span className="font-bold text-white text-xs">
                            {liveUsed} / {maxQuota}
                          </span>
                          <span className={`text-[10px] ${liveRemaining === 0 ? "text-error font-bold" : "text-emerald-400"}`}>
                            (Sisa: {liveRemaining} slot)
                          </span>
                          <span className="text-[9px] text-on-surface-variant">
                            ({livePending} P / {liveApproved} A)
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center font-sans">
                      <div className="flex flex-col items-center gap-1.5">
                        <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${
                          !promo.is_active
                            ? "bg-slate-500/20 text-slate-400"
                            : isPromoFull
                            ? "bg-error/20 text-error border border-error/30"
                            : isExpired
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        }`}>
                          {!promo.is_active ? "Nonaktif" : isPromoFull ? "Habis (Sold Out)" : isExpired ? "Periode Berakhir" : "Tersedia"}
                        </span>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0" title={promo.is_active ? "Klik untuk Nonaktifkan" : "Klik untuk Aktifkan"}>
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={promo.is_active}
                            onChange={() => handleToggleActive(promo)}
                          />
                          <div className="w-7 h-4 bg-surface-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-secondary"></div>
                        </label>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Edit Action Button */}
                        <button
                          type="button"
                          onClick={() => openEditModal(promo)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/15 hover:bg-secondary/25 text-secondary border border-secondary/30 text-xs font-semibold transition-all cursor-pointer shadow-sm hover:scale-105"
                          title="Edit Bundle / Promo"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePromo(promo.id, promo.title)}
                          title="Hapus Promo"
                          className="p-1.5 text-on-surface-variant hover:text-error transition-colors cursor-pointer rounded-lg hover:bg-white/5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── CARDS VIEW FOR BUNDLING & PROMO CONTROL ── */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {promos.map((promo) => {
            const promoStatus = promoQuotas.find((pq) => pq.promo.id === promo.id);
            const liveUsed = promoStatus ? promoStatus.usedQuota : (promo.kuota_terpakai ?? 0);
            const livePending = promoStatus ? promoStatus.pendingCount : 0;
            const liveApproved = promoStatus ? promoStatus.approvedCount : liveUsed;
            const isUnlimited = promo.kuota_maksimal == null;
            const maxQuota = isUnlimited ? null : promo.kuota_maksimal;
            const liveRemaining = isUnlimited ? null : Math.max(0, (maxQuota as number) - liveUsed);
            const isPromoFull = !isUnlimited && liveUsed >= (maxQuota as number);

            return (
              <div
                key={promo.id}
                className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                  promo.is_active
                    ? "bg-surface-container-low/60 border-white/15 shadow-md hover:border-secondary/40"
                    : "bg-surface-container-lowest/30 border-white/5 opacity-60"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border inline-block ${
                            promo.discount_type === "percent"
                              ? "bg-secondary/15 text-secondary border-secondary/30"
                              : promo.discount_type === "bundling"
                              ? "bg-tertiary/15 text-tertiary border-tertiary/30"
                              : "bg-[#ffd700]/15 text-[#ffd700] border-[#ffd700]/30"
                          }`}
                        >
                          {promo.discount_type}
                        </span>

                        {/* Event Badge */}
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border bg-primary/15 text-primary border-primary/30 inline-flex items-center gap-1">
                          Event: {promo.target_event || "All Events"}
                        </span>

                        {/* Quota Badge (Live Pending + Approved) */}
                        <span
                          className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border inline-flex items-center gap-1 ${
                            isUnlimited
                              ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
                              : isPromoFull
                              ? "bg-error/15 text-error border-error/30"
                              : "bg-surface-container-highest text-on-surface-variant border-white/10"
                          }`}
                          title={`Terpakai: ${liveUsed} (${livePending} Pending, ${liveApproved} Approved)`}
                        >
                          {isUnlimited ? (
                            <span>Quota: Unlimited (Terpakai: {liveUsed})</span>
                          ) : (
                            <>
                              Quota: {liveUsed} / {maxQuota}
                              <span className="text-[9px] text-emerald-400 ml-1">
                                (Sisa: {liveRemaining})
                              </span>
                            </>
                          )}
                        </span>

                        {/* Capacity Badge in Admin Central */}
                        <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded border bg-secondary/15 text-secondary border-secondary/30 inline-flex items-center gap-1">
                          Kapasitas: {promo.kapasitas || 1} Orang
                        </span>

                        {/* Kategori Peserta Target Badge in Admin Central */}
                        <span className="text-[10px] font-sans font-semibold px-2 py-0.5 rounded border bg-cyan-500/15 text-cyan-300 border-cyan-500/30 inline-flex items-center gap-1">
                          Target: {promo.kategori_peserta || "Semua"}
                        </span>

                        {/* Special Terms Badge */}
                        {(() => {
                          const terms = extractSpecialTerms(promo);
                          return terms.length > 0 ? (
                            <span className="text-[10px] font-sans font-semibold px-2 py-0.5 rounded border bg-amber-500/15 text-amber-300 border-amber-500/30 inline-flex items-center gap-1" title={terms.join(" • ")}>
                              Syarat Khusus ({terms.length})
                            </span>
                          ) : null;
                        })()}

                        {promo.requires_proof_file && (
                          <span className="text-[10px] font-sans font-semibold px-2 py-0.5 rounded border bg-blue-500/15 text-blue-300 border-blue-500/30 inline-flex items-center gap-1" title={promo.proof_instruction || promo.proof_instructions || "Wajib upload berkas bukti persyaratan"}>
                            <FileCheck className="w-3 h-3" /> Wajib Bukti
                          </span>
                        )}
                      </div>

                      <h3 className="font-bold text-base text-white">{promo.title}</h3>
                    </div>

                    {/* Active Toggle */}
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={promo.is_active}
                        onChange={() => handleToggleActive(promo)}
                      />
                      <div className="w-9 h-5 bg-surface-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-secondary"></div>
                    </label>
                  </div>

                  <p className="text-xs text-on-surface-variant line-clamp-2 mb-3 font-poppins">
                    {promo.description || "Tidak ada deskripsi"}
                  </p>
                </div>

                <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <Calendar className="w-3.5 h-3.5 text-secondary shrink-0" />
                    <span>
                      {formatTableDate(promo.start_date)} - {formatTableDate(promo.end_date)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-[#ffd700] mr-1">
                      {promo.discount_type === "percent"
                        ? `${promo.discount_value}% OFF`
                        : `Rp ${Number(promo.discount_value).toLocaleString("id-ID")}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => openEditModal(promo)}
                      title="Edit Promo"
                      className="p-1.5 text-on-surface-variant hover:text-secondary transition-colors cursor-pointer rounded-lg hover:bg-white/5 flex items-center gap-1 text-xs"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePromo(promo.id, promo.title)}
                      title="Hapus Promo"
                      className="p-1.5 text-on-surface-variant hover:text-error transition-colors cursor-pointer rounded-lg hover:bg-white/5"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Sub-section: Manajemen Kuota, Harga & Fase Pendaftaran ── */}
      <div className="mt-10 pt-8 border-t border-white/10">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
          <div>
            <h3 className="text-lg font-bold text-on-surface flex items-center gap-2.5">
              <Banknote className="w-5 h-5 text-[#ffd700]" />
              Manajemen Kuota, Harga &amp; Fase Pendaftaran
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#ffd700]/15 text-[#ffd700] border border-[#ffd700]/30 uppercase">
                cms_settings: pricing_tiers
              </span>
            </h3>
            <p className="text-xs text-on-surface-variant mt-1">
              Atur nama fase aktif, nominal biaya pendaftaran (Rp), dan batas maksimal kuota peserta untuk seluruh 6 sub-event.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSavePricing}
            disabled={savingPricing || loadingPricing}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary-container text-primary font-bold text-xs uppercase tracking-wider hover:bg-primary-container/80 transition-all cursor-pointer shadow-lg hover:shadow-primary-container/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingPricing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Menyimpan...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Simpan Kuota &amp; Harga</span>
              </>
            )}
          </button>
        </div>

        {/* 6 Sub-Event Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(Object.keys(DEFAULT_PRICING_TIERS) as PricingEvent[]).map((eventKey) => {
            const item = pricingTiers[eventKey] || DEFAULT_PRICING_TIERS[eventKey];
            const eventName = PRICING_EVENT_NAMES[eventKey];
            const q = subEventQuotas?.[eventKey];

            const isPhaseUnlimited = item.phase_quota === null;
            const usedInPhase = q ? q.usedInPhase : 0;
            const remainingPhase = q ? q.remainingPhaseQuota : item.phase_quota;
            const isPhaseFull = q ? q.isPhaseFull : false;
            const phasePercent = !isPhaseUnlimited && item.phase_quota && item.phase_quota > 0
              ? Math.min(100, Math.round((usedInPhase / item.phase_quota) * 100))
              : 0;

            const effectiveEventQuota = item.event_quota !== undefined ? item.event_quota : (item.total_event_quota !== undefined ? item.total_event_quota : item.max_quota ?? null);
            const isEventUnlimited = effectiveEventQuota === null;
            const totalRegistered = q ? q.totalEventRegistered : 0;
            const remainingEvent = q ? q.remainingEventQuota : effectiveEventQuota;
            const isEventFull = q ? q.isEventFull : false;
            const eventPercent = !isEventUnlimited && effectiveEventQuota && effectiveEventQuota > 0
              ? Math.min(100, Math.round((totalRegistered / effectiveEventQuota) * 100))
              : 0;

            return (
              <div
                key={eventKey}
                className="p-5 rounded-2xl bg-surface-container-low/60 border border-white/10 hover:border-secondary/30 transition-all shadow-md flex flex-col justify-between gap-4"
              >
                <div>
                  {/* Header: Title, Key & Status Badge */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <h4 className="font-semibold text-sm text-white" title={eventName}>
                        {eventName}
                      </h4>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-secondary border border-white/10 uppercase">
                        {eventKey}
                      </span>
                    </div>

                    <div>
                      {isEventFull ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-error/20 text-error border border-error/30">
                          Event Penuh
                        </span>
                      ) : isPhaseFull ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Fase Habis
                        </span>
                      ) : q && !q.isPhaseDateActive ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-300 border border-slate-500/30">
                          {q.availabilityReason === "phase_date_not_started" ? "Belum Mulai" : "Berakhir"}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Tersedia
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 font-poppins">
                    {/* Fase & Harga Dasar / Coret */}
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-on-surface-variant uppercase tracking-wider block font-semibold">
                          Fase Aktif
                        </span>
                        <span className="text-xs font-bold text-white">{item.phase}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-on-surface-variant uppercase tracking-wider block font-semibold">
                          Biaya Dasar (Coret)
                        </span>
                        <span className="text-xs font-mono font-bold text-[#ffd700]">
                          {formatRupiah(item.price)}
                        </span>
                        <span className="text-[9px] text-slate-400 block font-sans">
                          Harga Normal / Anchor
                        </span>
                      </div>
                    </div>

                    {/* Jadwal Fase */}
                    <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5 px-1">
                      <Calendar className="w-3.5 h-3.5 text-secondary shrink-0" />
                      <span className="truncate">
                        {item.start_date || item.end_date
                          ? `${formatTableDate(item.start_date)} - ${formatTableDate(item.end_date)}`
                          : "Jadwal fase tidak dibatasi tanggal"}
                      </span>
                    </div>

                    {/* Tier 1: Total Kuota (Fase Pendaftaran) - Milestone Indikator */}
                    <div className="p-3 rounded-xl bg-surface-container-high/40 border border-white/5 space-y-1.5 text-xs">
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider block">
                            Total Kuota (Fase Pendaftaran)
                          </span>
                          <span className="text-[9.5px] text-secondary font-medium block">
                            Ambang Batas Kumulatif Fase (Milestone)
                          </span>
                        </div>
                        <span className="font-mono font-bold text-white">
                          {usedInPhase} / {isPhaseUnlimited ? <span className="text-secondary font-normal">Unlimited</span> : item.phase_quota}
                        </span>
                      </div>

                      {/* Phase Quota Progress Bar */}
                      {!isPhaseUnlimited && (
                        <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden my-1">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isPhaseFull
                                ? "bg-rose-500"
                                : phasePercent >= 80
                                ? "bg-amber-400"
                                : "bg-[#87CEEB]"
                            }`}
                            style={{ width: `${phasePercent}%` }}
                          />
                        </div>
                      )}

                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-on-surface-variant">Milestone Kuota Fase:</span>
                        <span className={`font-bold font-mono ${isPhaseFull ? "text-amber-300" : "text-emerald-400"}`}>
                          {isPhaseFull ? "Ambang Fase Tercapai" : remainingPhase !== null ? `${usedInPhase} / ${item.phase_quota} (${phasePercent}%)` : "Tanpa Batas"}
                        </span>
                      </div>
                    </div>

                    {/* Tier 2: Total Kuota (Total Slot Peserta) - Master Kapasitas Internal */}
                    <div className="p-3 rounded-xl bg-surface-container-high/40 border border-white/5 space-y-1.5 text-xs">
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider block">
                            Total Kuota (Total Slot Peserta)
                          </span>
                          <span className="text-[9.5px] text-emerald-400 font-medium block">
                            Kapasitas Master Panitia (Internal / Admin-Only)
                          </span>
                        </div>
                        <span className="font-mono font-bold text-white">
                          {totalRegistered} / {isEventUnlimited ? <span className="text-secondary font-normal">Unlimited</span> : effectiveEventQuota}
                        </span>
                      </div>

                      {/* Event Capacity Progress Bar */}
                      {!isEventUnlimited && (
                        <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden my-1">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isEventFull
                                ? "bg-rose-500"
                                : eventPercent >= 80
                                ? "bg-amber-400"
                                : "bg-emerald-400"
                            }`}
                            style={{ width: `${eventPercent}%` }}
                          />
                        </div>
                      )}

                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-on-surface-variant">Target Kapasitas Master:</span>
                        <span className={`font-bold font-mono ${isEventFull ? "text-error" : "text-slate-300"}`}>
                          {isEventFull ? "Kapasitas Penuh" : remainingEvent !== null ? `${remainingEvent} Slot Sisa (${eventPercent}%)` : "Tanpa Batas"}
                        </span>
                      </div>
                      <div className="text-[10px] text-right text-on-surface-variant font-mono">
                        ({q?.pendingCount || 0} Pending / {q?.approvedCount || 0} Approved)
                      </div>
                    </div>
                  </div>
                </div>

                {/* Edit Button */}
                <div className="pt-2 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => openSubEventModal(eventKey)}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-secondary/15 hover:bg-secondary/25 text-secondary border border-secondary/30 text-xs font-semibold transition-all cursor-pointer"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>Edit Kuota, Harga &amp; Fase</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Create Promo Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-[#0B1026] border border-white/20 rounded-2xl p-6 max-w-lg w-full shadow-2xl relative max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-white/10">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-tertiary" />
                Buat Promo / Bundling Baru
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-on-surface-variant hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreatePromo} className="flex flex-col gap-4 text-xs font-poppins">
              <div>
                <label className="block text-on-surface-variant font-semibold mb-1 uppercase tracking-wider">
                  Judul Promo *
                </label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. EARLY BIRD COSMIC PASS"
                  className="w-full bg-surface-container-high border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:border-secondary outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-on-surface-variant font-semibold mb-1 uppercase tracking-wider">
                  Deskripsi Penawaran
                </label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Jelaskan keuntungan bundle atau potongan harga..."
                  className="w-full bg-surface-container-high border border-white/15 rounded-xl px-3.5 py-2 text-sm text-white focus:border-secondary outline-none transition-all"
                />
              </div>

              {/* Target Event, Kategori Peserta, Maksimal Kuota & Kapasitas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-on-surface-variant font-semibold mb-1 uppercase tracking-wider">
                    Target Event *
                  </label>
                  <select
                    required
                    value={form.target_event}
                    onChange={(e) => setForm({ ...form, target_event: e.target.value as PromoTargetEvent })}
                    className="w-full bg-surface-container-high border border-white/15 rounded-xl px-3 py-2.5 text-xs text-white focus:border-secondary outline-none cursor-pointer"
                  >
                    {PROMO_TARGET_EVENTS.map((evt) => (
                      <option key={evt} value={evt} className="bg-[#0b1026]">
                        {evt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-on-surface-variant font-semibold mb-1 uppercase tracking-wider">
                    Kategori Peserta *
                  </label>
                  <select
                    value={form.kategori_peserta}
                    onChange={(e) => setForm({ ...form, kategori_peserta: e.target.value })}
                    className="w-full bg-surface-container-high border border-white/15 rounded-xl px-3 py-2.5 text-xs text-white focus:border-secondary outline-none cursor-pointer font-sans"
                  >
                    {["Semua", "Umum", "Mahasiswa ITS"].map((kat) => (
                      <option key={kat} value={kat} className="bg-[#0b1026]">
                        {kat}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Maksimal Kuota with Unlimited Toggle */}
                <div className="sm:col-span-2 p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-white font-semibold uppercase tracking-wider text-[11px]">
                        Maksimal Kuota (max_quota) *
                      </label>
                      <p className="text-[11px] text-on-surface-variant font-sans">
                        Atur batas total pembelian atau buat tanpa batas kuota.
                      </p>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer bg-surface-container-high px-3 py-1.5 rounded-lg border border-white/10 hover:border-secondary/40 transition-all">
                      <input
                        type="checkbox"
                        checked={form.is_unlimited}
                        onChange={(e) => setForm({ ...form, is_unlimited: e.target.checked })}
                        className="rounded border-white/20 bg-surface-container-highest text-secondary focus:ring-secondary w-4 h-4 cursor-pointer"
                      />
                      <span className="text-xs font-semibold text-white select-none">
                        Unlimited Kuota
                      </span>
                    </label>
                  </div>

                  {form.is_unlimited ? (
                    <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs flex items-center gap-2">
                      <Sparkles className="w-4 h-4 shrink-0 text-cyan-400" />
                      <span>
                        <strong>Tanpa Batas Kuota:</strong> Nilai <code className="font-mono">max_quota</code> diset <code className="font-mono">NULL</code>. Promo ini akan selalu tersedia untuk pembeli selama periode aktif.
                      </span>
                    </div>
                  ) : (
                    <input
                      type="number"
                      required
                      min="1"
                      value={form.kuota_maksimal}
                      onChange={(e) => setForm({ ...form, kuota_maksimal: e.target.value })}
                      placeholder="e.g. 50 (kuota tiket/bundle)"
                      className="w-full bg-surface-container-high border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:border-secondary outline-none transition-all font-mono"
                    />
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-on-surface-variant font-semibold mb-1 uppercase tracking-wider">
                    Kapasitas *
                  </label>
                  <select
                    value={form.kapasitas}
                    onChange={(e) => setForm({ ...form, kapasitas: e.target.value })}
                    className="w-full bg-surface-container-high border border-white/15 rounded-xl px-3 py-2.5 text-xs text-white focus:border-secondary outline-none cursor-pointer font-mono"
                  >
                    {[1, 2, 3, 4, 5].map((num) => (
                      <option key={num} value={num} className="bg-[#0b1026]">
                        {num} Orang
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-on-surface-variant font-semibold mb-1 uppercase tracking-wider">
                    Tipe Diskon
                  </label>
                  <select
                    value={form.discount_type}
                    onChange={(e) => setForm({ ...form, discount_type: e.target.value as DiscountType })}
                    className="w-full bg-surface-container-high border border-white/15 rounded-xl px-3 py-2.5 text-xs text-white focus:border-secondary outline-none cursor-pointer"
                  >
                    <option value="percent" className="bg-[#0b1026]">Persentase (%)</option>
                    <option value="nominal" className="bg-[#0b1026]">Nominal Potongan (Rp)</option>
                    <option value="bundling" className="bg-[#0b1026]">Harga Paket Bundling (Rp)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-on-surface-variant font-semibold mb-1 uppercase tracking-wider">
                    Nilai Diskon / Harga Paket *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="any"
                    value={form.discount_value}
                    onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
                    placeholder={form.discount_type === "percent" ? "e.g. 20 (untuk 20%)" : "e.g. 120000"}
                    className="w-full bg-surface-container-high border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:border-secondary outline-none transition-all font-mono"
                  />
                </div>
              </div>

              {/* Tanggal Mulai & Tanggal Berakhir (datetime picker in WIB) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 rounded-xl bg-black/30 border border-white/10">
                <div>
                  <label className="block text-slate-200 font-semibold mb-1 uppercase tracking-wider text-[11px] flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-secondary" />
                      Tanggal Mulai *
                    </span>
                    <span className="text-[10px] text-secondary font-mono font-bold">WIB</span>
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    className="w-full bg-surface-container-high border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:border-secondary outline-none transition-all font-mono"
                  />
                  {form.start_date && (
                    <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                      {formatTableDate(form.start_date)}
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-slate-200 font-semibold mb-1 uppercase tracking-wider text-[11px] flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-secondary" />
                      Tanggal Berakhir *
                    </span>
                    <span className="text-[10px] text-secondary font-mono font-bold">WIB</span>
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    className="w-full bg-surface-container-high border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:border-secondary outline-none transition-all font-mono"
                  />
                  {form.end_date && (
                    <span className="text-[10px] text-secondary font-mono mt-1 block font-medium">
                      {formatTableDate(form.end_date)}
                    </span>
                  )}
                </div>
              </div>

              {/* Syarat & Ketentuan Khusus Pendaftar (Opsional) */}
              <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-semibold text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#ffd700]" />
                      Syarat &amp; Ketentuan Khusus Pendaftar (Opsional)
                    </label>
                    <p className="text-[11px] text-on-surface-variant font-sans mt-0.5">
                      Poin klausul persyaratan yang wajib disetujui pendaftar saat memilih paket promo ini di formulir pendaftaran.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({
                        ...prev,
                        special_terms: [...(prev.special_terms || []), ""],
                      }));
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/15 hover:bg-secondary/25 text-secondary border border-secondary/30 text-xs font-semibold transition-all cursor-pointer shadow-sm hover:scale-[1.02]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Syarat Khusus</span>
                  </button>
                </div>

                {(form.special_terms || []).length === 0 ? (
                  <div className="p-3.5 rounded-xl bg-white/5 border border-dashed border-white/10 text-center text-xs text-slate-400 font-sans">
                    Belum ada syarat khusus ditambahkan. Paket promo ini dapat langsung dipilih pendaftar tanpa checklist klausul syarat tambahan.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {form.special_terms.map((term, idx) => (
                      <div key={idx} className="flex items-center gap-2 animate-in fade-in duration-200">
                        <span className="w-6 h-6 rounded-full bg-secondary/20 text-secondary border border-secondary/30 flex items-center justify-center text-xs font-bold font-mono shrink-0">
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          value={term}
                          onChange={(e) => {
                            const updated = [...form.special_terms];
                            updated[idx] = e.target.value;
                            setForm({ ...form, special_terms: updated });
                          }}
                          placeholder="Contoh: Wajib upload bukti share ke 3 grup WhatsApp / Follow IG @voitsfest"
                          className="flex-1 bg-surface-container-high border border-white/15 rounded-xl px-3.5 py-2 text-xs text-white focus:border-secondary outline-none transition-all font-sans"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const updated = form.special_terms.filter((_, i) => i !== idx);
                            setForm({ ...form, special_terms: updated });
                          }}
                          title="Hapus syarat ini"
                          className="p-2 rounded-lg text-slate-400 hover:text-error hover:bg-white/5 transition-colors cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Wajibkan Upload Bukti Persyaratan (Foto / PDF) */}
                <div className="pt-3 border-t border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <label className="text-xs font-semibold text-white flex items-center gap-2 cursor-pointer">
                        <Upload className="w-3.5 h-3.5 text-secondary" />
                        Wajibkan Upload Bukti Persyaratan (Foto / PDF)
                      </label>
                      <p className="text-[11px] text-on-surface-variant font-sans">
                        Pendaftar wajib melampirkan berkas bukti (screenshot / PDF) sebelum dapat lanjut ke pembayaran.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.requires_proof_file}
                        onChange={(e) => setForm({ ...form, requires_proof_file: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-surface-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-secondary"></div>
                    </label>
                  </div>

                  {form.requires_proof_file && (
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1.5 animate-in fade-in duration-200">
                      <label className="text-[11px] font-medium text-slate-300 flex items-center gap-1.5">
                        <FileCheck className="w-3.5 h-3.5 text-secondary" />
                        Instruksi Format Bukti (Opsional)
                      </label>
                      <input
                        type="text"
                        value={form.proof_instruction}
                        onChange={(e) => setForm({ ...form, proof_instruction: e.target.value })}
                        placeholder="Contoh: Gabungkan screenshot follow IG & share 3 grup WA ke dalam 1 file PDF atau foto kolase"
                        className="w-full bg-surface-container-high border border-white/15 rounded-xl px-3.5 py-2 text-xs text-white focus:border-secondary outline-none transition-all font-sans"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="promo_is_active"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="rounded border-white/20 bg-surface-container-high text-secondary focus:ring-secondary w-4 h-4 cursor-pointer"
                />
                <label htmlFor="promo_is_active" className="text-xs text-white cursor-pointer font-medium">
                  Langsung aktifkan promo ini di User Dashboard
                </label>
              </div>

              {/* Action buttons */}
              <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-on-surface text-xs font-semibold transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-tertiary text-primary-container font-bold text-xs uppercase tracking-wider hover:bg-tertiary-fixed transition-all cursor-pointer shadow-lg disabled:opacity-50 flex items-center gap-2"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{submitting ? "Menyimpan..." : "Simpan Promo"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── EDIT BUNDLE / PROMO MODAL ── */}
      {editModalOpen && editingPromo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-[#0B1026] border border-white/20 rounded-2xl p-6 max-w-xl w-full shadow-2xl relative max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-white/10">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Edit className="w-5 h-5 text-secondary" />
                  Edit Katalog Promo &amp; Bundling
                </h3>
                <p className="text-[11px] text-on-surface-variant font-sans mt-0.5">
                  ID: <span className="font-mono text-secondary">{editingPromo.id}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="text-on-surface-variant hover:text-white transition-colors cursor-pointer p-1 rounded-lg hover:bg-white/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Visual Indicator: Current Usage Progress & Quota Math */}
            {(() => {
              const promoStatus = promoQuotas.find((pq) => pq.promo.id === editingPromo.id);
              const currentUsed = promoStatus ? promoStatus.usedQuota : (editingPromo.kuota_terpakai ?? 0);
              const currentPending = promoStatus ? promoStatus.pendingCount : 0;
              const currentApproved = promoStatus ? promoStatus.approvedCount : currentUsed;
              const isCurrentUnlimited = editingPromo.kuota_maksimal == null;
              const originalMax = isCurrentUnlimited ? null : editingPromo.kuota_maksimal;

              // Live quota math based on admin input
              const isNewUnlimited = editForm.is_unlimited;
              const newMax = isNewUnlimited ? null : (parseInt(editForm.kuota_maksimal, 10) || 0);
              const newRemaining = isNewUnlimited ? null : Math.max(0, (newMax ?? 0) - currentUsed);
              const newUsagePercent = newMax && newMax > 0 ? Math.min(100, Math.round((currentUsed / newMax) * 100)) : 0;
              const isOverQuota = !isNewUnlimited && newMax !== null && newMax < currentUsed;

              return (
                <div className="mb-5 p-4 rounded-xl bg-surface-container-high/60 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-secondary" />
                      Progres Penggunaan Kuota (Live Counter)
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      Terpakai: {currentUsed} Peserta
                    </span>
                  </div>

                  {/* Usage progress text */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1 text-slate-300">
                    <span>
                      Kuota Terpakai Saat Ini:{" "}
                      <strong className="text-white font-mono">{currentUsed}</strong> /{" "}
                      <strong className="text-secondary font-mono">
                        {isNewUnlimited ? "Tanpa Batas (Unlimited)" : `${newMax} Slot`}
                      </strong>
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      ({currentPending} Pending, {currentApproved} Disetujui)
                    </span>
                  </div>

                  {/* Progress Bar (if not unlimited) */}
                  {!isNewUnlimited && newMax !== null && newMax > 0 && (
                    <div className="space-y-1">
                      <div className="w-full bg-black/40 rounded-full h-2 overflow-hidden border border-white/10">
                        <div
                          className={`h-full transition-all duration-300 rounded-full ${
                            isOverQuota ? "bg-error" : newUsagePercent >= 90 ? "bg-amber-400" : "bg-secondary"
                          }`}
                          style={{ width: `${Math.min(100, newUsagePercent)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] font-mono text-slate-400">
                        <span>Progres Terpakai: {newUsagePercent}%</span>
                        <span className={newRemaining === 0 ? "text-error font-bold" : "text-emerald-400 font-bold"}>
                          Sisa Kuota: {newRemaining} Slot
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Over Quota Alert if admin sets max_quota < kuota_terpakai */}
                  {isOverQuota && (
                    <div className="p-2.5 rounded-lg bg-error/15 border border-error/30 text-error text-[11px] flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>
                        <strong>Perhatian:</strong> Kuota maksimal baru ({newMax}) lebih kecil dari kuota yang telah terpakai ({currentUsed}). Promo ini akan otomatis berstatus Habis (Sold Out) pada formulir pendaftaran.
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Form */}
            <form onSubmit={handleSaveEdit} className="flex flex-col gap-4 text-xs font-poppins">
              {/* Judul Promo / Nama Paket */}
              <div>
                <label className="block text-on-surface-variant font-semibold mb-1 uppercase tracking-wider">
                  Judul Promo / Nama Paket *
                </label>
                <input
                  type="text"
                  required
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  placeholder="e.g. Early Bird Single, Bundle Couple 2 Org, Komunitas 5K"
                  className="w-full bg-surface-container-high border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:border-secondary outline-none transition-all"
                />
              </div>

              {/* Deskripsi Penawaran */}
              <div>
                <label className="block text-on-surface-variant font-semibold mb-1 uppercase tracking-wider">
                  Deskripsi Penawaran
                </label>
                <textarea
                  rows={2}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  placeholder="Jelaskan penawaran atau keuntungan khusus promo ini..."
                  className="w-full bg-surface-container-high border border-white/15 rounded-xl px-3.5 py-2 text-sm text-white focus:border-secondary outline-none transition-all"
                />
              </div>

              {/* Target Event & Kategori Peserta (Target Kategori) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-on-surface-variant font-semibold mb-1 uppercase tracking-wider">
                    Target Event *
                  </label>
                  <select
                    required
                    value={editForm.target_event}
                    onChange={(e) => setEditForm({ ...editForm, target_event: e.target.value as PromoTargetEvent })}
                    className="w-full bg-surface-container-high border border-white/15 rounded-xl px-3 py-2.5 text-xs text-white focus:border-secondary outline-none cursor-pointer"
                  >
                    {PROMO_TARGET_EVENTS.map((evt) => (
                      <option key={evt} value={evt} className="bg-[#0b1026]">
                        {evt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-on-surface-variant font-semibold mb-1 uppercase tracking-wider">
                    Kategori Peserta (Target) *
                  </label>
                  <select
                    required
                    value={editForm.kategori_peserta}
                    onChange={(e) => setEditForm({ ...editForm, kategori_peserta: e.target.value })}
                    className="w-full bg-surface-container-high border border-white/15 rounded-xl px-3 py-2.5 text-xs text-white focus:border-secondary outline-none cursor-pointer font-sans"
                  >
                    <option value="Semua" className="bg-[#0b1026]">Semua Kategori (Umum &amp; Mahasiswa ITS)</option>
                    <option value="Umum" className="bg-[#0b1026]">Khusus Peserta Umum</option>
                    <option value="Mahasiswa ITS" className="bg-[#0b1026]">Khusus Mahasiswa ITS</option>
                  </select>
                </div>
              </div>

              {/* Tipe Pendaftar / Kapasitas Slot Peserta */}
              <div>
                <label className="block text-on-surface-variant font-semibold mb-1 uppercase tracking-wider">
                  Tipe Pendaftar / Kapasitas Slot *
                </label>
                <select
                  required
                  value={editForm.kapasitas}
                  onChange={(e) => setEditForm({ ...editForm, kapasitas: e.target.value })}
                  className="w-full bg-surface-container-high border border-white/15 rounded-xl px-3 py-2.5 text-xs text-white focus:border-secondary outline-none cursor-pointer font-mono"
                >
                  <option value="1" className="bg-[#0b1026]">1 Orang (Single / Individu)</option>
                  <option value="2" className="bg-[#0b1026]">2 Orang (Couple / Duo Bundle)</option>
                  <option value="3" className="bg-[#0b1026]">3 Orang (Trio Bundle)</option>
                  <option value="4" className="bg-[#0b1026]">4 Orang (Quad Bundle)</option>
                  <option value="5" className="bg-[#0b1026]">5 Orang (Group / Rombongan 5 Org)</option>
                </select>
              </div>

              {/* Maksimal Kuota Section with Unlimited Toggle */}
              <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-semibold text-white uppercase tracking-wider text-[11px] block">
                      Maksimal Kuota Kapasitas (max_quota) *
                    </label>
                    <p className="text-[11px] text-on-surface-variant font-sans">
                      Atur kuota kapasitas paket atau buat tanpa batas kuota. Admin bebas menaikkan atau menurunkan kuota.
                    </p>
                  </div>

                  {/* Unlimited Toggle */}
                  <label className="flex items-center gap-2 cursor-pointer bg-surface-container-high px-3 py-1.5 rounded-lg border border-white/10 hover:border-secondary/40 transition-all">
                    <input
                      type="checkbox"
                      checked={editForm.is_unlimited}
                      onChange={(e) => setEditForm({ ...editForm, is_unlimited: e.target.checked })}
                      className="rounded border-white/20 bg-surface-container-highest text-secondary focus:ring-secondary w-4 h-4 cursor-pointer"
                    />
                    <span className="text-xs font-semibold text-white select-none">
                      Unlimited Kuota
                    </span>
                  </label>
                </div>

                {editForm.is_unlimited ? (
                  <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs flex items-center gap-2">
                    <Sparkles className="w-4 h-4 shrink-0 text-cyan-400" />
                    <span>
                      <strong>Tanpa Batas Kuota:</strong> Nilai <code className="font-mono">kuota_maksimal</code> diset <code className="font-mono">NULL</code>. Promo ini akan selalu tersedia selama periode aktif.
                    </span>
                  </div>
                ) : (
                  <div>
                    <input
                      type="number"
                      required
                      min="1"
                      value={editForm.kuota_maksimal}
                      onChange={(e) => setEditForm({ ...editForm, kuota_maksimal: e.target.value })}
                      placeholder="Masukkan batas kuota, e.g. 50, 100, 250"
                      className="w-full bg-surface-container-high border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:border-secondary outline-none transition-all font-mono"
                    />
                  </div>
                )}
              </div>

              {/* Tipe Diskon & Nilai Diskon / Harga Bundle */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-on-surface-variant font-semibold mb-1 uppercase tracking-wider">
                    Tipe Diskon *
                  </label>
                  <select
                    value={editForm.discount_type}
                    onChange={(e) => setEditForm({ ...editForm, discount_type: e.target.value as DiscountType })}
                    className="w-full bg-surface-container-high border border-white/15 rounded-xl px-3 py-2.5 text-xs text-white focus:border-secondary outline-none cursor-pointer"
                  >
                    <option value="percent" className="bg-[#0b1026]">Persentase Diskon (%)</option>
                    <option value="nominal" className="bg-[#0b1026]">Potongan Tetap / Nominal Diskon (Rp)</option>
                    <option value="bundling" className="bg-[#0b1026]">Fixed Bundle Price / Harga Paket Bundling (Rp)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-on-surface-variant font-semibold mb-1 uppercase tracking-wider">
                    {editForm.discount_type === "bundling"
                      ? "Harga Paket Bundling (Rp) *"
                      : editForm.discount_type === "percent"
                      ? "Persentase Diskon (%) *"
                      : "Nilai Potongan Diskon (Rp) *"}
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="any"
                    value={editForm.discount_value}
                    onChange={(e) => setEditForm({ ...editForm, discount_value: e.target.value })}
                    placeholder={
                      editForm.discount_type === "percent"
                        ? "e.g. 20 (untuk 20%)"
                        : editForm.discount_type === "bundling"
                        ? "e.g. 150000 (Harga total bundle)"
                        : "e.g. 25000 (Potongan nominal)"
                    }
                    className="w-full bg-surface-container-high border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:border-secondary outline-none transition-all font-mono"
                  />
                </div>
              </div>

              {/* Tanggal Mulai & Tanggal Berakhir (datetime picker in WIB) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 rounded-xl bg-black/30 border border-white/10">
                <div>
                  <label className="block text-slate-200 font-semibold mb-1 uppercase tracking-wider text-[11px] flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-secondary" />
                      Tanggal Mulai *
                    </span>
                    <span className="text-[10px] text-secondary font-mono font-bold">WIB</span>
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={editForm.start_date}
                    onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
                    className="w-full bg-surface-container-high border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:border-secondary outline-none transition-all font-mono"
                  />
                  {editForm.start_date && (
                    <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                      {formatTableDate(editForm.start_date)}
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-slate-200 font-semibold mb-1 uppercase tracking-wider text-[11px] flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-secondary" />
                      Tanggal Berakhir *
                    </span>
                    <span className="text-[10px] text-secondary font-mono font-bold">WIB</span>
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={editForm.end_date}
                    onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })}
                    className="w-full bg-surface-container-high border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:border-secondary outline-none transition-all font-mono"
                  />
                  {editForm.end_date && (
                    <span className="text-[10px] text-secondary font-mono mt-1 block font-medium">
                      {formatTableDate(editForm.end_date)}
                    </span>
                  )}
                </div>
              </div>

              {/* Syarat & Ketentuan Khusus Pendaftar (Opsional) */}
              <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-semibold text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#ffd700]" />
                      Syarat &amp; Ketentuan Khusus Pendaftar (Opsional)
                    </label>
                    <p className="text-[11px] text-on-surface-variant font-sans mt-0.5">
                      Poin klausul persyaratan yang wajib disetujui pendaftar saat memilih paket promo ini di formulir pendaftaran.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditForm((prev) => ({
                        ...prev,
                        special_terms: [...(prev.special_terms || []), ""],
                      }));
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/15 hover:bg-secondary/25 text-secondary border border-secondary/30 text-xs font-semibold transition-all cursor-pointer shadow-sm hover:scale-[1.02]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Syarat Khusus</span>
                  </button>
                </div>

                {(editForm.special_terms || []).length === 0 ? (
                  <div className="p-3.5 rounded-xl bg-white/5 border border-dashed border-white/10 text-center text-xs text-slate-400 font-sans">
                    Belum ada syarat khusus ditambahkan. Paket promo ini dapat langsung dipilih pendaftar tanpa checklist klausul syarat tambahan.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {editForm.special_terms.map((term, idx) => (
                      <div key={idx} className="flex items-center gap-2 animate-in fade-in duration-200">
                        <span className="w-6 h-6 rounded-full bg-secondary/20 text-secondary border border-secondary/30 flex items-center justify-center text-xs font-bold font-mono shrink-0">
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          value={term}
                          onChange={(e) => {
                            const updated = [...editForm.special_terms];
                            updated[idx] = e.target.value;
                            setEditForm({ ...editForm, special_terms: updated });
                          }}
                          placeholder="Contoh: Wajib upload bukti share ke 3 grup WhatsApp / Follow IG @voitsfest"
                          className="flex-1 bg-surface-container-high border border-white/15 rounded-xl px-3.5 py-2 text-xs text-white focus:border-secondary outline-none transition-all font-sans"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const updated = editForm.special_terms.filter((_, i) => i !== idx);
                            setEditForm({ ...editForm, special_terms: updated });
                          }}
                          title="Hapus syarat ini"
                          className="p-2 rounded-lg text-slate-400 hover:text-error hover:bg-white/5 transition-colors cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Wajibkan Upload Bukti Persyaratan (Foto / PDF) */}
                <div className="pt-3 border-t border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <label className="text-xs font-semibold text-white flex items-center gap-2 cursor-pointer">
                        <Upload className="w-3.5 h-3.5 text-secondary" />
                        Wajibkan Upload Bukti Persyaratan (Foto / PDF)
                      </label>
                      <p className="text-[11px] text-on-surface-variant font-sans">
                        Pendaftar wajib melampirkan berkas bukti (screenshot / PDF) sebelum dapat lanjut ke pembayaran.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editForm.requires_proof_file}
                        onChange={(e) => setEditForm({ ...editForm, requires_proof_file: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-surface-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-secondary"></div>
                    </label>
                  </div>

                  {editForm.requires_proof_file && (
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1.5 animate-in fade-in duration-200">
                      <label className="text-[11px] font-medium text-slate-300 flex items-center gap-1.5">
                        <FileCheck className="w-3.5 h-3.5 text-secondary" />
                        Instruksi Format Bukti (Opsional)
                      </label>
                      <input
                        type="text"
                        value={editForm.proof_instruction}
                        onChange={(e) => setEditForm({ ...editForm, proof_instruction: e.target.value })}
                        placeholder="Contoh: Gabungkan screenshot follow IG & share 3 grup WA ke dalam 1 file PDF atau foto kolase"
                        className="w-full bg-surface-container-high border border-white/15 rounded-xl px-3.5 py-2 text-xs text-white focus:border-secondary outline-none transition-all font-sans"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Status Aktif */}
              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="edit_promo_is_active"
                  checked={editForm.is_active}
                  onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                  className="rounded border-white/20 bg-surface-container-high text-secondary focus:ring-secondary w-4 h-4 cursor-pointer"
                />
                <label htmlFor="edit_promo_is_active" className="text-xs text-white cursor-pointer font-medium select-none">
                  Aktifkan promo ini di Formulir Pendaftaran &amp; User Dashboard
                </label>
              </div>

              {/* Action buttons */}
              <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-on-surface text-xs font-semibold transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2.5 rounded-xl bg-secondary text-primary-container font-bold text-xs uppercase tracking-wider hover:bg-secondary-fixed transition-all cursor-pointer shadow-lg disabled:opacity-50 flex items-center gap-2"
                >
                  {savingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{savingEdit ? "Menyimpan..." : "Simpan Perubahan"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Sub-Event Quota, Pricing & Phase Edit Modal ── */}
      {subEventModalOpen && editingEventKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-[#0B1026] border border-white/20 rounded-2xl p-6 max-w-xl w-full shadow-2xl relative max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-white/10">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Banknote className="w-5 h-5 text-[#ffd700]" />
                  Edit Kuota, Harga &amp; Fase Pendaftaran
                </h3>
                <p className="text-xs text-secondary font-medium mt-0.5">
                  {PRICING_EVENT_NAMES[editingEventKey]} ({editingEventKey.toUpperCase()})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSubEventModalOpen(false)}
                className="text-on-surface-variant hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSubEventPricing} className="flex flex-col gap-4 text-xs font-poppins">
              {/* 1. Nama Fase Aktif */}
              <div>
                <label className="block text-on-surface-variant font-semibold mb-1 uppercase tracking-wider">
                  Nama Fase Aktif *
                </label>
                <input
                  type="text"
                  required
                  value={subEventForm.phase}
                  onChange={(e) => setSubEventForm({ ...subEventForm, phase: e.target.value })}
                  placeholder="e.g. Early Bird, Presale 1, Normal Price"
                  className="w-full bg-surface-container-high border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:border-secondary outline-none transition-all"
                />
              </div>

              {/* 2. Total Biaya Pendaftaran (Harga Dasar / Coret) */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-on-surface-variant font-semibold uppercase tracking-wider">
                    Total Biaya Pendaftaran (Harga Dasar / Coret) (Rp) *
                  </label>
                  <span className="text-xs font-mono font-bold text-[#ffd700]">
                    {formatRupiah(subEventForm.price)}
                  </span>
                </div>
                <p className="text-[11px] text-on-surface-variant mb-1.5 font-sans">
                  Harga dasar normal (non-diskon). Digunakan secara eksklusif untuk harga pembanding/coret (anchor pricing) di formulir pendaftaran untuk menonjolkan diskon paket promo.
                </p>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  required
                  value={subEventForm.price}
                  onChange={(e) => setSubEventForm({ ...subEventForm, price: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                  className="w-full bg-surface-container-high border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:border-secondary outline-none transition-all font-mono"
                />
              </div>

              {/* 3. Tanggal Mulai & Berakhir Fase (using timeUtils.ts) */}
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10 space-y-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-secondary" />
                  <span className="font-semibold text-white text-xs uppercase tracking-wider">
                    Jadwal Fase Pendaftaran (WIB)
                  </span>
                </div>
                <p className="text-[11px] text-on-surface-variant">
                  Format waktu Waktu Indonesia Barat (WIB). Kosongkan tanggal jika fase pendaftaran berlaku terus tanpa batas waktu.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-on-surface-variant text-[11px] font-medium mb-1">
                      Tanggal Mulai Fase
                    </label>
                    <input
                      type="datetime-local"
                      value={subEventForm.start_date}
                      onChange={(e) => setSubEventForm({ ...subEventForm, start_date: e.target.value })}
                      className="w-full bg-surface-container-high border border-white/15 rounded-lg px-3 py-2 text-xs text-white focus:border-secondary outline-none transition-all font-mono"
                    />
                    <span className="text-[10px] text-slate-400 block mt-1">
                      Preview: {subEventForm.start_date ? formatTableDate(subEventForm.start_date) : "Tidak dibatasi"}
                    </span>
                  </div>

                  <div>
                    <label className="block text-on-surface-variant text-[11px] font-medium mb-1">
                      Tanggal Berakhir Fase
                    </label>
                    <input
                      type="datetime-local"
                      value={subEventForm.end_date}
                      onChange={(e) => setSubEventForm({ ...subEventForm, end_date: e.target.value })}
                      className="w-full bg-surface-container-high border border-white/15 rounded-lg px-3 py-2 text-xs text-white focus:border-secondary outline-none transition-all font-mono"
                    />
                    <span className="text-[10px] text-slate-400 block mt-1">
                      Preview: {subEventForm.end_date ? formatTableDate(subEventForm.end_date) : "Tidak dibatasi"}
                    </span>
                  </div>
                </div>
              </div>

              {/* 4. Kuota Fase Pendaftaran (phase_quota) - Milestone Indikator */}
              <div className="p-3.5 rounded-xl bg-surface-container-high/40 border border-white/10 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-on-surface-variant font-semibold uppercase tracking-wider block">
                      Total Kuota (Fase Pendaftaran)
                    </label>
                    <span className="text-[10px] text-secondary font-medium block">
                      Ambang Batas Kumulatif Fase (Milestone Indikator)
                    </span>
                  </div>
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={subEventForm.is_phase_unlimited}
                      onChange={(e) => setSubEventForm({ ...subEventForm, is_phase_unlimited: e.target.checked })}
                      className="w-4 h-4 rounded border-white/20 bg-surface-container-highest text-secondary focus:ring-secondary/50 accent-secondary cursor-pointer"
                    />
                    <span className="text-xs text-secondary font-medium">Unlimited Kuota Fase</span>
                  </label>
                </div>
                <p className="text-[11px] text-on-surface-variant font-sans">
                  Merepresentasikan ambang batas kuota kumulatif hingga fase pendaftaran aktif (contoh: plafon gabungan Pre-Sale 1 + Pre-Sale 2). Digunakan sebagai konteks progres informasional peserta (milestone indicator) dan bukan pembatas pilihan radio. Terdaftar kumulatif saat ini:{" "}
                  <span className="text-white font-bold font-mono">
                    {subEventQuotas?.[editingEventKey]?.usedInPhase ?? 0}
                  </span>{" "}
                  peserta.
                </p>

                <input
                  type="number"
                  min="1"
                  disabled={subEventForm.is_phase_unlimited}
                  value={subEventForm.is_phase_unlimited ? "" : subEventForm.phase_quota}
                  onChange={(e) => setSubEventForm({ ...subEventForm, phase_quota: e.target.value })}
                  placeholder={subEventForm.is_phase_unlimited ? "Tanpa batas (Unlimited - NULL di DB)" : "Masukkan kuota kumulatif fase..."}
                  className="w-full bg-surface-container-high border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:border-secondary outline-none transition-all font-mono disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>

              {/* 5. Total Kuota (Slot Peserta Sub-Event / event_quota) - Master Panitia */}
              <div className="p-3.5 rounded-xl bg-surface-container-high/40 border border-white/10 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-on-surface-variant font-semibold uppercase tracking-wider block">
                      Total Kuota (Total Slot Peserta)
                    </label>
                    <span className="text-[10px] text-emerald-400 font-medium block">
                      Kapasitas Master Panitia (Internal / Admin-Only)
                    </span>
                  </div>
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={subEventForm.is_event_unlimited}
                      onChange={(e) => setSubEventForm({ ...subEventForm, is_event_unlimited: e.target.checked })}
                      className="w-4 h-4 rounded border-white/20 bg-surface-container-highest text-secondary focus:ring-secondary/50 accent-secondary cursor-pointer"
                    />
                    <span className="text-xs text-secondary font-medium">Unlimited</span>
                  </label>
                </div>
                <p className="text-[11px] text-on-surface-variant font-sans">
                  Target kapasitas master keseluruhan dari panitia. Dijaga strictly untuk referensi internal/admin (tidak pernah diekspos ke peserta umum di formulir pendaftaran). Total terdaftar riil saat ini:{" "}
                  <span className="text-white font-bold font-mono">
                    {subEventQuotas?.[editingEventKey]?.totalEventRegistered ?? 0}
                  </span>{" "}
                  peserta ({subEventQuotas?.[editingEventKey]?.pendingCount ?? 0} Pending / {subEventQuotas?.[editingEventKey]?.approvedCount ?? 0} Approved).
                </p>

                <input
                  type="number"
                  min="1"
                  disabled={subEventForm.is_event_unlimited}
                  value={subEventForm.is_event_unlimited ? "" : subEventForm.event_quota}
                  onChange={(e) => setSubEventForm({ ...subEventForm, event_quota: e.target.value })}
                  placeholder={subEventForm.is_event_unlimited ? "Tanpa batas (Unlimited - NULL di DB)" : "Masukkan target master kapasitas..."}
                  className="w-full bg-surface-container-high border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:border-secondary outline-none transition-all font-mono disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setSubEventModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-on-surface-variant hover:text-white transition-all font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingSubEventPricing}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-secondary text-primary-container font-bold text-xs uppercase tracking-wider hover:bg-secondary-fixed transition-all cursor-pointer shadow-lg disabled:opacity-50"
                >
                  {savingSubEventPricing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Simpan Konfigurasi</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
