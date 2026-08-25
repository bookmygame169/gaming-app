// src/app/membership/page.tsx
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import AccountTabs from "@/components/AccountTabs";
import ScreenTitle from "@/components/ScreenTitle";

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
  isUnlimited: boolean;
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
  isUnlimited: boolean;
};

const formatDate = (iso: string) =>
  new Date(iso)
    .toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
    .toUpperCase();

/**
 * Memberships, in the BookMyGame Site design.
 *
 * The design's own words for this screen happen to be exactly true here —
 * there is no single BookMyGame plan, each café sells its own — so the intro
 * is kept as drawn. What is not kept is the BUY PASS button on every plan
 * card: passes are paid for at the counter, so the card says so and links to
 * the café instead of opening a checkout that does not exist.
 *
 * An unlimited pass shows the word rather than a number. It holds no hours and
 * spends none, so a balance and a progress bar would both be reporting on
 * something that isn't there.
 */
export default function MembershipPage() {
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [needsPhone, setNeedsPhone] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickedCafe, setPickedCafe] = useState<string | null>(null);

  const cafes = useMemo(() => {
    const grouped = new Map<string, { cafeId: string; cafeName: string; cafeSlug: string | null; plans: Plan[] }>();

    for (const plan of plans) {
      const existing = grouped.get(plan.cafeId);
      if (existing) existing.plans.push(plan);
      else
        grouped.set(plan.cafeId, {
          cafeId: plan.cafeId,
          cafeName: plan.cafeName,
          cafeSlug: plan.cafeSlug,
          plans: [plan],
        });
    }

    return [...grouped.values()];
  }, [plans]);

  const current = cafes.find((cafe) => cafe.cafeId === pickedCafe) ?? cafes[0] ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
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

  const active = memberships.filter((m) => !m.isExpired);

  return (
    <div className="min-h-screen bg-[#0b0b0c] font-display text-[#f2f0ea]">
      <AccountTabs />
      <ScreenTitle title="Membership" meta="SOLD BY EACH CAFÉ" />

      <p className="m-0 max-w-[760px] px-5 pb-8 font-mono text-[13px] leading-[1.9] text-[#f2f0ea]/45 sm:px-8 sm:text-sm lg:px-12">
        There is no single BookMyGame plan. Every partner café runs its own passes, its own
        hours and its own perks — you buy the pass at the café you actually play at, and use
        it only there. Hold passes at as many cafés as you like.
      </p>

      {loading && (
        <div className="border-t border-[#f2f0ea]/[0.12] px-5 py-16 font-mono text-xs tracking-[0.2em] text-[#f2f0ea]/40 sm:px-8 lg:px-12">
          LOADING PASSES…
        </div>
      )}

      {error && !loading && (
        <div className="mx-5 mb-8 border border-[#ff5c2b]/40 bg-[#ff5c2b]/[0.08] px-6 py-5 text-sm font-semibold text-[#ff5c2b] sm:mx-8 lg:mx-12">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="border-y border-[#f2f0ea]/[0.12]">
            <div className="px-5 pb-1 pt-[26px] font-mono text-xs tracking-[0.24em] text-[#d8ff3c] sm:px-8 lg:px-12">
              YOUR ACTIVE PASSES
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3">
              {active.map((pass) => {
                const used =
                  pass.hoursPurchased > 0
                    ? Math.min(1, (pass.hoursPurchased - pass.hoursRemaining) / pass.hoursPurchased)
                    : 0;

                return (
                  <div
                    key={pass.id}
                    className="border-r border-[#f2f0ea]/10 px-5 pb-7 pt-6 sm:px-8 lg:px-12"
                  >
                    <div className="flex items-baseline justify-between gap-4">
                      <div className="min-w-0">
                        <div className="truncate text-xl font-extrabold tracking-[-0.01em]">
                          {pass.cafeName}
                        </div>
                        <div className="mt-1.5 font-mono text-[11px] tracking-[0.16em] text-[#d8ff3c]">
                          {pass.planName.toUpperCase()}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="whitespace-nowrap text-[26px] font-black tracking-[-0.02em]">
                          {pass.isUnlimited ? "∞" : pass.hoursRemaining}
                        </div>
                        <div className="font-mono text-[10px] tracking-[0.14em] text-[#f2f0ea]/35">
                          {pass.isUnlimited ? "UNLIMITED" : "HOURS LEFT"}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 h-[5px] bg-[#f2f0ea]/10">
                      <div
                        className="h-full bg-[#d8ff3c]"
                        style={{ width: pass.isUnlimited ? "100%" : `${(1 - used) * 100}%` }}
                      />
                    </div>

                    <div className="mt-2.5 flex justify-between gap-3 font-mono text-[10px] tracking-[0.14em] text-[#f2f0ea]/35">
                      <span>ENDS {formatDate(pass.expiryDate)}</span>
                      <span>
                        {pass.isUnlimited
                          ? `${pass.daysLeft} DAYS LEFT`
                          : `${pass.hoursPurchased} BOUGHT`}
                      </span>
                    </div>
                  </div>
                );
              })}

              <div className="flex flex-col justify-center gap-2.5 bg-[#d8ff3c]/[0.05] px-5 pb-7 pt-6 sm:px-8 lg:px-12">
                <div className="font-mono text-[11px] tracking-[0.2em] text-[#d8ff3c]">
                  {active.length > 0 ? "ADD A CAFÉ" : "NO PASSES YET"}
                </div>
                <div className="text-lg font-extrabold leading-[1.35]">
                  {signedIn && needsPhone
                    ? "Add your phone number to see your passes."
                    : "Pick a café below and buy its pass at the counter."}
                </div>
                <div className="font-mono text-[11px] tracking-[0.14em] text-[#f2f0ea]/40">
                  {signedIn && needsPhone ? (
                    <Link href="/profile" className="text-[#d8ff3c] hover:underline">
                      ADD YOUR NUMBER →
                    </Link>
                  ) : !signedIn ? (
                    <Link href="/login" className="text-[#d8ff3c] hover:underline">
                      SIGN IN TO SEE YOURS →
                    </Link>
                  ) : (
                    "PAID AT THE COUNTER · NO LOCK-IN"
                  )}
                </div>
              </div>
            </div>
          </div>

          {cafes.length === 0 ? (
            <div className="px-5 py-16 sm:px-8 lg:px-12">
              <h2 className="text-2xl font-black tracking-[-0.02em]">No passes on sale yet</h2>
              <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-[#f2f0ea]/55">
                Cafés set these up themselves. Ask yours whether they run hour packs or a
                monthly pass.
              </p>
              <Link
                href="/"
                className="mt-7 inline-block bg-[#d8ff3c] px-8 py-4 font-display text-[13px] font-black tracking-[0.14em] text-[#0b0b0c] transition-[filter] hover:brightness-110"
              >
                BROWSE CAFÉS →
              </Link>
            </div>
          ) : (
            <div className="grid lg:grid-cols-[minmax(280px,0.34fr)_minmax(0,1fr)]">
              <div className="border-[#f2f0ea]/[0.12] lg:border-r">
                <div className="px-5 pb-3.5 pt-6 font-mono text-[11px] tracking-[0.2em] text-[#f2f0ea]/40 sm:px-8">
                  CHOOSE A CAFÉ
                </div>
                {cafes.map((cafe) => {
                  const on = current?.cafeId === cafe.cafeId;
                  const from = Math.min(...cafe.plans.map((plan) => plan.price));

                  return (
                    <button
                      key={cafe.cafeId}
                      type="button"
                      onClick={() => setPickedCafe(cafe.cafeId)}
                      className="flex w-full items-center gap-3.5 border-t border-l-[3px] border-[#f2f0ea]/[0.08] px-5 py-5 text-left transition-colors sm:px-8"
                      style={{
                        background: on ? "rgba(216,255,60,.06)" : "transparent",
                        borderLeftColor: on ? "#d8ff3c" : "transparent",
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <div
                          className="truncate text-[17px] font-extrabold"
                          style={{ color: on ? "#f2f0ea" : "rgba(242,240,234,.7)" }}
                        >
                          {cafe.cafeName}
                        </div>
                        <div className="mt-1.5 font-mono text-[11px] tracking-[0.14em] text-[#f2f0ea]/40">
                          {cafe.plans.length} PLAN{cafe.plans.length === 1 ? "" : "S"}
                        </div>
                      </div>
                      <span
                        className="whitespace-nowrap font-mono text-[11px]"
                        style={{ color: on ? "#d8ff3c" : "rgba(242,240,234,.35)" }}
                      >
                        ₹{from}+
                      </span>
                    </button>
                  );
                })}
              </div>

              <div>
                <div className="flex flex-wrap items-end justify-between gap-5 px-5 pb-6 pt-7 sm:px-10">
                  <div>
                    <div className="font-mono text-[11px] tracking-[0.22em] text-[#d8ff3c]">
                      PASSES AT
                    </div>
                    <div className="mt-2.5 text-[clamp(28px,3vw,40px)] font-black leading-[1.05] tracking-[-0.03em]">
                      {current?.cafeName}
                    </div>
                  </div>
                  {current && (
                    <Link
                      href={current.cafeSlug ? `/cafes/${current.cafeSlug}` : `/cafes/${current.cafeId}`}
                      className="whitespace-nowrap border border-[#f2f0ea]/20 px-[22px] py-3.5 font-mono text-[11px] tracking-[0.18em] text-[#f2f0ea]/60 transition-colors hover:border-[#d8ff3c] hover:text-[#d8ff3c]"
                    >
                      VIEW CAFÉ →
                    </Link>
                  )}
                </div>

                <div className="grid border-t border-[#f2f0ea]/[0.12] sm:grid-cols-2 xl:grid-cols-3">
                  {(current?.plans ?? []).map((plan) => (
                    <div
                      key={plan.id}
                      className="flex flex-col gap-4 border-r border-[#f2f0ea]/10 px-[30px] pb-[30px] pt-[34px]"
                      style={{ background: plan.isUnlimited ? "rgba(216,255,60,.05)" : "transparent" }}
                    >
                      <span className="font-mono text-[11px] tracking-[0.24em] text-[#d8ff3c]">
                        {plan.isUnlimited
                          ? "UNLIMITED"
                          : plan.planType === "day_pass"
                            ? "DAY PASS"
                            : "HOUR PACK"}
                      </span>
                      <div>
                        <div className="whitespace-nowrap text-[clamp(32px,3.4vw,44px)] font-black leading-none tracking-[-0.03em]">
                          ₹{plan.price.toLocaleString("en-IN")}
                        </div>
                        <div className="mt-2 font-mono text-[11px] tracking-[0.16em] text-[#f2f0ea]/45">
                          {plan.validityDays} DAY{plan.validityDays === 1 ? "" : "S"}
                        </div>
                      </div>
                      <div className="text-[17px] font-extrabold leading-[1.3]">{plan.name}</div>
                      <div className="flex flex-col gap-2.5">
                        {[
                          plan.isUnlimited
                            ? "Play as long as you like, no hours counted"
                            : plan.planType === "day_pass"
                              ? "Unlimited play for the day"
                              : `${plan.hours} hours to use as you like`,
                          `Valid ${plan.validityDays} day${plan.validityDays === 1 ? "" : "s"} from purchase`,
                          plan.description,
                        ]
                          .filter(Boolean)
                          .map((perk, i) => (
                            <div
                              key={i}
                              className="flex gap-2.5 font-mono text-xs leading-[1.6] text-[#f2f0ea]/50"
                            >
                              <span className="shrink-0 text-[#f2f0ea]">·</span>
                              <span>{perk}</span>
                            </div>
                          ))}
                      </div>
                      <span className="mt-auto border border-[#f2f0ea]/20 px-5 py-4 text-center font-display text-[13px] font-black tracking-[0.14em] text-[#f2f0ea]/60">
                        BUY AT THE COUNTER
                      </span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-[#f2f0ea]/[0.12] px-5 py-7 sm:px-10">
                  <div className="font-mono text-[11px] tracking-[0.2em] text-[#f2f0ea]/40">
                    HOW A PASS WORKS
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {[
                      "Bought at the café counter — cash or UPI. There is no online checkout for passes yet.",
                      "Held against your phone number, so give the same number that is on your profile.",
                      "Spends only at the café that sold it. A pass at one café is not hours at another.",
                      "Once bought it shows up here by itself, with what is left on it.",
                    ].map((rule) => (
                      <div
                        key={rule}
                        className="border border-[#f2f0ea]/10 px-[18px] py-4 font-mono text-xs leading-[1.7] text-[#f2f0ea]/50"
                      >
                        {rule}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
