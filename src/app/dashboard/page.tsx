import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TicketSlider from "@/components/dashboard/TicketSlider";
import PromoSlider from "@/components/dashboard/PromoSlider";
import OrderHistoryTable from "@/components/dashboard/OrderHistoryTable";
import DashboardHeader from "./components/DashboardHeader";
import { Ticket, Promo } from "@/types/database";
import Link from "next/link";
import Image from "next/image";
import WhatsAppDashboardBanner from "@/components/dashboard/WhatsAppDashboardBanner";

export default async function DashboardPage() {
  const supabase = await createClient();

  // Get user session
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch user profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // Authoritative full_name from database profiles table (Server Component)
  const resolvedFullName = profile?.full_name?.trim() || "";
  const firstName = resolvedFullName ? resolvedFullName.split(" ")[0] : (user.email ? user.email.split("@")[0] : "User");

  // Fetch user's ColorFun registrations
  const { data: cfrData } = await supabase
    .from("colorfun_registrations")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // Map ColorFun tickets (all statuses: pending, verified, rejected)
  const cfrTickets: Ticket[] = (cfrData || []).map((reg: any) => ({
    id: reg.id,
    token: reg.ticket_qr_code || "",
    transaction_id: reg.id,
    user_id: reg.user_id || user.id,
    event_type: "CFR" as const,
    payment_status: (reg.payment_status || "pending").toLowerCase(),
    amount_paid: Number(reg.amount_paid || 0),
    ticket_phase: reg.ticket_phase || null,
    nomor_bib: reg.nomor_bib ?? reg.bib_number ?? null,
    group_id: reg.group_id ?? null,
    is_primary: reg.is_primary ?? null,
    scan_count: reg.scan_count || 0,
    scanned_by: null,
    scanned_at: reg.last_scanned_at || null,
    created_at: reg.created_at,
    nama_lengkap: reg.nama_lengkap || null,
    email: reg.email || null,
    whatsapp: reg.whatsapp || null,
    promo_id: reg.promo_id || null,
  }));

  // Fetch user's Festival registrations
  const { data: festivalRegsData } = await supabase
    .from("festival_registrations")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // Map Festival tickets (all statuses: pending, verified, rejected)
  const festivalTicketsList: Ticket[] = (festivalRegsData || []).map((reg: any) => ({
    id: reg.id,
    token: reg.ticket_qr_code || "",
    transaction_id: reg.id,
    user_id: reg.user_id || user.id,
    event_type: "FESTIVAL" as const,
    payment_status: (reg.payment_status || "pending").toLowerCase(),
    amount_paid: Number(reg.amount_paid || 0),
    ticket_phase: reg.ticket_phase || null,
    nomor_bib: reg.nomor_bib ?? reg.bib_number ?? null,
    group_id: reg.group_id ?? null,
    is_primary: reg.is_primary ?? null,
    scan_count: reg.scan_count || 0,
    scanned_by: null,
    scanned_at: reg.last_scanned_at || null,
    created_at: reg.created_at,
    nama_lengkap: reg.nama_lengkap || null,
    email: reg.email || null,
    whatsapp: reg.whatsapp || null,
    promo_id: reg.promo_id || null,
  }));

  // Fetch user's legacy tickets if any
  const { data: ticketsData } = await supabase
    .from("tickets")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const legacyTickets: Ticket[] = ((ticketsData as Ticket[]) || []).map((t: any) => ({
    ...t,
    payment_status: (t.payment_status || (t.token ? "verified" : "pending")).toLowerCase(),
    amount_paid: Number(t.amount_paid || 0),
    ticket_phase: t.ticket_phase || null,
    nama_lengkap: t.nama_lengkap || profile?.full_name || null,
    email: t.email || user.email || null,
    promo_id: t.promo_id || null,
  }));

  // Deduplicate tickets by id
  const ticketMap = new Map<string, Ticket>();
  [...cfrTickets, ...festivalTicketsList, ...legacyTickets].forEach((t) => {
    if (!ticketMap.has(t.id)) {
      ticketMap.set(t.id, t);
    }
  });
  const tickets = Array.from(ticketMap.values());

  // Fetch active promos directly from public.promos with live quota calculation
  const [promosDataRes, allCfrPromosRes, allFestPromosRes] = await Promise.all([
    supabase
      .from("promos")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    supabase.from("colorfun_registrations").select("promo_id, payment_status"),
    supabase.from("festival_registrations").select("promo_id, payment_status"),
  ]);

  const promoRegCount = new Map<string, number>();
  const allRegistrationsForPromos = [
    ...(allCfrPromosRes.data || []),
    ...(allFestPromosRes.data || []),
  ];
  for (const reg of allRegistrationsForPromos) {
    if (!reg.promo_id) continue;
    const s = (reg.payment_status || "pending").toLowerCase();
    if (s === "approved" || s === "verified" || s === "pending") {
      promoRegCount.set(reg.promo_id, (promoRegCount.get(reg.promo_id) || 0) + 1);
    }
  }

  const promos: Promo[] = ((promosDataRes.data as Promo[]) || []).map((p) => {
    const dynamicCount = promoRegCount.get(p.id) || 0;
    return {
      ...p,
      kuota_terpakai: Math.max(p.kuota_terpakai ?? 0, dynamicCount),
    };
  });

  return (
    <div className="min-h-screen text-on-surface pb-24">
      {/* Top Header with User Dropdown and Client-Side Logout */}
      <DashboardHeader
        userName={resolvedFullName || (user.email ? user.email.split("@")[0] : "User")}
        userEmail={user.email || profile?.email || ""}
        role={profile?.role || "user"}
      />

      {/* Main Content */}
      <main className="pt-28 px-4 md:px-12 max-w-[1600px] mx-auto min-h-screen flex flex-col gap-10">
        
        {/* 1. Welcome Banner */}
        <section>
          <div className="bg-slate-950/60 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-[0_4px_25px_rgba(0,0,0,0.5)] flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-2">
                Welcome back, <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#ffd700] to-[#ffb4ab]">{firstName}!</span>
              </h2>
              <p className="text-slate-300 text-lg">
                Ready for the cosmic journey?
              </p>
            </div>
          </div>
        </section>

        {/* 2. My Active Tickets Visual Slider */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-2xl font-bold text-secondary">Tiket Aktif Saya</h3>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Geser kartu untuk melihat seluruh tiket aktif Anda beserta visual QR Code.
              </p>
            </div>
          </div>
          <TicketSlider tickets={tickets} />
        </section>

        {/* 4. Riwayat Pendaftaran & Tiket Saya Table */}
        <section>
          <OrderHistoryTable tickets={tickets} />
        </section>

        {/* 5. Hot Deals & Katalog Promo / Bundling Aktif */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-2xl font-bold text-[#ffd700] flex items-center gap-2">
                🔥 Hot Deals &amp; Promo Bundling Aktif
              </h3>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Klaim kode promo dan paket bundling sebelum masa berlaku berakhir atau kuota habis.
              </p>
            </div>
          </div>
          <PromoSlider promos={promos} />
        </section>

        {/* 6. Explore More Events */}
        <section className="mt-4 mb-12">
          <h3 className="text-2xl font-bold text-secondary mb-6">Explore More Events</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* CFR Card */}
            <div className="bg-slate-950/60 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden group flex flex-col shadow-[0_4px_25px_rgba(0,0,0,0.5)]">
              <div className="h-44 w-full relative overflow-hidden bg-surface-dim">
                <Image 
                  src="/Bintang-Bintang Presisi.png" 
                  fill 
                  alt="ColorFun Run" 
                  className="object-cover group-hover:scale-105 transition-transform duration-500" 
                />
                <div className="absolute top-3 left-3 px-2.5 py-1 bg-secondary text-primary-container font-bold text-[10px] uppercase tracking-wider rounded-full shadow-md">
                  Sports
                </div>
              </div>
              <div className="p-6 flex-1 flex flex-col justify-between">
                <div>
                  <h4 className="text-xl font-bold text-white mb-2">ColorFun Run (5K)</h4>
                  <p className="text-xs text-slate-300 mb-4">
                    Fun run penuh warna di kampus ITS Surabaya. Dapatkan medali eksklusif dan race pack lengkap.
                  </p>
                </div>
                <Link 
                  href="/colorfun/checkout" 
                  className="w-full text-center py-2.5 bg-black/30 border border-white/10 hover:bg-black/50 text-white rounded-lg font-bold transition-colors mt-auto text-sm cursor-pointer"
                >
                  Daftar Sekarang
                </Link>
              </div>
            </div>

            {/* Festival Card */}
            <div className="bg-slate-950/60 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden group flex flex-col shadow-[0_4px_25px_rgba(0,0,0,0.5)]">
              <div className="h-44 w-full relative overflow-hidden bg-surface-dim">
                <Image 
                  src="/Bintang-Bintang Presisi.png" 
                  fill 
                  alt="VOITSFEST Main Festival" 
                  className="object-cover group-hover:scale-105 transition-transform duration-500" 
                />
                <div className="absolute top-3 left-3 px-2.5 py-1 bg-secondary text-primary-container font-bold text-[10px] uppercase tracking-wider rounded-full shadow-md">
                  Festival
                </div>
              </div>
              <div className="p-6 flex-1 flex flex-col justify-between">
                <div>
                  <h4 className="text-xl font-bold text-white mb-2">VOITSFEST Main Festival</h4>
                  <p className="text-xs text-slate-300 mb-4">
                    Malam puncak festival musik akbar dengan guest star nasional dan pertunjukan seni spektakuler.
                  </p>
                </div>
                <Link 
                  href="/festival/checkout" 
                  className="w-full text-center py-2.5 bg-black/30 border border-white/10 hover:bg-black/50 text-white rounded-lg font-bold transition-colors mt-auto text-sm cursor-pointer"
                >
                  Daftar Sekarang
                </Link>
              </div>
            </div>

          </div>
        </section>

        {/* 7. Official WhatsApp Channel Invitation Banner */}
        <WhatsAppDashboardBanner />

      </main>
    </div>
  );
}
