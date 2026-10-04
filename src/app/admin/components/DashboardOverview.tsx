"use client";

import { useEffect, useState, useCallback } from "react";
import PaymentVerification from "./PaymentVerification";
import CMSManager from "./CMSManager";
import { Users, Wallet, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function DashboardOverview() {
  const [stats, setStats] = useState({
    totalRegistrants: 0,
    totalRevenue: 0,
    pendingPayments: 0,
    cfrVerifiedCount: 0,
    festVerifiedCount: 0,
  });
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  const fetchStats = useCallback(async () => {
    try {
      // 0. Proactively sanitize any existing database records with uppercase or trailing space in payment_status
      await Promise.allSettled([
        supabase
          .from("colorfun_registrations")
          .update({ payment_status: "verified" })
          .ilike("payment_status", "%verified%")
          .neq("payment_status", "verified"),
        supabase
          .from("festival_registrations")
          .update({ payment_status: "verified" })
          .ilike("payment_status", "%verified%")
          .neq("payment_status", "verified"),
        supabase
          .from("colorfun_registrations")
          .update({ payment_status: "pending" })
          .ilike("payment_status", "%pending%")
          .neq("payment_status", "pending"),
        supabase
          .from("festival_registrations")
          .update({ payment_status: "pending" })
          .ilike("payment_status", "%pending%")
          .neq("payment_status", "pending"),
      ]);

      // 1. Eliminate Client-Side Array Truncation: Retrieve Server-Side Exact Count for Verified Participants
      const { count: cfrVerifiedCount, error: cfrCountError } = await supabase
        .from("colorfun_registrations")
        .select("*", { count: "exact", head: true })
        .ilike("payment_status", "verified");

      const { count: festVerifiedCount, error: festCountError } = await supabase
        .from("festival_registrations")
        .select("*", { count: "exact", head: true })
        .ilike("payment_status", "verified");

      if (cfrCountError) {
        console.error("Error fetching exact count for colorfun_registrations:", cfrCountError);
      }
      if (festCountError) {
        console.error("Error fetching exact count for festival_registrations:", festCountError);
      }

      const verifiedCFR = cfrVerifiedCount || 0;
      const verifiedFestival = festVerifiedCount || 0;

      // 4. Total Registrants Formula Alignment: Total Verified = Verified CFR + Verified Festival
      const totalRegistrants = verifiedCFR + verifiedFestival;

      // 2. Pending Payments Calculation: Server-Side Exact Count for primary registrations awaiting verification
      const [cfrPendingRes, festPendingRes] = await Promise.all([
        supabase
          .from("colorfun_registrations")
          .select("*", { count: "exact", head: true })
          .ilike("payment_status", "pending")
          .not("is_primary", "is", false),
        supabase
          .from("festival_registrations")
          .select("*", { count: "exact", head: true })
          .ilike("payment_status", "pending")
          .not("is_primary", "is", false),
      ]);

      const pendingPayments = (cfrPendingRes.count || 0) + (festPendingRes.count || 0);

      // 3. Revenue / Amount Paid Aggregation Fix
      // Fetch all verified rows without client-side slicing using pagination batches
      const fetchVerifiedRevenue = async (
        table: "colorfun_registrations" | "festival_registrations"
      ): Promise<number> => {
        const PAGE_SIZE = 1000;
        let sum = 0;
        let from = 0;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from(table)
            .select("amount_paid, is_primary")
            .ilike("payment_status", "verified")
            .range(from, from + PAGE_SIZE - 1);

          if (error) {
            console.error(`Error fetching revenue rows from ${table}:`, error);
            break;
          }

          if (data && data.length > 0) {
            for (const row of data) {
              // Exclude bundle secondary members to prevent duplicated bundle prices
              if (row.is_primary !== false) {
                sum += Number(row.amount_paid) || 0;
              }
            }

            if (data.length < PAGE_SIZE) {
              hasMore = false;
            } else {
              from += PAGE_SIZE;
            }
          } else {
            hasMore = false;
          }
        }

        return sum;
      };

      const [cfrRevenue, festRevenue] = await Promise.all([
        fetchVerifiedRevenue("colorfun_registrations"),
        fetchVerifiedRevenue("festival_registrations"),
      ]);

      const totalRevenue = cfrRevenue + festRevenue;

      setStats({
        totalRegistrants,
        totalRevenue,
        pendingPayments,
        cfrVerifiedCount: verifiedCFR,
        festVerifiedCount: verifiedFestival,
      });
    } catch (err) {
      console.error("Error fetching dashboard overview stats:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchStats();

    // Set up Realtime listener for live updates across colorfun_registrations, festival_registrations, and transactions tables
    const channel = supabase
      .channel("admin-dashboard-stats-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "colorfun_registrations" },
        () => {
          fetchStats();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "festival_registrations" },
        () => {
          fetchStats();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions" },
        () => {
          fetchStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchStats, supabase]);

  // Clean Indonesian Rupiah formatting helper
  const formatIDR = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="flex flex-col gap-12 w-full">
      {/* 1. Overview Summary Metric Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Card 1: Total Registrants (CFR & Festival only, clean numeric count) */}
        <div className="bg-surface-container/40 backdrop-blur-xl border border-white/15 rounded-2xl p-6 relative overflow-hidden group hover:border-secondary/40 hover:shadow-[0_0_25px_rgba(176,198,255,0.15)] transition-all">
          <div className="absolute -right-10 -top-10 w-32 h-32 bg-secondary/10 rounded-full blur-2xl group-hover:bg-secondary/20 transition-colors pointer-events-none"></div>
          <div className="flex justify-between items-start">
            <div>
              <p className="font-semibold text-xs text-on-surface-variant/80 mb-2 tracking-widest uppercase">
                TOTAL REGISTRANTS
              </p>
              <h3 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
                {loading ? "..." : stats.totalRegistrants.toLocaleString("id-ID")}
              </h3>
              <p className="text-xs text-secondary mt-3 font-medium">
                ColorFun Run ({loading ? "..." : stats.cfrVerifiedCount.toLocaleString("id-ID")}) &amp; Festival ({loading ? "..." : stats.festVerifiedCount.toLocaleString("id-ID")})
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-secondary/15 border border-secondary/30 flex items-center justify-center text-secondary shadow-[0_0_15px_rgba(176,198,255,0.2)]">
              <Users className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Card 2: Total Revenue (All verified sub-events, clean Rupiah format) */}
        <div className="bg-surface-container/40 backdrop-blur-xl border border-white/15 rounded-2xl p-6 relative overflow-hidden group hover:border-tertiary/40 hover:shadow-[0_0_25px_rgba(230,191,160,0.15)] transition-all">
          <div className="absolute -right-10 -top-10 w-32 h-32 bg-tertiary/10 rounded-full blur-2xl group-hover:bg-tertiary/20 transition-colors pointer-events-none"></div>
          <div className="flex justify-between items-start">
            <div>
              <p className="font-semibold text-xs text-on-surface-variant/80 mb-2 tracking-widest uppercase">
                TOTAL REVENUE
              </p>
              <h3 className="text-3xl md:text-4xl font-bold text-tertiary tracking-tight">
                {loading ? "..." : formatIDR(stats.totalRevenue)}
              </h3>
              <p className="text-xs text-tertiary/80 mt-3 font-medium">
                Verified Transactions
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-tertiary/15 border border-tertiary/30 flex items-center justify-center text-tertiary shadow-[0_0_15px_rgba(230,191,160,0.2)]">
              <Wallet className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Card 3: Pending Payments (Clean numeric pending count) */}
        <div className="bg-surface-container/40 backdrop-blur-xl border border-white/15 rounded-2xl p-6 relative overflow-hidden group hover:border-error/40 hover:shadow-[0_0_25px_rgba(255,180,171,0.15)] transition-all">
          <div className="absolute -right-10 -top-10 w-32 h-32 bg-error/10 rounded-full blur-2xl group-hover:bg-error/20 transition-colors pointer-events-none"></div>
          <div className="flex justify-between items-start">
            <div>
              <p className="font-semibold text-xs text-on-surface-variant/80 mb-2 tracking-widest uppercase">
                PENDING PAYMENTS
              </p>
              <h3 className="text-4xl md:text-5xl font-bold text-error tracking-tight">
                {loading ? "..." : stats.pendingPayments.toLocaleString("id-ID")}
              </h3>
              <p className="text-xs text-error/80 mt-3 font-medium">
                Transactions Awaiting Verification
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-error/15 border border-error/30 flex items-center justify-center text-error shadow-[0_0_15px_rgba(255,180,171,0.2)]">
              <Clock className="w-6 h-6" />
            </div>
          </div>
        </div>

      </section>

      {/* 2. Payment Verification Center (Reactivity callback wired) */}
      <PaymentVerification onTransactionUpdated={fetchStats} />

      {/* 3. Bottom Grid: CMS Controls & Gateways */}
      <CMSManager />
    </div>
  );
}
