// src/app/rewards/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import AccountTabs from "@/components/AccountTabs";
import ScreenTitle from "@/components/ScreenTitle";
import PullToRefresh from "@/components/ui/PullToRefresh";

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
  pointsPerDay: number;
  minDailySpend: number;
  rupeesPerPoint: number;
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
  new Date(iso)
    .toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
    .toUpperCase();

/**
 * Points, in the BookMyGame Site design.
 *
 * The design gives this screen a tier — BRONZE climbing to something — and a
 * CLAIM button on every reward. Neither exists: there are no tiers, and points
 * are handed over at the counter, not claimed from a phone. So the headline
 * figure is the balance itself, the bar measures the nearest reward actually
 * within reach, and a reward that is affordable says to ask at the counter.
 *
 * Points are per café for the same reason wallets are, and the earn rule is
 * printed rather than implied, because a customer cannot act on a balance
 * without knowing what puts points into it.
 */
export default function RewardsPage() {
  const [cafes, setCafes] = useState<CafePoints[]>([]);
  const [needsPhone, setNeedsPhone] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const total = cafes.reduce((sum, cafe) => sum + cafe.balance, 0);
  const worth = cafes.reduce((sum, cafe) => sum + (Number(cafe.worthRupees) || 0), 0);

  const allRewards = cafes.flatMap((cafe) =>
    cafe.rewards.map((reward) => ({ ...reward, cafeName: cafe.cafeName, cafeId: cafe.cafeId }))
  );
  const claimable = allRewards.filter((reward) => reward.affordable).length;

  // The bar measures the nearest thing still out of reach, which is the only
  // target on this screen a customer is actually working towards.
  const next = allRewards
    .filter((reward) => !reward.affordable)
    .sort((a, b) => a.pointsToGo - b.pointsToGo)[0];

  const progress = next ? Math.min(100, (total / next.pointsCost) * 100) : total > 0 ? 100 : 0;

  const activity = cafes
    .flatMap((cafe) => cafe.history.map((entry) => ({ ...entry, cafeName: cafe.cafeName })))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12);

  return (
    <PullToRefresh onRefresh={load}>
      <div className="min-h-screen bg-[#0b0b0c] font-display text-[#f2f0ea]">
        <AccountTabs />
        <ScreenTitle title="Points" meta="EARNED BY PLAYING · SPENT AT THE COUNTER" />

        {loading && (
          <div className="border-t border-[#f2f0ea]/[0.12] px-5 py-16 font-mono text-xs tracking-[0.2em] text-[#f2f0ea]/40 sm:px-8 lg:px-12">
            LOADING YOUR POINTS…
          </div>
        )}

        {error && !loading && (
          <div className="mx-5 mt-4 border border-[#ff5c2b]/40 bg-[#ff5c2b]/[0.08] px-6 py-5 text-sm font-semibold text-[#ff5c2b] sm:mx-8 lg:mx-12">
            {error}
          </div>
        )}

        {!loading && !error && !signedIn && (
          <Prompt
            title="Sign in to see your points"
            body="Points follow the phone number you give at the café — most are earned by walking in, not by booking online."
            action={{ href: "/login", label: "SIGN IN →" }}
          />
        )}

        {!loading && !error && signedIn && needsPhone && (
          <Prompt
            title="Add your phone number"
            body="Points are earned against the number you give at the counter. Add it to your profile and they show up here."
            action={{ href: "/profile", label: "ADD YOUR NUMBER →" }}
          />
        )}

        {!loading && !error && signedIn && !needsPhone && (
          <div className="grid border-t border-[#f2f0ea]/[0.12] lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
            <div className="border-[#f2f0ea]/[0.12] lg:border-r">
              <div className="bg-[#d8ff3c]/[0.06] px-5 py-10 sm:px-8 lg:p-12">
                <div className="font-mono text-xs tracking-[0.24em] text-[#d8ff3c]">
                  POINTS BALANCE
                  {cafes.length > 1 ? ` · ${cafes.length} CAFÉS` : cafes[0] ? ` · ${cafes[0].cafeName.toUpperCase()}` : ""}
                </div>
                <div className="mt-3.5 flex flex-wrap items-end gap-5">
                  <span className="text-[clamp(56px,5vw,112px)] font-black leading-[0.9] tracking-[-0.04em]">
                    {total.toLocaleString("en-IN")}
                  </span>
                  <span className="pb-3 font-mono text-xs tracking-[0.16em] text-[#f2f0ea]/45">
                    {next
                      ? `${next.pointsToGo} MORE FOR ${next.name.toUpperCase()}`
                      : claimable > 0
                        ? "READY TO SPEND"
                        : "NOTHING TO CLAIM YET"}
                  </span>
                </div>

                <div className="mt-6 h-1.5 bg-[#0b0b0c]/35">
                  <div className="h-full bg-[#d8ff3c]" style={{ width: `${progress}%` }} />
                </div>

                <div className="mt-7 grid gap-y-6 sm:grid-cols-3">
                  {[
                    { label: "WORTH ABOUT", value: `₹${worth.toLocaleString("en-IN")}` },
                    { label: "READY TO CLAIM", value: String(claimable) },
                    { label: "CAFÉS", value: String(cafes.length) },
                  ].map((stat) => (
                    <div key={stat.label} className="pr-6">
                      <div className="whitespace-nowrap font-mono text-[10px] tracking-[0.18em] text-[#f2f0ea]/40">
                        {stat.label}
                      </div>
                      <div className="mt-2 text-[26px] font-black tracking-[-0.02em]">
                        {stat.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {allRewards.length > 0 ? (
                <>
                  <div className="px-5 pb-2.5 pt-9 font-mono text-[11px] tracking-[0.2em] text-[#f2f0ea]/40 sm:px-8 lg:px-12">
                    REDEEM AT A CAFÉ
                  </div>
                  {allRewards.map((reward) => (
                    <div
                      key={`${reward.cafeId}-${reward.id}`}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-3 border-t border-[#f2f0ea]/[0.09] px-5 py-[22px] sm:grid-cols-[minmax(0,1fr)_100px_auto] sm:px-8 lg:px-12"
                    >
                      <div className="min-w-0">
                        <div className="text-lg font-extrabold tracking-[-0.01em]">
                          {reward.name}
                        </div>
                        <div className="mt-1.5 font-mono text-[11px] tracking-[0.14em] text-[#f2f0ea]/40">
                          {reward.cafeName} · {reward.detail}
                        </div>
                      </div>
                      <span className="whitespace-nowrap text-[17px] font-black text-[#d8ff3c]">
                        {reward.pointsCost} PTS
                      </span>
                      <span
                        className="justify-self-end whitespace-nowrap border px-5 py-3 text-center font-display text-xs font-black tracking-[0.12em]"
                        style={
                          reward.affordable
                            ? { background: "#d8ff3c", borderColor: "#d8ff3c", color: "#0b0b0c" }
                            : {
                                background: "transparent",
                                borderColor: "rgba(242,240,234,.16)",
                                color: "rgba(242,240,234,.4)",
                              }
                        }
                      >
                        {reward.affordable ? "ASK AT COUNTER" : `${reward.pointsToGo} MORE`}
                      </span>
                    </div>
                  ))}
                </>
              ) : (
                <div className="px-5 py-12 sm:px-8 lg:px-12">
                  <p className="max-w-[46ch] text-[15px] leading-relaxed text-[#f2f0ea]/60">
                    {total > 0
                      ? "Your cafés have not put up a rewards menu yet. Ask at the counter what your points get you."
                      : "No points yet. Play a session and they start collecting against your number."}
                  </p>
                </div>
              )}
              <div className="h-14" />
            </div>

            <div className="flex flex-col border-t border-[#f2f0ea]/[0.12] lg:border-t-0">
              <div className="border-b border-[#f2f0ea]/[0.12] px-8 py-[26px]">
                <div className="font-mono text-xs tracking-[0.24em] text-[#d8ff3c]">
                  HOW YOU EARN
                </div>
              </div>

              {cafes.filter((cafe) => cafe.programEnabled).length === 0 ? (
                <div className="border-b border-[#f2f0ea]/[0.07] px-8 py-5 font-mono text-xs leading-[1.6] text-[#f2f0ea]/50">
                  No café you play at is running points at the moment.
                </div>
              ) : (
                cafes
                  .filter((cafe) => cafe.programEnabled)
                  .map((cafe) => (
                    <div
                      key={cafe.cafeId}
                      className="flex items-baseline gap-4 border-b border-[#f2f0ea]/[0.07] px-8 py-[18px]"
                    >
                      <span className="whitespace-nowrap text-[19px] font-black text-[#d8ff3c]">
                        +{cafe.pointsPerDay}
                      </span>
                      <span className="font-mono text-xs leading-[1.6] text-[#f2f0ea]/50">
                        a day at {cafe.cafeName}
                        {cafe.minDailySpend > 0 ? `, on ₹${cafe.minDailySpend} or more` : ""}
                      </span>
                    </div>
                  ))
              )}

              {activity.length > 0 && (
                <>
                  <div className="px-8 pb-2.5 pt-[26px] font-mono text-[11px] tracking-[0.2em] text-[#f2f0ea]/40">
                    POINTS ACTIVITY
                  </div>
                  {activity.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-4 border-b border-[#f2f0ea]/[0.07] px-8 py-[15px]"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold">
                          {REASON_LABELS[entry.reason] || entry.reason}
                        </div>
                        <div className="mt-1 truncate font-mono text-[10px] tracking-[0.14em] text-[#f2f0ea]/[0.32]">
                          {formatDate(entry.createdAt)} · {entry.cafeName}
                        </div>
                      </div>
                      <span
                        className="whitespace-nowrap font-mono text-sm font-semibold"
                        style={{ color: entry.points >= 0 ? "#d8ff3c" : "#ff5c2b" }}
                      >
                        {entry.points >= 0 ? "+" : "−"}
                        {Math.abs(entry.points)}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}

function Prompt({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action: { href: string; label: string };
}) {
  return (
    <div className="border-t border-[#f2f0ea]/[0.12] px-5 py-16 sm:px-8 lg:px-12">
      <h2 className="text-2xl font-black tracking-[-0.02em]">{title}</h2>
      <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-[#f2f0ea]/55">{body}</p>
      <Link
        href={action.href}
        className="mt-7 inline-block bg-[#d8ff3c] px-8 py-4 font-display text-[13px] font-black tracking-[0.14em] text-[#0b0b0c] transition-[filter] hover:brightness-110"
      >
        {action.label}
      </Link>
    </div>
  );
}
