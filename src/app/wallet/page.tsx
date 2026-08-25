// src/app/wallet/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import AccountTabs from "@/components/AccountTabs";
import ScreenTitle from "@/components/ScreenTitle";
import PullToRefresh from "@/components/ui/PullToRefresh";

type Entry = {
  id: string;
  amount: number;
  reason: string;
  paymentMode: string | null;
  note: string | null;
  createdAt: string;
};

type CafeWallet = {
  cafeId: string;
  cafeName: string;
  balance: number;
  history: Entry[];
};

const REASON_LABELS: Record<string, string> = {
  topup: "Money added",
  spend: "Used for a session",
  refund: "Refunded to you",
  correction: "Adjusted by the café",
};

const formatDate = (iso: string) =>
  new Date(iso)
    .toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
    .toUpperCase();

/**
 * The wallet, in the BookMyGame Site design.
 *
 * The design's right-hand column sells top-ups: three amounts with bonuses, a
 * choice of card or UPI, an ADD MONEY button. None of that exists here — money
 * goes in at the counter and nowhere else — so that column says how it really
 * works instead. A button that takes payment the app cannot take would be the
 * one part of this screen a customer actually acts on, and it would be a lie.
 *
 * Everything else is the design as drawn: the balance oversized on its lime
 * wash, café credit broken out underneath because a balance at one café is not
 * spendable at another, and the ledger as dated rows.
 */
export default function WalletPage() {
  const [cafes, setCafes] = useState<CafeWallet[]>([]);
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

      const res = await fetch("/api/wallet/mine", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(data.error || "Could not load your wallet");

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

  const total = cafes.reduce((sum, cafe) => sum + (Number(cafe.balance) || 0), 0);

  // One ledger across cafés, newest first, because the question a customer has
  // is "where did my money go", not "what happened at this café".
  const activity = cafes
    .flatMap((cafe) => cafe.history.map((entry) => ({ ...entry, cafeName: cafe.cafeName })))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20);

  return (
    <PullToRefresh onRefresh={load}>
      <div className="min-h-screen bg-[#0b0b0c] font-display text-[#f2f0ea]">
        <AccountTabs />
        <ScreenTitle title="Wallet" meta="MONEY PAID UP FRONT · SPENT BY THE HOUR" />

        {loading && (
          <div className="border-t border-[#f2f0ea]/[0.12] px-5 py-16 font-mono text-xs tracking-[0.2em] text-[#f2f0ea]/40 sm:px-8 lg:px-12">
            LOADING YOUR BALANCE…
          </div>
        )}

        {error && !loading && (
          <div className="mx-5 mt-4 border border-[#ff5c2b]/40 bg-[#ff5c2b]/[0.08] px-6 py-5 text-sm font-semibold text-[#ff5c2b] sm:mx-8 lg:mx-12">
            {error}
          </div>
        )}

        {!loading && !error && !signedIn && (
          <Prompt
            title="Sign in to see your wallet"
            body="Your balance follows the phone number you give at the café."
            action={{ href: "/login", label: "SIGN IN →" }}
          />
        )}

        {!loading && !error && signedIn && needsPhone && (
          <Prompt
            title="Add your phone number"
            body="Wallets are held against the number you give at the counter. Add it to your profile and your balance shows up here."
            action={{ href: "/profile", label: "ADD YOUR NUMBER →" }}
          />
        )}

        {!loading && !error && signedIn && !needsPhone && (
          <div className="grid border-t border-[#f2f0ea]/[0.12] lg:grid-cols-[1.4fr_.6fr]">
            <div className="border-[#f2f0ea]/[0.12] lg:border-r">
              <div className="flex flex-wrap items-end justify-between gap-6 bg-[#d8ff3c]/[0.06] px-5 py-10 sm:px-8 lg:px-12">
                <div>
                  <div className="font-mono text-xs tracking-[0.24em] text-[#d8ff3c]">
                    SPENDABLE BALANCE
                  </div>
                  <div className="mt-3.5 whitespace-nowrap text-[clamp(52px,6vw,80px)] font-black leading-[0.9] tracking-[-0.04em]">
                    ₹{total.toLocaleString("en-IN")}
                  </div>
                  <div className="mt-3 font-mono text-xs tracking-[0.14em] text-[#f2f0ea]/45">
                    {cafes.length === 0
                      ? "NOTHING IN YOUR WALLET YET"
                      : `ACROSS ${cafes.length} CAFÉ${cafes.length === 1 ? "" : "S"}`}
                  </div>
                </div>
                <Link
                  href="/"
                  className="bg-[#d8ff3c] px-[34px] py-5 font-display text-[15px] font-black tracking-[0.14em] text-[#0b0b0c] transition-[filter] hover:brightness-110"
                >
                  PLAY IT DOWN →
                </Link>
              </div>

              {cafes.length > 0 && (
                <>
                  <div className="px-5 pb-2.5 pt-8 font-mono text-[11px] tracking-[0.2em] text-[#f2f0ea]/40 sm:px-8 lg:px-12">
                    CAFÉ CREDIT — SPENDS ONLY AT THAT CAFÉ
                  </div>
                  <div className="grid gap-x-7 px-5 pb-7 sm:grid-cols-2 sm:px-8 lg:grid-cols-3 lg:px-12">
                    {cafes.map((cafe) => (
                      <div key={cafe.cafeId} className="border-t border-[#f2f0ea]/10 py-[22px]">
                        <div className="truncate text-base font-extrabold">{cafe.cafeName}</div>
                        <div
                          className="mt-3 whitespace-nowrap text-[30px] font-black tracking-[-0.03em]"
                          style={{ color: cafe.balance > 0 ? "#d8ff3c" : "rgba(242,240,234,.35)" }}
                        >
                          ₹{cafe.balance.toLocaleString("en-IN")}
                        </div>
                        <div className="mt-2 font-mono text-[11px] tracking-[0.14em] text-[#f2f0ea]/35">
                          {cafe.history.length} ENTR{cafe.history.length === 1 ? "Y" : "IES"}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {activity.length > 0 && (
                <div className="px-5 pb-10 sm:px-8 lg:px-12">
                  <div className="flex items-center gap-[18px] border-t border-[#f2f0ea]/[0.12] pb-4 pt-6">
                    <span className="font-mono text-[11px] tracking-[0.2em] text-[#f2f0ea]/40">
                      RECENT ACTIVITY
                    </span>
                    <span className="h-px flex-1 bg-[#f2f0ea]/10" />
                  </div>
                  {activity.map((entry) => (
                    <div
                      key={entry.id}
                      className="grid grid-cols-[62px_1fr_auto] items-center gap-5 border-b border-[#f2f0ea]/[0.07] py-[17px] sm:grid-cols-[96px_1fr_auto]"
                    >
                      <span className="whitespace-nowrap font-mono text-[11px] tracking-[0.14em] text-[#f2f0ea]/35">
                        {formatDate(entry.createdAt)}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[15px] font-bold">
                          {REASON_LABELS[entry.reason] || entry.reason}
                        </div>
                        <div className="mt-1 truncate font-mono text-[11px] tracking-[0.12em] text-[#f2f0ea]/35">
                          {entry.cafeName}
                          {entry.paymentMode ? ` · ${entry.paymentMode.toUpperCase()}` : ""}
                        </div>
                      </div>
                      <span
                        className="whitespace-nowrap text-[17px] font-extrabold"
                        style={{ color: entry.amount >= 0 ? "#d8ff3c" : "#ff5c2b" }}
                      >
                        {entry.amount >= 0 ? "+" : "−"}₹{Math.abs(entry.amount).toLocaleString("en-IN")}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {cafes.length === 0 && (
                <div className="px-5 py-12 sm:px-8 lg:px-12">
                  <p className="max-w-[46ch] text-[15px] leading-relaxed text-[#f2f0ea]/60">
                    Nothing here yet. Pay a café up front — cash or UPI at the counter — and
                    they put it on your number for you to play down later.
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col border-t border-[#f2f0ea]/[0.12] lg:border-t-0">
              <div className="border-b border-[#f2f0ea]/[0.12] px-8 py-[26px]">
                <div className="font-mono text-xs tracking-[0.24em] text-[#d8ff3c]">
                  HOW MONEY GETS IN
                </div>
                <div className="mt-1.5 font-mono text-[11px] tracking-[0.14em] text-[#f2f0ea]/35">
                  AT THE COUNTER, NOT ONLINE
                </div>
              </div>

              {[
                { n: "01", t: "Pay the café", d: "Cash or UPI at the counter, any amount you like." },
                { n: "02", t: "Give your number", d: "The same number on your profile. That is what the balance is held against." },
                { n: "03", t: "Play it down", d: "Every session comes off the balance at that café until it runs out." },
              ].map((step) => (
                <div
                  key={step.n}
                  className="flex gap-4 border-b border-[#f2f0ea]/[0.07] px-8 py-[22px]"
                >
                  <span className="font-mono text-[11px] tracking-[0.14em] text-[#d8ff3c]">
                    {step.n}
                  </span>
                  <div>
                    <div className="text-[15px] font-bold">{step.t}</div>
                    <div className="mt-1.5 text-[13px] leading-relaxed text-[#f2f0ea]/45">
                      {step.d}
                    </div>
                  </div>
                </div>
              ))}

              <div className="bg-[#f2f0ea]/[0.03] px-8 py-[26px]">
                <div className="font-mono text-[11px] tracking-[0.2em] text-[#f2f0ea]/40">
                  KEPT PER CAFÉ
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-[#f2f0ea]/55">
                  Each café holds its own balance. Money paid at one is not spendable at
                  another — which is why they are listed separately rather than added up into
                  a single number you could try to spend anywhere.
                </p>
              </div>
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
