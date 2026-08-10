// src/app/rewards/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, AlertCircle, Sparkles, Gift, Clock } from "lucide-react";
import { colors, fonts } from "@/lib/constants";
import { supabase } from "@/lib/supabaseClient";

type HistoryEntry = {
  id: string;
  points: number;
  reason: string;
  note: string | null;
  createdAt: string;
};

type RewardOption = {
  id: string;
  name: string;
  description: string | null;
  pointsCost: number;
  detail: string;
  affordable: boolean;
  pointsToGo: number;
};

type CafePoints = {
  cafeId: string;
  cafeName: string;
  balance: number;
  worthRupees: number;
  minRedeemPoints: number;
  canRedeem: boolean;
  programEnabled: boolean;
  rewards: RewardOption[];
  history: HistoryEntry[];
};

const REASON_LABELS: Record<string, string> = {
  booking: "A day at the café",
  redeemed: "Redeemed at the counter",
  manual: "Adjusted by the café",
  bonus: "Bonus",
  expired: "Expired",
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default function RewardsPage() {
  const router = useRouter();

  const [cafes, setCafes] = useState<CafePoints[]>([]);
  const [needsPhone, setNeedsPhone] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openCafeId, setOpenCafeId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        setSignedIn(false);
        return;
      }

      setSignedIn(true);

      const res = await fetch("/api/loyalty/mine", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(data.error || "Could not load your points");

      setCafes(Array.isArray(data.cafes) ? data.cafes : []);
      setNeedsPhone(Boolean(data.needsPhone));
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
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-6">
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
          My points
        </h1>
        <p className="mt-2 text-sm" style={{ color: colors.textSecondary }}>
          Spend enough in a day and you earn points. Save them up for free time, drinks
          and discounts.
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
            style={{
              background: "rgba(245,158,11,0.08)",
              border: "1px solid rgba(245,158,11,0.25)",
              color: colors.orange,
            }}
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && !signedIn && (
          <div
            className="mt-8 rounded-2xl p-5 text-sm"
            style={{ background: colors.darkCard, border: `1px solid ${colors.border}`, color: colors.textSecondary }}
          >
            <Link href="/login" className="font-semibold" style={{ color: colors.cyan }}>
              Sign in
            </Link>{" "}
            to see the points you have earned.
          </div>
        )}

        {!loading && !error && signedIn && needsPhone && (
          <div
            className="mt-8 rounded-2xl p-5 text-sm"
            style={{ background: "rgba(0,240,255,0.06)", border: `1px solid ${colors.border}`, color: colors.textSecondary }}
          >
            {/* Points follow the phone number given at the counter, so an
                account with no phone on it genuinely has nothing to show. */}
            Points are recorded against the phone number you give at the counter.
            <Link href="/profile" className="ml-1 font-semibold" style={{ color: colors.cyan }}>
              Add your phone number
            </Link>{" "}
            to see them here.
          </div>
        )}

        {!loading && !error && signedIn && !needsPhone && cafes.length === 0 && (
          <div
            className="mt-8 rounded-2xl p-6 text-center"
            style={{ background: colors.darkCard, border: `1px solid ${colors.border}` }}
          >
            <Sparkles size={26} style={{ color: colors.purple }} className="mx-auto" />
            <p className="mt-3 text-sm font-semibold" style={{ color: colors.textPrimary }}>
              No points yet
            </p>
            <p className="mt-1 text-xs" style={{ color: colors.textSecondary }}>
              Play a session and points land here automatically once you have spent
              enough in a day.
            </p>
            <Link
              href="/"
              className="mt-5 inline-block rounded-xl px-5 py-2.5 text-sm font-bold"
              style={{ background: colors.cyan, color: colors.dark }}
            >
              Book a session
            </Link>
          </div>
        )}

        {!loading && !error && cafes.length > 0 && (
          <div className="mt-8 grid gap-4">
            {cafes.map((cafe) => {
              const isOpen = openCafeId === cafe.cafeId;
              const pointsToGo = Math.max(0, cafe.minRedeemPoints - cafe.balance);

              return (
                <div
                  key={cafe.cafeId}
                  className="rounded-2xl p-5"
                  style={{
                    background: colors.darkCard,
                    border: `1px solid ${cafe.canRedeem ? "rgba(34,197,94,0.3)" : colors.border}`,
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs" style={{ color: colors.textMuted }}>
                        {cafe.cafeName}
                      </p>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-3xl font-bold" style={{ color: colors.cyan }}>
                          {cafe.balance.toLocaleString("en-IN")}
                        </span>
                        <span className="text-xs" style={{ color: colors.textMuted }}>
                          points
                        </span>
                      </div>
                      {cafe.rewards.length === 0 && cafe.worthRupees > 0 && (
                        <p className="mt-1 text-sm" style={{ color: colors.textSecondary }}>
                          Worth ₹{cafe.worthRupees.toLocaleString("en-IN")} off
                        </p>
                      )}
                    </div>

                    <span
                      className="rounded-md px-2 py-1 text-[10px] font-bold uppercase"
                      style={{
                        background: cafe.canRedeem ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.06)",
                        color: cafe.canRedeem ? colors.green : colors.textMuted,
                      }}
                    >
                      {cafe.canRedeem ? "Ready to use" : "Collecting"}
                    </span>
                  </div>

                  {/* Progress towards the minimum, so a balance that cannot be
                      spent yet still shows how close it is. */}
                  {!cafe.programEnabled ? (
                    <p className="mt-4 text-xs" style={{ color: colors.textMuted }}>
                      This café has paused its points scheme. Your balance is safe.
                    </p>
                  ) : cafe.canRedeem ? (
                    <p
                      className="mt-4 flex items-center gap-1.5 text-xs"
                      style={{ color: colors.green }}
                    >
                      <Gift size={13} />
                      Ask at the counter to use these on your next session.
                    </p>
                  ) : (
                    <>
                      <div
                        className="mt-4 h-1.5 w-full overflow-hidden rounded-full"
                        style={{ background: "rgba(255,255,255,0.08)" }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${
                              cafe.minRedeemPoints > 0
                                ? Math.min(100, (cafe.balance / cafe.minRedeemPoints) * 100)
                                : 100
                            }%`,
                            background: colors.purple,
                          }}
                        />
                      </div>
                      <p className="mt-2 text-xs" style={{ color: colors.textMuted }}>
                        {pointsToGo} more {pointsToGo === 1 ? "point" : "points"} until you can use
                        them
                      </p>
                    </>
                  )}

                  {/* The menu. This is what a balance is for — a number on its
                      own gives nobody a reason to come back. */}
                  {cafe.rewards.length > 0 && (
                    <div className="mt-4">
                      <p
                        className="mb-2 text-[11px] font-semibold uppercase tracking-wide"
                        style={{ color: colors.textMuted }}
                      >
                        What you can get
                      </p>

                      <div className="grid gap-2">
                        {cafe.rewards.map((reward) => (
                          <div
                            key={reward.id}
                            className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
                            style={{
                              background: reward.affordable
                                ? "rgba(34,197,94,0.07)"
                                : "rgba(255,255,255,0.03)",
                              border: `1px solid ${
                                reward.affordable ? "rgba(34,197,94,0.25)" : "transparent"
                              }`,
                            }}
                          >
                            <div className="min-w-0">
                              <p
                                className="truncate text-sm font-semibold"
                                style={{ color: colors.textPrimary }}
                              >
                                {reward.name}
                              </p>
                              <p className="text-[11px]" style={{ color: colors.textMuted }}>
                                {reward.description || reward.detail}
                              </p>
                            </div>

                            <div className="shrink-0 text-right">
                              <p
                                className="text-sm font-bold"
                                style={{
                                  color: reward.affordable ? colors.green : colors.textSecondary,
                                }}
                              >
                                {reward.pointsCost} pts
                              </p>
                              <p className="text-[10px]" style={{ color: colors.textMuted }}>
                                {reward.affordable
                                  ? "Ask at the counter"
                                  : `${reward.pointsToGo} more`}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {cafe.history.length > 0 && (
                    <>
                      <button
                        onClick={() => setOpenCafeId(isOpen ? null : cafe.cafeId)}
                        className="mt-4 flex items-center gap-1.5 text-xs font-semibold"
                        style={{ color: colors.cyan }}
                      >
                        <Clock size={13} />
                        {isOpen ? "Hide history" : "See how you earned these"}
                      </button>

                      {isOpen && (
                        <div className="mt-3 grid gap-2">
                          {cafe.history.map((entry) => (
                            <div
                              key={entry.id}
                              className="flex items-center justify-between gap-3 rounded-xl px-3 py-2"
                              style={{ background: "rgba(255,255,255,0.03)" }}
                            >
                              <div>
                                <p className="text-xs" style={{ color: colors.textPrimary }}>
                                  {REASON_LABELS[entry.reason] || entry.reason}
                                </p>
                                <p className="text-[11px]" style={{ color: colors.textMuted }}>
                                  {formatDate(entry.createdAt)}
                                </p>
                              </div>
                              <span
                                className="text-sm font-bold"
                                style={{ color: entry.points >= 0 ? colors.green : colors.orange }}
                              >
                                {entry.points >= 0 ? "+" : ""}
                                {entry.points}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!loading && !error && signedIn && (
          <p className="mt-6 text-xs" style={{ color: colors.textMuted }}>
            Points are counted per café, because each one runs its own scheme.
          </p>
        )}
      </div>
    </div>
  );
}
