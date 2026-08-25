// src/app/dashboard/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { parseTimeToMinutes } from "@/lib/timeUtils";
import { getIndiaDateString } from "@/lib/bookingFilters";
import ActiveSessionTimer from "@/components/ActiveSessionTimer";
import LeaveReviewPrompt from "@/components/LeaveReviewPrompt";
import AccountTabs from "@/components/AccountTabs";
import ScreenTitle from "@/components/ScreenTitle";
import PullToRefresh from "@/components/ui/PullToRefresh";

type BookingRow = {
  id: string;
  cafe_id: string | null;
  user_id?: string | null;
  booking_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  total_amount?: number | null;
  status?: string | null;
  created_at?: string | null;
  hours?: number | null;
  duration?: number | null;
};

type CafeRow = {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  cover_url?: string | null;
};

type BookingWithCafe = BookingRow & { cafe?: CafeRow | null };

/** "SAT 30 AUG" — short enough to sit on one mono line beside the time. */
const shortDate = (iso?: string | null) => {
  if (!iso) return "DATE NOT SET";
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "DATE NOT SET";
  return date
    .toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" })
    .toUpperCase()
    .replace(",", "");
};

/**
 * My bookings, in the BookMyGame Site design.
 *
 * The design's upcoming card has an unlock code on it, in the way a hotel app
 * shows a door PIN. Nothing here unlocks a machine from a phone — the counter
 * does that, or the QR on the PC itself — so the panel carries the booking
 * reference instead, under the words that say what to do with it.
 *
 * RESCHEDULE went the same way: there is no reschedule anywhere in this app,
 * and a button that only cancels while claiming to move a booking is worse
 * than not offering it. Cancel and directions are real, so both stayed.
 */
export default function DashboardPage() {
  const router = useRouter();

  const [bookings, setBookings] = useState<BookingWithCafe[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"upcoming" | "history">("upcoming");

  // Bumped by pull-to-refresh. Re-running the existing effect keeps one
  // loading path rather than a second copy that can drift from it.
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(async () => {
    setRefreshKey((key) => key + 1);
    await new Promise((resolve) => setTimeout(resolve, 550));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setErrorMsg(null);

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          console.error("[Dashboard] auth error:", authError);
          throw authError;
        }

        if (!user) {
          router.replace("/login");
          return;
        }

        const { data: bookingRows, error: bookingError } = await supabase
          .from("bookings")
          .select("*")
          .eq("user_id", user.id)
          .order("booking_date", { ascending: false })
          .limit(50);

        if (bookingError) {
          console.error("Supabase bookingError:", bookingError);
          throw bookingError;
        }

        if (!bookingRows || bookingRows.length === 0) {
          if (!cancelled) setBookings([]);
          return;
        }

        const cafeIds = Array.from(
          new Set(
            bookingRows.map((b: BookingRow) => b.cafe_id).filter((id): id is string => !!id)
          )
        );

        const cafeMap = new Map<string, CafeRow>();

        if (cafeIds.length > 0) {
          const { data: cafeRows, error: cafeError } = await supabase
            .from("cafes")
            .select("id, name, address, city, cover_url")
            .in("id", cafeIds);

          if (cafeError) {
            console.error("Supabase cafeError:", cafeError);
            throw cafeError;
          }

          (cafeRows || []).forEach((c: CafeRow) => cafeMap.set(c.id, c));
        }

        const merged: BookingWithCafe[] = (bookingRows as BookingRow[]).map((b) => ({
          ...b,
          cafe: b.cafe_id ? cafeMap.get(b.cafe_id) ?? null : null,
        }));

        if (!cancelled) setBookings(merged);
      } catch (err) {
        console.error("Error loading dashboard bookings:", err);
        if (!cancelled) setErrorMsg("Could not load your bookings. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router, refreshKey]);

  const { upcoming, past } = useMemo(() => {
    if (!bookings.length)
      return { upcoming: [] as BookingWithCafe[], past: [] as BookingWithCafe[] };

    const todayStr = getIndiaDateString();

    return {
      upcoming: bookings
        .filter((b) => (b.booking_date ?? "") >= todayStr)
        .sort((a, b) => (a.booking_date ?? "").localeCompare(b.booking_date ?? "")),
      past: bookings
        .filter((b) => (b.booking_date ?? "") < todayStr)
        .sort((a, b) => (b.booking_date ?? "").localeCompare(a.booking_date ?? "")),
    };
  }, [bookings]);

  function parseTimeString(timeStr: string): { hours: number; minutes: number } | null {
    const total = parseTimeToMinutes(timeStr);
    if (total === null) return null;
    return { hours: Math.floor(total / 60), minutes: total % 60 };
  }

  function isBookingOngoing(booking: BookingWithCafe): boolean {
    const status = (booking.status || "").toLowerCase();
    if (status === "cancelled" || status === "completed") return false;
    if (!booking.booking_date || !booking.start_time) return false;

    const now = new Date();
    if (booking.booking_date !== getIndiaDateString(now)) return false;

    const parsedStart = parseTimeString(booking.start_time);
    if (!parsedStart) return false;

    const sessionStart = new Date();
    sessionStart.setHours(parsedStart.hours, parsedStart.minutes, 0, 0);

    let sessionEnd: Date;
    if (booking.end_time) {
      const parsedEnd = parseTimeString(booking.end_time);
      if (!parsedEnd) return false;
      sessionEnd = new Date();
      sessionEnd.setHours(parsedEnd.hours, parsedEnd.minutes, 0, 0);
      if (sessionEnd.getTime() < sessionStart.getTime()) {
        sessionEnd.setDate(sessionEnd.getDate() + 1);
      }
    } else if (booking.duration) {
      sessionEnd = new Date(sessionStart.getTime() + booking.duration * 60 * 1000);
    } else {
      return false;
    }

    const currentTime = now.getTime();
    return currentTime >= sessionStart.getTime() && currentTime < sessionEnd.getTime();
  }

  function stateOf(booking: BookingWithCafe) {
    if (isBookingOngoing(booking)) return { label: "ON NOW", fg: "#0b0b0c", bg: "#d8ff3c" };

    const value = (booking.status || "confirmed").toLowerCase();
    if (value === "cancelled")
      return { label: "CANCELLED", fg: "#ff5c2b", bg: "rgba(255,92,43,.12)" };
    if (value === "pending")
      return { label: "PAYMENT DUE", fg: "#ff5c2b", bg: "rgba(255,92,43,.12)" };
    if (value === "completed")
      return { label: "PLAYED", fg: "rgba(242,240,234,.5)", bg: "rgba(242,240,234,.06)" };
    return { label: "CONFIRMED", fg: "#d8ff3c", bg: "rgba(216,255,60,.12)" };
  }

  function canCancelBooking(b: BookingWithCafe) {
    const status = (b.status || "").toLowerCase();
    if (status === "cancelled") return false;
    if (!b.booking_date) return false;
    return b.booking_date >= getIndiaDateString();
  }

  async function handleCancelBooking(id: string, e: React.MouseEvent) {
    e.stopPropagation();

    const booking = bookings.find((b) => b.id === id);
    if (!booking) return;
    if (!canCancelBooking(booking)) return;

    const ok = window.confirm(
      "Are you sure you want to cancel this booking? This cannot be undone."
    );
    if (!ok) return;

    try {
      setCancelingId(id);

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        alert("Your session expired. Please sign in again.");
        return;
      }

      // The same route the booking detail page uses. Writing straight to
      // Supabase from here skipped its checks and is blocked on the cafés' ISP.
      const res = await fetch(`/api/bookings/${id}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || "Could not cancel booking");

      setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status: "cancelled" } : b)));
    } catch (err) {
      console.error("Cancel failed:", err);
      alert(err instanceof Error ? err.message : "Could not cancel this booking");
    } finally {
      setCancelingId(null);
    }
  }

  const showing = activeTab === "upcoming" ? upcoming : past;

  return (
    <PullToRefresh onRefresh={refresh}>
      <div className="min-h-screen bg-[#0b0b0c] font-display text-[#f2f0ea]">
        <AccountTabs />
        <ScreenTitle
          title="My bookings"
          meta={`${upcoming.length} UPCOMING · ${past.length} PLAYED`}
        />

        <div className="px-5 sm:px-8 lg:px-12">
          <ActiveSessionTimer />
          <LeaveReviewPrompt />
        </div>

        <div className="flex gap-2.5 px-5 pb-7 pt-4 sm:px-8 lg:px-12">
          {(["upcoming", "history"] as const).map((tab) => {
            const on = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className="border px-6 py-3 font-mono text-xs font-semibold tracking-[0.18em] transition-colors"
                style={
                  on
                    ? { background: "#d8ff3c", borderColor: "#d8ff3c", color: "#0b0b0c" }
                    : {
                        background: "transparent",
                        borderColor: "rgba(242,240,234,.16)",
                        color: "rgba(242,240,234,.55)",
                      }
                }
              >
                {tab === "upcoming" ? "UPCOMING" : "PAST"}
              </button>
            );
          })}
        </div>

        {loading && (
          <div className="border-t border-[#f2f0ea]/[0.12] px-5 py-16 font-mono text-xs tracking-[0.2em] text-[#f2f0ea]/40 sm:px-8 lg:px-12">
            LOADING YOUR BOOKINGS…
          </div>
        )}

        {errorMsg && !loading && (
          <div className="mx-5 mb-8 border border-[#ff5c2b]/40 bg-[#ff5c2b]/[0.08] px-6 py-5 text-sm font-semibold text-[#ff5c2b] sm:mx-8 lg:mx-12">
            {errorMsg}
          </div>
        )}

        {!loading && !errorMsg && showing.length === 0 && (
          <div className="border-t border-[#f2f0ea]/[0.12] px-5 py-16 sm:px-8 lg:px-12">
            <h2 className="text-2xl font-black tracking-[-0.02em]">
              {activeTab === "upcoming" ? "Nothing booked yet" : "Nothing played yet"}
            </h2>
            <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-[#f2f0ea]/55">
              {activeTab === "upcoming"
                ? "Pick a café, pick an hour, and your seat is held."
                : "Sessions you have finished show up here."}
            </p>
            <Link
              href="/"
              className="mt-7 inline-block bg-[#d8ff3c] px-8 py-4 font-display text-[13px] font-black tracking-[0.14em] text-[#0b0b0c] transition-[filter] hover:brightness-110"
            >
              BROWSE CAFÉS →
            </Link>
          </div>
        )}

        {!loading && !errorMsg && activeTab === "upcoming" && upcoming.length > 0 && (
          <div className="flex flex-col border-t border-[#f2f0ea]/[0.12]">
            {upcoming.map((booking) => {
              const state = stateOf(booking);
              const cafe = booking.cafe;
              const hours = booking.hours ?? (booking.duration ? booking.duration / 60 : null);
              const mapQuery = [cafe?.name, cafe?.address, cafe?.city].filter(Boolean).join(", ");

              return (
                <div
                  key={booking.id}
                  className="grid border-b border-[#f2f0ea]/10 lg:grid-cols-[minmax(0,1.5fr)_minmax(220px,0.7fr)]"
                >
                  <div className="border-[#f2f0ea]/10 px-5 pb-9 pt-8 sm:px-8 lg:border-r lg:px-12">
                    <div className="flex flex-wrap items-center gap-3.5">
                      <span className="font-mono text-xs tracking-[0.22em] text-[#d8ff3c]">
                        {shortDate(booking.booking_date)}
                        {booking.start_time ? ` · ${booking.start_time}` : ""}
                      </span>
                      <span
                        className="whitespace-nowrap px-2.5 py-[5px] font-mono text-[10px] tracking-[0.14em]"
                        style={{ background: state.bg, color: state.fg }}
                      >
                        {state.label}
                      </span>
                    </div>

                    <div className="mt-4 text-[clamp(28px,3vw,38px)] font-black leading-[1.05] tracking-[-0.03em]">
                      {cafe?.name || "Your booking"}
                    </div>
                    <div className="mt-2.5 font-mono text-xs tracking-[0.14em] text-[#f2f0ea]/45">
                      {[cafe?.address, cafe?.city].filter(Boolean).join(", ").toUpperCase() ||
                        "ADDRESS AT THE CAFÉ"}
                    </div>

                    <div className="mt-6 grid border border-[#f2f0ea]/[0.12] sm:grid-cols-3">
                      {[
                        {
                          k: "STARTS",
                          v: booking.start_time || "At the counter",
                        },
                        {
                          k: "ENDS",
                          v: booking.end_time || (hours ? `+${hours}h` : "—"),
                        },
                        {
                          k: "LENGTH",
                          v: hours ? `${hours} hour${hours === 1 ? "" : "s"}` : "—",
                        },
                      ].map((row) => (
                        <div key={row.k} className="border-r border-[#f2f0ea]/10 px-[18px] py-4">
                          <div className="whitespace-nowrap font-mono text-[10px] tracking-[0.18em] text-[#f2f0ea]/35">
                            {row.k}
                          </div>
                          <div className="mt-2 whitespace-nowrap text-[15px] font-extrabold">
                            {row.v}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 font-mono text-[11px] leading-[1.8] tracking-[0.1em] text-[#f2f0ea]/40">
                      Give your number at the counter and they will put you on a machine. Arrive
                      a few minutes early if you want a particular seat.
                    </div>
                  </div>

                  <div className="flex flex-col justify-between gap-6 bg-[#d8ff3c]/[0.05] px-6 pb-9 pt-8 sm:px-8">
                    <div>
                      <div className="font-mono text-[11px] tracking-[0.2em] text-[#d8ff3c]">
                        BOOKING REF
                      </div>
                      <div className="mt-3 font-mono text-[clamp(26px,3.4vw,38px)] font-semibold leading-none tracking-[0.1em]">
                        {booking.id.slice(0, 8).toUpperCase()}
                      </div>
                      <div className="mt-4 flex items-baseline justify-between gap-3.5">
                        <span className="font-mono text-[11px] tracking-[0.16em] text-[#f2f0ea]/40">
                          {(booking.status || "").toLowerCase() === "pending" ? "TO PAY" : "PAID"}
                        </span>
                        <span className="whitespace-nowrap text-lg font-extrabold">
                          ₹{(booking.total_amount ?? 0).toLocaleString("en-IN")}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2.5">
                      <Link
                        href={`/bookings/${booking.id}`}
                        className="bg-[#d8ff3c] px-5 py-4 text-center font-display text-[13px] font-black tracking-[0.14em] text-[#0b0b0c] transition-[filter] hover:brightness-110"
                      >
                        VIEW BOOKING
                      </Link>
                      {mapQuery && (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="border border-[#f2f0ea]/20 px-5 py-4 text-center font-mono text-[11px] tracking-[0.18em] text-[#f2f0ea]/60 transition-colors hover:border-[#f2f0ea] hover:text-[#f2f0ea]"
                        >
                          GET DIRECTIONS
                        </a>
                      )}
                      {canCancelBooking(booking) && (
                        <button
                          type="button"
                          onClick={(e) => handleCancelBooking(booking.id, e)}
                          disabled={cancelingId === booking.id}
                          className="px-5 py-4 text-center font-mono text-[11px] tracking-[0.18em] text-[#ff5c2b] transition-colors hover:bg-[#ff5c2b]/10 disabled:opacity-50"
                        >
                          {cancelingId === booking.id ? "CANCELLING…" : "CANCEL BOOKING"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="flex flex-wrap items-center justify-between gap-6 px-5 pb-14 pt-8 sm:px-8 lg:px-12">
              <span className="font-mono text-xs tracking-[0.16em] text-[#f2f0ea]/40">
                WANT ANOTHER SEAT THIS WEEK?
              </span>
              <Link
                href="/"
                className="border border-[#d8ff3c] px-7 py-4 font-mono text-xs font-semibold tracking-[0.2em] text-[#d8ff3c] transition-colors hover:bg-[#d8ff3c] hover:text-[#0b0b0c]"
              >
                BROWSE CAFÉS
              </Link>
            </div>
          </div>
        )}

        {!loading && !errorMsg && activeTab === "history" && past.length > 0 && (
          <div className="border-t border-[#f2f0ea]/[0.12] pb-14">
            {past.map((booking) => {
              const state = stateOf(booking);

              return (
                <Link
                  key={booking.id}
                  href={`/bookings/${booking.id}`}
                  className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2 border-b border-[#f2f0ea]/[0.08] px-5 py-[22px] transition-colors hover:bg-[#f2f0ea]/[0.03] sm:grid-cols-[96px_minmax(0,1fr)_minmax(0,0.8fr)_110px_90px] sm:px-8 lg:px-12"
                >
                  <span className="whitespace-nowrap font-mono text-[11px] tracking-[0.14em] text-[#f2f0ea]/35">
                    {shortDate(booking.booking_date)}
                  </span>
                  <span className="truncate text-base font-bold">
                    {booking.cafe?.name || "Booking"}
                  </span>
                  <span className="hidden truncate font-mono text-[11px] tracking-[0.14em] text-[#f2f0ea]/40 sm:block">
                    {booking.start_time || ""}
                    {booking.hours ? ` · ${booking.hours}H` : ""}
                  </span>
                  <span
                    className="whitespace-nowrap font-mono text-[11px] tracking-[0.14em]"
                    style={{ color: state.fg === "#0b0b0c" ? "#d8ff3c" : state.fg }}
                  >
                    {state.label}
                  </span>
                  <span className="justify-self-end whitespace-nowrap text-base font-extrabold">
                    ₹{(booking.total_amount ?? 0).toLocaleString("en-IN")}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}
