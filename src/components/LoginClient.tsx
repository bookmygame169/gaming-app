// src/components/LoginClient.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

/**
 * Sign in, in the BookMyGame Sign In design.
 *
 * One component serves both drawings. The DOM is in the mobile file's order —
 * hero, proof, sign in, then what you get — and at lg the grid places the
 * sign-in rail down the right and the rest in two rows on the left, which is
 * the desktop split. Writing it the other way round would have needed the
 * sign-in block twice, and a page with two sign-in buttons in the markup is a
 * page where one of them eventually goes stale.
 *
 * The design offers a phone number and SEND OTP under the Google button. That
 * is not built here: this app has never had phone sign-in, Supabase needs an
 * SMS provider configured before it can send a code, and there is none. A live
 * SEND OTP that fails would be the most inviting control on the page.
 *
 * The figures are the café list's own, so they say 1 and 12 rather than the
 * mockup's 12 and 184, and none of them claims anything is open 24/7 - these
 * cafés close at 10.
 */
type Props = {
  cafeCount: number;
  seatCount: number;
  cheapestHour: number | null;
  ticker: string;
};

const BENEFITS = [
  {
    n: "01",
    title: "Live seat counts",
    note: "See what is free at each café before you leave the house.",
  },
  {
    n: "02",
    title: "Credit and passes",
    note: "Your balance and pass hours, held per café, in one place.",
  },
  {
    n: "03",
    title: "Points every visit",
    note: "Earned at the counter, spent on whatever your café puts up.",
  },
  {
    n: "04",
    title: "Scan and play",
    note: "Scan the code on a locked machine and it starts your session.",
  },
];

export default function LoginClient({ cafeCount, seatCount, cheapestHour, ticker }: Props) {
  const [loading, setLoading] = useState(false);

  const signInWithGoogle = async () => {
    try {
      setLoading(true);

      // The callback route reads any redirect saved before the visitor was
      // sent here, so a booking interrupted by sign-in resumes where it was.
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
    } catch (err) {
      console.error("Google login error:", err);
    } finally {
      setLoading(false);
    }
  };

  const proof = [
    { value: String(cafeCount), label: "PARTNER CAFÉS", accent: false },
    { value: String(seatCount), label: "SEATS BOOKABLE", accent: false },
    {
      value: cheapestHour !== null ? `₹${cheapestHour}` : "—",
      label: "FROM, PER HOUR",
      accent: true,
    },
  ];

  return (
    <main className="flex min-h-screen flex-col bg-[#0b0b0c] font-display text-[#f2f0ea]">
      {ticker && (
        <Ticker text={ticker} className="flex h-10 border-b border-[#f2f0ea]/[0.12] lg:hidden" />
      )}

      <div className="grid flex-1 lg:grid-cols-[1.25fr_0.75fr]">
        {/* hero + proof — top left on desktop, first on a phone */}
        <div className="min-w-0 border-b border-[#f2f0ea]/[0.12] lg:col-start-1 lg:row-start-1 lg:border-b-0 lg:border-r">
          <div className="px-[18px] pb-6 pt-7 sm:px-8 lg:px-14 lg:pb-12 lg:pt-16 2xl:px-16 2xl:pt-20">
            <div className="flex items-center gap-2.5 font-mono text-[10px] tracking-[0.2em] text-[#f2f0ea]/45 sm:text-xs sm:tracking-[0.26em]">
              <span className="block h-[7px] w-[7px] animate-pulse bg-[#d8ff3c] sm:h-2 sm:w-2" />
              {seatCount > 0
                ? `${seatCount} SEATS BOOKABLE IN DELHI NCR`
                : "GAMING CAFÉS IN DELHI NCR"}
            </div>

            <h1 className="mt-4 text-[clamp(42px,5.4vw,110px)] font-black uppercase leading-[0.9] tracking-[-0.045em] text-balance sm:mt-6">
              Reserve your
              <br />
              gaming <span className="text-[#d8ff3c]">seat.</span>
            </h1>

            <p className="mt-4 max-w-[520px] font-mono text-[13px] leading-[1.85] text-[#f2f0ea]/50 sm:mt-6 sm:text-base">
              Sign in once and your rig, your hours and your café credit follow you across every
              partner café in Delhi NCR. No calls, no queues.
            </p>
          </div>

          <div className="grid grid-cols-3 border-y border-[#f2f0ea]/[0.12] lg:mx-14 lg:mb-2 lg:border 2xl:mx-16">
            {proof.map((item) => (
              <div key={item.label} className="border-r border-[#f2f0ea]/10 px-3.5 py-4 sm:px-[22px] sm:py-6">
                <div
                  className="whitespace-nowrap text-[26px] font-black leading-none tracking-[-0.03em] sm:text-[clamp(30px,3.2vw,44px)]"
                  style={{ color: item.accent ? "#d8ff3c" : "#f2f0ea" }}
                >
                  {item.value}
                </div>
                <div className="mt-2.5 font-mono text-[9px] tracking-[0.14em] text-[#f2f0ea]/40 sm:text-[11px] sm:tracking-[0.18em]">
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* the sign-in rail — full height down the right on desktop */}
        <div className="flex min-w-0 flex-col border-[#f2f0ea]/[0.12] lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="border-b border-[#f2f0ea]/[0.12] px-[18px] pb-6 pt-7 sm:px-8 lg:px-10 lg:pt-12">
            <div className="font-mono text-[10px] tracking-[0.26em] text-[#d8ff3c] sm:text-xs">
              SIGN IN
            </div>
            <h2 className="mt-4 text-[clamp(28px,3.2vw,44px)] font-black uppercase leading-[1.02] tracking-[-0.03em]">
              Pick up
              <br className="hidden lg:block" /> where you
              <br className="hidden lg:block" /> left off
            </h2>
            <p className="mt-4 font-mono text-[13px] leading-[1.8] text-[#f2f0ea]/45">
              One tap. We only read your name and email to build your gaming profile.
            </p>
            <p className="mt-3 font-mono text-[11px] leading-[1.8] tracking-[0.1em] text-[#f2f0ea]/[0.32]">
              NEW HERE? SIGNING IN CREATES YOUR ACCOUNT.
            </p>
          </div>

          <div className="border-b border-[#f2f0ea]/[0.12] px-[18px] py-7 sm:px-8 lg:px-10">
            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={loading}
              className="flex h-[60px] w-full items-center justify-center gap-3 bg-[#f2f0ea] transition-[filter,transform] hover:-translate-y-0.5 hover:brightness-[1.06] active:translate-y-0 disabled:opacity-70 sm:h-16"
            >
              <GoogleIcon />
              <span className="font-display text-sm font-black tracking-[0.06em] text-[#0b0b0c] sm:text-[15px]">
                {loading ? "CONNECTING…" : "CONTINUE WITH GOOGLE"}
              </span>
            </button>

            <p className="mt-4 font-mono text-[11px] leading-[1.8] tracking-[0.1em] text-[#f2f0ea]/[0.32]">
              GOOGLE IS THE ONLY WAY IN FOR NOW. YOUR PHONE NUMBER IS ASKED FOR LATER, ON YOUR
              PROFILE — THAT IS WHAT THE CAFÉS HOLD YOUR CREDIT AND HOURS AGAINST.
            </p>
          </div>

          <div className="border-b border-[#f2f0ea]/[0.12] px-[18px] py-6 sm:px-8 lg:px-10">
            <div className="font-mono text-[10px] tracking-[0.18em] text-[#f2f0ea]/40 sm:text-[11px] sm:tracking-[0.2em]">
              RUN A CAFÉ?
            </div>
            <div className="mt-3 flex items-center justify-between gap-4">
              <span className="text-[15px] font-extrabold sm:text-base">Partner console</span>
              <Link
                href="/owner/login"
                className="whitespace-nowrap font-mono text-[10px] tracking-[0.16em] text-[#d8ff3c] transition-opacity hover:opacity-80 sm:text-[11px]"
              >
                SIGN IN →
              </Link>
            </div>
          </div>

          <div className="mt-auto bg-[#f2f0ea]/[0.02] px-[18px] pb-8 pt-5 sm:px-8 lg:px-10 lg:pb-7">
            <div className="font-mono text-[10px] leading-[1.9] tracking-[0.1em] text-[#f2f0ea]/[0.32] sm:text-[11px]">
              BY CONTINUING YOU AGREE TO OUR{" "}
              <Link href="/terms" className="hover:text-[#d8ff3c]">
                TERMS
              </Link>{" "}
              AND{" "}
              <Link href="/privacy" className="hover:text-[#d8ff3c]">
                PRIVACY POLICY
              </Link>
              .
            </div>
            <div className="mt-4 flex items-center justify-between gap-4 font-mono text-[10px] tracking-[0.16em] text-[#f2f0ea]/[0.28] sm:text-[11px]">
              <Link href="/" className="text-[#f2f0ea]/50 transition-colors hover:text-[#d8ff3c]">
                ← BACK TO HOME
              </Link>
              <span className="whitespace-nowrap">V1.0 BETA</span>
            </div>
          </div>
        </div>

        {/* what you get — under the hero on desktop, under sign-in on a phone */}
        <div className="flex min-w-0 flex-col lg:col-start-1 lg:row-start-2 lg:border-r lg:border-[#f2f0ea]/[0.12]">
          <div className="px-[18px] pb-1.5 pt-6 font-mono text-[10px] tracking-[0.2em] text-[#f2f0ea]/35 sm:px-8 sm:text-[11px] sm:tracking-[0.22em] lg:px-14 lg:pt-10 2xl:px-16">
            WHAT YOU GET
          </div>

          <div className="lg:px-14 2xl:px-16">
            {BENEFITS.map((benefit) => (
              <div
                key={benefit.n}
                className="flex items-baseline gap-3.5 border-t border-[#f2f0ea]/[0.08] px-[18px] py-3.5 sm:px-8 sm:gap-[18px] lg:px-0 lg:py-4"
              >
                <span className="w-[22px] shrink-0 font-mono text-[11px] text-[#d8ff3c] sm:w-[26px] sm:text-xs">
                  {benefit.n}
                </span>
                <div className="min-w-0 lg:flex lg:items-baseline lg:gap-[18px]">
                  <div className="shrink-0 text-[15px] font-bold sm:text-base">{benefit.title}</div>
                  <div className="mt-1.5 font-mono text-[11px] leading-[1.7] text-[#f2f0ea]/[0.42] lg:mt-0 lg:text-xs lg:leading-[1.6]">
                    {benefit.note}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {ticker && (
            <Ticker
              text={ticker}
              className="mt-auto hidden h-[46px] border-t border-[#f2f0ea]/[0.12] lg:flex"
            />
          )}
        </div>
      </div>
    </main>
  );
}

function Ticker({ text, className }: { text: string; className: string }) {
  return (
    <div
      className={`w-full min-w-0 shrink-0 items-center overflow-hidden bg-[#f2f0ea]/[0.02] ${className}`}
    >
      <div className="animate-[bmg-marquee_42s_linear_infinite] whitespace-nowrap font-mono text-[11px] tracking-[0.22em] text-[#f2f0ea]/30 sm:text-xs sm:tracking-[0.26em]">
        {text}
        {text}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.4c-.2 1.2-.9 2.3-1.9 3.1l3.1 2.4C20.4 18.2 21.3 15.8 21.3 13c0-.7-.1-1.3-.2-1.9H12z"
      />
      <path
        fill="#34A853"
        d="M6.5 14.3l-.8.6-2.5 1.9C4.6 19.8 8.1 21.6 12 21.6c2.6 0 4.7-.9 6.2-2.1l-3.1-2.4c-.8.6-1.8 1-3.1 1-2.4 0-4.4-1.6-5.1-3.8z"
      />
      <path
        fill="#4A90E2"
        d="M3.2 7.5C2.4 8.8 2 10.3 2 11.8s.4 3 1.2 4.3l3.3-2.6c-.2-.6-.4-1.2-.4-1.9s.1-1.3.4-1.9L3.2 7.5z"
      />
      <path
        fill="#FBBC05"
        d="M12 5.3c1.4 0 2.6.5 3.5 1.3l2.6-2.6C16.7 2.8 14.6 2 12 2 8.1 2 4.6 3.8 3.2 7.5l3.3 2.6c.7-2.2 2.7-3.8 5.5-3.8z"
      />
    </svg>
  );
}
