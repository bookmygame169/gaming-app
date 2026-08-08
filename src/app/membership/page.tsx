// src/app/membership/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Clock,
  CalendarDays,
  Loader2,
  AlertCircle,
  Ticket,
  Infinity as InfinityIcon,
} from "lucide-react";
import { colors, fonts } from "@/lib/constants";
import { supabase } from "@/lib/supabaseClient";

type Membership = {
  id: string;
  cafeName: string;
  planName: string;
  planType: string | null;
  description: string | null;
  hoursPurchased: number;
  hoursRemaining: number;
  amountPaid: number;
  purchaseDate: string;
  expiryDate: string;
  daysLeft: number;
  isUsable: boolean;
  isExpired: boolean;
};

type Plan = {
  id: string;
  cafeId: string;
  cafeName: string;
  cafeSlug: string | null;
  planType: string;
  name: string;
  description: string | null;
  price: number;
  hours: number | null;
  validityDays: number;
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default function MembershipPage() {
  const router = useRouter();

  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [needsPhone, setNeedsPhone] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Plans are public, so they load for signed-out visitors deciding whether
      // this is worth signing up for.
      const plansRes = await fetch("/api/memberships/plans");
      const plansData = await plansRes.json().catch(() => ({}));
      if (!plansRes.ok) throw new Error(plansData.error || "Could not load plans");
      setPlans(Array.isArray(plansData.plans) ? plansData.plans : []);

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        setSignedIn(false);
        return;
      }

      setSignedIn(true);

      const mineRes = await fetch("/api/memberships/mine", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const mineData = await mineRes.json().catch(() => ({}));

      if (mineRes.ok) {
        setMemberships(Array.isArray(mineData.memberships) ? mineData.memberships : []);
        setNeedsPhone(Boolean(mineData.needsPhone));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div style={{ background: colors.dark, minHeight: "100vh", fontFamily: fonts.body }}>
      <div className="mx-auto max-w-4xl px-4 pb-16 pt-6">
        <button
          onClick={() => router.back()}
          className="mb-6 flex items-center gap-2 text-sm transition-colors hover:text-white"
          style={{ color: colors.textSecondary }}
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <h1
          className="text-3xl font-bold sm:text-4xl"
          style={{ fontFamily: fonts.heading, color: colors.textPrimary }}
        >
          Memberships
        </h1>
        <p className="mt-2 text-sm" style={{ color: colors.textSecondary }}>
          Day passes and hour packs — cheaper than paying per session.
        </p>

        {loading && (
          <div className="flex items-center gap-2 py-16" style={{ color: colors.textSecondary }}>
            <Loader2 size={18} className="animate-spin" />
            Loading…
          </div>
        )}

        {error && !loading && (
          <div
            className="mt-6 flex items-start gap-2 rounded-xl p-4 text-sm"
            style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", color: colors.orange }}
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* ---------------- Mine ---------------- */}
            {signedIn && (
              <section className="mt-10">
                <h2
                  className="mb-4 text-lg font-bold"
                  style={{ fontFamily: fonts.heading, color: colors.textPrimary }}
                >
                  My memberships
                </h2>

                {needsPhone && (
                  <div
                    className="rounded-xl p-4 text-sm"
                    style={{ background: "rgba(0,240,255,0.06)", border: `1px solid ${colors.border}`, color: colors.textSecondary }}
                  >
                    Memberships are bought at the counter and recorded against your phone number.
                    <Link href="/profile" className="ml-1 font-semibold" style={{ color: colors.cyan }}>
                      Add your phone number
                    </Link>{" "}
                    to see them here.
                  </div>
                )}

                {!needsPhone && memberships.length === 0 && (
                  <div
                    className="rounded-xl p-5 text-sm"
                    style={{ background: colors.darkCard, border: `1px solid ${colors.border}`, color: colors.textSecondary }}
                  >
                    You don&apos;t have a membership yet. Pick one below and buy it at the counter.
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  {memberships.map((m) => {
                    const isDayPass = m.planType === "day_pass";
                    // Hours can run out before the date, and the date can pass
                    // with hours unused, so both are shown.
                    const usedRatio =
                      m.hoursPurchased > 0
                        ? Math.min(1, (m.hoursPurchased - m.hoursRemaining) / m.hoursPurchased)
                        : 0;

                    return (
                      <div
                        key={m.id}
                        className="rounded-2xl p-5"
                        style={{
                          background: colors.darkCard,
                          border: `1px solid ${m.isUsable ? "rgba(34,197,94,0.3)" : colors.border}`,
                          opacity: m.isUsable ? 1 : 0.6,
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-base font-bold" style={{ color: colors.textPrimary }}>
                              {m.planName}
                            </p>
                            <p className="text-xs" style={{ color: colors.textMuted }}>
                              {m.cafeName}
                            </p>
                          </div>
                          <span
                            className="rounded-md px-2 py-1 text-[10px] font-bold uppercase"
                            style={{
                              background: m.isUsable ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.06)",
                              color: m.isUsable ? colors.green : colors.textMuted,
                            }}
                          >
                            {m.isExpired ? "Expired" : m.isUsable ? "Active" : "Used up"}
                          </span>
                        </div>

                        {isDayPass ? (
                          <p className="mt-4 flex items-center gap-1.5 text-sm" style={{ color: colors.textSecondary }}>
                            <InfinityIcon size={15} style={{ color: colors.cyan }} />
                            Unlimited play
                          </p>
                        ) : (
                          <div className="mt-4">
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-2xl font-bold" style={{ color: colors.cyan }}>
                                {m.hoursRemaining}
                              </span>
                              <span className="text-xs" style={{ color: colors.textMuted }}>
                                of {m.hoursPurchased} hours left
                              </span>
                            </div>
                            <div
                              className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
                              style={{ background: "rgba(255,255,255,0.08)" }}
                            >
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${usedRatio * 100}%`, background: colors.cyan }}
                              />
                            </div>
                          </div>
                        )}

                        <p className="mt-4 flex items-center gap-1.5 text-xs" style={{ color: colors.textMuted }}>
                          <CalendarDays size={13} />
                          {m.isExpired
                            ? `Expired ${formatDate(m.expiryDate)}`
                            : `${m.daysLeft} ${m.daysLeft === 1 ? "day" : "days"} left · until ${formatDate(m.expiryDate)}`}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ---------------- Available plans ---------------- */}
            <section className="mt-12">
              <h2
                className="mb-4 text-lg font-bold"
                style={{ fontFamily: fonts.heading, color: colors.textPrimary }}
              >
                Available plans
              </h2>

              {plans.length === 0 ? (
                <div
                  className="rounded-xl p-5 text-sm"
                  style={{ background: colors.darkCard, border: `1px solid ${colors.border}`, color: colors.textSecondary }}
                >
                  No membership plans are on sale right now.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {plans.map((plan) => {
                    const isDayPass = plan.planType === "day_pass";

                    return (
                      <div
                        key={plan.id}
                        className="flex flex-col rounded-2xl p-5"
                        style={{ background: colors.darkCard, border: `1px solid ${colors.border}` }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-base font-bold" style={{ color: colors.textPrimary }}>
                              {plan.name}
                            </p>
                            <p className="text-xs" style={{ color: colors.textMuted }}>
                              {plan.cafeName}
                            </p>
                          </div>
                          {isDayPass ? (
                            <Ticket size={16} style={{ color: colors.purple }} />
                          ) : (
                            <Clock size={16} style={{ color: colors.cyan }} />
                          )}
                        </div>

                        {plan.description && (
                          <p className="mt-2 text-xs" style={{ color: colors.textSecondary }}>
                            {plan.description}
                          </p>
                        )}

                        <p className="mt-4 text-2xl font-bold" style={{ color: colors.textPrimary }}>
                          ₹{plan.price.toLocaleString("en-IN")}
                        </p>

                        <p className="mt-1 text-xs" style={{ color: colors.textSecondary }}>
                          {isDayPass
                            ? "Unlimited play for the day"
                            : `${plan.hours} hours · use within ${plan.validityDays} days`}
                        </p>

                        {/* Buying online is not possible yet, so this points at
                            the café rather than a checkout that does not exist. */}
                        <Link
                          href={plan.cafeSlug ? `/cafes/${plan.cafeSlug}` : `/cafes/${plan.cafeId}`}
                          className="mt-5 rounded-xl py-2.5 text-center text-sm font-bold transition-opacity hover:opacity-90"
                          style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                        >
                          View café
                        </Link>
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="mt-4 text-xs" style={{ color: colors.textMuted }}>
                Memberships are bought at the café counter. Once bought, yours appears here
                automatically.
              </p>
            </section>

            {!signedIn && (
              <div
                className="mt-10 rounded-2xl p-5 text-sm"
                style={{ background: colors.darkCard, border: `1px solid ${colors.border}`, color: colors.textSecondary }}
              >
                <Link href="/login" className="font-semibold" style={{ color: colors.cyan }}>
                  Sign in
                </Link>{" "}
                to see your membership and how many hours you have left.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
