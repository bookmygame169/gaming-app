// src/app/wallet/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertCircle, Wallet, LogIn, Phone, Clock } from "lucide-react";
import { colors, fonts } from "@/lib/constants";
import { supabase } from "@/lib/supabaseClient";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
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
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default function WalletPage() {
  const [cafes, setCafes] = useState<CafeWallet[]>([]);
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

  return (
    <PullToRefresh onRefresh={load}>
      <div style={{ background: colors.dark, minHeight: "100vh", fontFamily: fonts.body }}>
        <div className="mx-auto max-w-3xl px-4 pb-16 pt-6">
          <h1
            className="text-3xl font-bold sm:text-4xl"
            style={{ fontFamily: fonts.heading, color: colors.textPrimary }}
          >
            My wallet
          </h1>
          <p className="mt-2 text-sm" style={{ color: colors.textSecondary }}>
            Money you have already paid a café, waiting to be played.
          </p>

          {loading && (
            <div className="mt-8">
              <SkeletonList count={2} lines={2} />
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
            <EmptyState
              icon={LogIn}
              title="Sign in to see your wallet"
              message="Your balance follows the phone number you give at the café."
              action={{ label: "Sign in", href: "/login" }}
            />
          )}

          {!loading && !error && signedIn && needsPhone && (
            <EmptyState
              icon={Phone}
              title="Add your phone number"
              message="Wallets are held against the number you give at the counter. Add it to your profile to see your balance here."
              action={{ label: "Add phone number", href: "/profile" }}
              tone="warning"
            />
          )}

          {!loading && !error && signedIn && !needsPhone && cafes.length === 0 && (
            <EmptyState
              icon={Wallet}
              title="No money in your wallet"
              message="Pay a café up front — cash or UPI at the counter — and they will add it here for you to play down later."
              action={{ label: "Find a café", href: "/" }}
            />
          )}

          {!loading && !error && cafes.length > 0 && (
            <div className="mt-8 grid gap-4">
              {cafes.map((cafe) => {
                const isOpen = openCafeId === cafe.cafeId;

                return (
                  <div
                    key={cafe.cafeId}
                    className="rounded-2xl p-5"
                    style={{
                      background: colors.darkCard,
                      border: `1px solid ${cafe.balance > 0 ? "rgba(34,197,94,0.3)" : colors.border}`,
                    }}
                  >
                    <p className="text-xs" style={{ color: colors.textMuted }}>
                      {cafe.cafeName}
                    </p>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-3xl font-bold" style={{ color: colors.green }}>
                        ₹{cafe.balance.toLocaleString("en-IN")}
                      </span>
                      <span className="text-xs" style={{ color: colors.textMuted }}>
                        to spend here
                      </span>
                    </div>

                    <p className="mt-3 text-xs" style={{ color: colors.textMuted }}>
                      {/* Said plainly, because a balance that only works at one
                          venue is exactly the thing people assume otherwise. */}
                      Usable at {cafe.cafeName} only. Just give your number at the counter.
                    </p>

                    {cafe.history.length > 0 && (
                      <>
                        <button
                          onClick={() => setOpenCafeId(isOpen ? null : cafe.cafeId)}
                          className="mt-4 flex items-center gap-1.5 text-xs font-semibold"
                          style={{ color: colors.cyan }}
                        >
                          <Clock size={13} />
                          {isOpen ? "Hide history" : "See every top-up and spend"}
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
                                    {entry.paymentMode ? ` · ${entry.paymentMode}` : ""}
                                  </p>
                                  <p className="text-[11px]" style={{ color: colors.textMuted }}>
                                    {formatDate(entry.createdAt)}
                                  </p>
                                </div>
                                <span
                                  className="text-sm font-bold"
                                  style={{ color: entry.amount >= 0 ? colors.green : colors.orange }}
                                >
                                  {entry.amount >= 0 ? "+" : "−"}₹{Math.abs(entry.amount)}
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
              Only a café can add money to your wallet, at the counter. Balances are kept per
              café, so each one is separate.
            </p>
          )}
        </div>
      </div>
    </PullToRefresh>
  );
}
