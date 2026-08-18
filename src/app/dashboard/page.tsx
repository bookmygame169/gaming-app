// src/app/dashboard/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { formatDate, parseTimeToMinutes } from "@/lib/timeUtils";
import { getIndiaDateString } from "@/lib/bookingFilters";
import {
  Calendar,
  Clock,
  MapPin,
  DollarSign,
  CheckCircle,
  XCircle,
  Clock4,
  Gamepad2,
  TrendingUp,
  Zap,
  ChevronRight,
  ExternalLink,
  Loader2,
  AlertCircle,
  History,
  CalendarCheck,
  CreditCard,
} from "lucide-react";
import ActiveSessionTimer from "@/components/ActiveSessionTimer";
import LeaveReviewPrompt from "@/components/LeaveReviewPrompt";
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

export default function DashboardPage() {
  const router = useRouter();

  const [bookings, setBookings] = useState<BookingWithCafe[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"upcoming" | "history">("upcoming");

  // Bumped by pull-to-refresh. Re-running the existing effect keeps one
  // loading path rather than a second copy that can drift from it.
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(async () => {
    setRefreshKey((key) => key + 1);
    // The effect below is what actually reloads; this gives the gesture
    // something to wait on so the spinner is not gone before the data lands.
    await new Promise((resolve) => setTimeout(resolve, 550));
  }, []);

  // Load user + bookings
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

        // Get user name from metadata
        const name = user.user_metadata?.full_name || user.email?.split("@")[0] || "Gamer";
        setUserName(name);

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
            bookingRows
              .map((b: BookingRow) => b.cafe_id)
              .filter((id): id is string => !!id)
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

          (cafeRows || []).forEach((c: CafeRow) => {
            cafeMap.set(c.id, c);
          });
        }

        const merged: BookingWithCafe[] = (bookingRows as BookingRow[]).map(
          (b) => ({
            ...b,
            cafe: b.cafe_id ? cafeMap.get(b.cafe_id) ?? null : null,
          })
        );

        if (!cancelled) setBookings(merged);
      } catch (err) {
        console.error("Error loading dashboard bookings:", err);
        if (!cancelled) {
          setErrorMsg("Could not load your bookings. Please try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router, refreshKey]);

  // Split upcoming vs past
  const { upcoming, past } = useMemo(() => {
    if (!bookings.length)
      return {
        upcoming: [] as BookingWithCafe[],
        past: [] as BookingWithCafe[],
      };

    const todayStr = getIndiaDateString();

    const upcomingBookings = bookings
      .filter((b) => {
        const date = b.booking_date ?? "";
        return date >= todayStr;
      })
      .sort((a, b) => (a.booking_date ?? "").localeCompare(b.booking_date ?? ""));

    const pastBookings = bookings
      .filter((b) => {
        const date = b.booking_date ?? "";
        return date < todayStr;
      })
      .sort((a, b) => (b.booking_date ?? "").localeCompare(a.booking_date ?? ""));

    return { upcoming: upcomingBookings, past: pastBookings };
  }, [bookings]);

  // Stats
  const stats = useMemo(() => {
    const total = bookings.length;
    const confirmed = bookings.filter(b => (b.status || "").toLowerCase() === "confirmed").length;
    const totalSpent = bookings.reduce((sum, b) => sum + (b.total_amount ?? 0), 0);
    const totalHours = bookings.reduce((sum, b) => sum + (b.hours ?? 1), 0);
    return { total, confirmed, totalSpent, totalHours };
  }, [bookings]);



  function formatTime(timeStr?: string | null) {
    if (!timeStr) return "Time not set";
    return timeStr;
  }

  // Shares the one parser; the shape is only different because the callers
  // below want hours and minutes rather than minutes from midnight.
  function parseTimeString(timeStr: string): { hours: number; minutes: number } | null {
    const total = parseTimeToMinutes(timeStr);
    if (total === null) return null;
    return { hours: Math.floor(total / 60), minutes: total % 60 };
  }


  // Check if booking is currently active (on-going)
  function isBookingOngoing(booking: BookingWithCafe): boolean {
    const status = (booking.status || '').toLowerCase();
    if (status === 'cancelled' || status === 'completed') return false;
    if (!booking.booking_date || !booking.start_time) return false;

    const now = new Date();
    const todayStr = getIndiaDateString(now);

    // Only check today's bookings
    if (booking.booking_date !== todayStr) return false;

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

  function getStatusInfo(status?: string | null, isOngoing?: boolean) {
    if (isOngoing) {
      return {
        label: "On-going",
        bg: "bg-gradient-to-r from-cyan-500/10 to-cyan-500/5",
        border: "border-cyan-500/20",
        color: "text-cyan-400",
        icon: <Zap className="w-4 h-4" />,
      };
    }

    const value = (status || "confirmed").toLowerCase();

    if (value === "cancelled") {
      return {
        label: "Cancelled",
        bg: "bg-gradient-to-r from-red-500/10 to-red-500/5",
        border: "border-red-500/20",
        color: "text-red-400",
        icon: <XCircle className="w-4 h-4" />,
      };
    }
    if (value === "pending") {
      return {
        label: "Pending",
        bg: "bg-gradient-to-r from-amber-500/10 to-amber-500/5",
        border: "border-amber-500/20",
        color: "text-amber-400",
        icon: <Clock4 className="w-4 h-4" />,
      };
    }
    return {
      label: "Confirmed",
      bg: "bg-gradient-to-r from-emerald-500/10 to-emerald-500/5",
      border: "border-emerald-500/20",
      color: "text-emerald-400",
      icon: <CheckCircle className="w-4 h-4" />,
    };
  }

  function canCancelBooking(b: BookingWithCafe) {
    const status = (b.status || "").toLowerCase();
    if (status === "cancelled") return false;
    if (!b.booking_date) return false;
    const todayStr = getIndiaDateString();
    return b.booking_date >= todayStr;
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

      setBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: "cancelled" } : b))
      );
    } catch (err) {
      console.error("Error cancelling booking:", err);
      alert(err instanceof Error ? err.message : "Could not cancel booking. Please try again.");
    } finally {
      setCancelingId(null);
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-950">
        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* Skeleton Header */}
          <div className="mb-8">
            <div className="h-4 w-32 bg-gray-800 rounded-full mb-2 animate-pulse"></div>
            <div className="h-8 w-48 bg-gray-800 rounded-lg mb-2 animate-pulse"></div>
            <div className="h-4 w-64 bg-gray-800 rounded-full animate-pulse"></div>
          </div>

          {/* Skeleton Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-gray-800/50 rounded-2xl animate-pulse"></div>
            ))}
          </div>

          {/* Skeleton Tabs */}
          <div className="flex gap-4 mb-6">
            <div className="h-10 w-32 bg-gray-800 rounded-lg animate-pulse"></div>
            <div className="h-10 w-32 bg-gray-800 rounded-lg animate-pulse"></div>
          </div>

          {/* Skeleton Cards */}
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-gray-800/30 rounded-xl animate-pulse"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={refresh}>
      <style jsx global>{`
        .dashboard-bg {
          background: linear-gradient(135deg, 
            #08080c 0%, 
            #0a0a10 50%, 
            #08080c 100%);
          min-height: 100vh;
        }

        .glass-card {
          background: linear-gradient(145deg, 
            rgba(16, 16, 22, 0.8) 0%, 
            rgba(10, 10, 15, 0.9) 100%);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 
            0 8px 32px rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }

        .stat-card {
          background: linear-gradient(135deg, 
            rgba(255, 7, 58, 0.1) 0%,
            rgba(0, 240, 255, 0.1) 100%);
          border: 1px solid rgba(255, 7, 58, 0.2);
          position: relative;
          overflow: hidden;
          transition: all 0.3s ease;
        }

        .stat-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 40px rgba(255, 7, 58, 0.15);
        }

        .booking-card {
          background: linear-gradient(145deg, 
            rgba(16, 16, 22, 0.9) 0%,
            rgba(10, 10, 15, 0.95) 100%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          cursor: pointer;
          position: relative;
          overflow: hidden;
        }

        .booking-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(135deg, 
            rgba(255, 7, 58, 0.1) 0%,
            rgba(0, 240, 255, 0.05) 100%);
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .booking-card:hover::before {
          opacity: 1;
        }

        .booking-card:hover {
          border-color: rgba(255, 7, 58, 0.3);
          transform: translateY(-4px);
          box-shadow: 
            0 12px 40px rgba(255, 7, 58, 0.2),
            0 0 0 1px rgba(255, 7, 58, 0.1);
        }

        .status-badge {
          background: linear-gradient(135deg, 
            rgba(34, 197, 94, 0.15) 0%,
            rgba(34, 197, 94, 0.05) 100%);
          border: 1px solid rgba(34, 197, 94, 0.2);
        }

        .cancel-btn {
          background: linear-gradient(135deg, 
            rgba(239, 68, 68, 0.15) 0%,
            rgba(239, 68, 68, 0.05) 100%);
          border: 1px solid rgba(239, 68, 68, 0.2);
          transition: all 0.2s ease;
        }

        .cancel-btn:hover {
          background: rgba(239, 68, 68, 0.25);
          transform: scale(1.05);
        }

        .tab-button {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          transition: all 0.3s ease;
        }

        .tab-button.active {
          background: linear-gradient(135deg, 
            rgba(255, 7, 58, 0.2) 0%,
            rgba(0, 240, 255, 0.1) 100%);
          border-color: rgba(255, 7, 58, 0.3);
          box-shadow: 0 4px 20px rgba(255, 7, 58, 0.15);
        }

        .empty-state {
          background: linear-gradient(145deg, 
            rgba(16, 16, 22, 0.5) 0%,
            rgba(10, 10, 15, 0.6) 100%);
          border: 2px dashed rgba(255, 255, 255, 0.1);
        }

        .primary-btn {
          background: linear-gradient(135deg, 
            #ff073a 0%, 
            #ff3366 100%);
          box-shadow: 
            0 8px 32px rgba(255, 7, 58, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.2);
          transition: all 0.3s ease;
        }

        .primary-btn:hover {
          transform: translateY(-2px);
          box-shadow: 
            0 12px 40px rgba(255, 7, 58, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.3);
        }

        .primary-btn:active {
          transform: translateY(0);
        }
      `}</style>

      <div className="dashboard-bg text-white">
        {/* Background Effects */}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#ff073a]/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#00f0ff]/10 rounded-full blur-3xl"></div>
        </div>

        <div className="max-w-6xl mx-auto px-4 py-8 relative z-10">
          {/* Header */}
          <header className="mb-10">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-xl bg-gradient-to-br from-[#ff073a]/20 to-[#00f0ff]/20">
                    <Gamepad2 className="w-6 h-6 text-white" />
                  </div>
                  <span className="text-sm text-zinc-400 uppercase tracking-wider">
                    My Dashboard
                  </span>
                </div>
                <h1 className="text-3xl md:text-4xl font-bold mb-2" style={{ fontFamily: 'Orbitron, sans-serif' }}>
                  Welcome back, <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ff073a] to-[#00f0ff]">{userName}</span>!
                </h1>
                <p className="text-zinc-400" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Manage your gaming sessions and track your activity
                </p>
              </div>

              <button
                onClick={() => router.push("/")}
                className="primary-btn hidden md:flex items-center gap-2 px-6 py-3 rounded-xl font-bold"
                style={{ fontFamily: 'Orbitron, sans-serif' }}
              >
                <Zap className="w-4 h-4" />
                Book New Session
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Mobile Book Button */}
            <button
              onClick={() => router.push("/")}
              className="primary-btn w-full md:hidden flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold mb-6"
              style={{ fontFamily: 'Orbitron, sans-serif' }}
            >
              <Zap className="w-4 h-4" />
              Book New Gaming Session
            </button>

            {/* Active Session Timer - Shows when user has an active session */}
            <ActiveSessionTimer />

            {/* Asks about a visit that has already happened. Shows nothing when
                there is nothing left to rate. */}
            <LeaveReviewPrompt />

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="stat-card rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <CalendarCheck className="w-8 h-8 text-[#ff073a]" />
                  <span className="text-xs text-zinc-400">Total</span>
                </div>
                <div className="text-2xl font-bold mb-1" style={{ fontFamily: 'Orbitron, sans-serif' }}>
                  {stats.total}
                </div>
                <div className="text-sm text-zinc-400">Bookings</div>
              </div>

              <div className="stat-card rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <TrendingUp className="w-8 h-8 text-[#00f0ff]" />
                  <span className="text-xs text-zinc-400">Upcoming</span>
                </div>
                <div className="text-2xl font-bold mb-1" style={{ fontFamily: 'Orbitron, sans-serif' }}>
                  {upcoming.length}
                </div>
                <div className="text-sm text-zinc-400">Sessions</div>
              </div>

              <div className="stat-card rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <Clock className="w-8 h-8 text-emerald-400" />
                  <span className="text-xs text-zinc-400">Hours</span>
                </div>
                <div className="text-2xl font-bold mb-1" style={{ fontFamily: 'Orbitron, sans-serif' }}>
                  {stats.totalHours}
                </div>
                <div className="text-sm text-zinc-400">Played</div>
              </div>

              <div className="stat-card rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <CreditCard className="w-8 h-8 text-amber-400" />
                  <span className="text-xs text-zinc-400">Spent</span>
                </div>
                <div className="text-2xl font-bold mb-1" style={{ fontFamily: 'Orbitron, sans-serif' }}>
                  ₹{stats.totalSpent}
                </div>
                <div className="text-sm text-zinc-400">Total</div>
              </div>
            </div>
          </header>

          {/* Error Message */}
          {errorMsg && (
            <div className="glass-card rounded-2xl p-4 mb-8 flex items-center gap-3 border-l-4 border-red-500">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-300" style={{ fontFamily: 'Inter, sans-serif' }}>
                {errorMsg}
              </p>
            </div>
          )}

          {/* Main Content */}
          <main>
            {/* Tabs */}
            <div className="flex gap-2 mb-8">
              <button
                onClick={() => setActiveTab("upcoming")}
                className={`tab-button flex items-center gap-2 px-6 py-3 rounded-xl font-medium ${activeTab === "upcoming" ? "active" : ""}`}
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                <CalendarCheck className="w-4 h-4" />
                Upcoming ({upcoming.length})
              </button>
              <button
                onClick={() => setActiveTab("history")}
                className={`tab-button flex items-center gap-2 px-6 py-3 rounded-xl font-medium ${activeTab === "history" ? "active" : ""}`}
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                <History className="w-4 h-4" />
                History ({past.length})
              </button>
            </div>

            {/* Booking List */}
            {activeTab === "upcoming" ? (
              upcoming.length === 0 ? (
                <div className="empty-state rounded-2xl p-12 text-center">
                  <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-[#ff073a]/10 to-[#00f0ff]/10 flex items-center justify-center">
                    <CalendarCheck className="w-12 h-12 text-zinc-600" />
                  </div>
                  <h3 className="text-xl font-bold mb-3" style={{ fontFamily: 'Orbitron, sans-serif' }}>
                    No Upcoming Sessions
                  </h3>
                  <p className="text-zinc-400 mb-8 max-w-md mx-auto" style={{ fontFamily: 'Inter, sans-serif' }}>
                    You don't have any upcoming gaming sessions. Book your first session to start your gaming journey!
                  </p>
                  <button
                    onClick={() => router.push("/")}
                    className="primary-btn inline-flex items-center gap-2 px-8 py-3 rounded-xl font-bold"
                    style={{ fontFamily: 'Orbitron, sans-serif' }}
                  >
                    <Zap className="w-4 h-4" />
                    Find Gaming Cafés
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {upcoming.map((booking) => {
                    const ongoing = isBookingOngoing(booking);
                    const statusInfo = getStatusInfo(booking.status, ongoing);
                    const canCancel = canCancelBooking(booking);

                    return (
                      <div
                        key={booking.id}
                        onClick={() => router.push(`/bookings/${booking.id}`)}
                        className="booking-card rounded-2xl p-5"
                      >
                        <div className="flex flex-col md:flex-row md:items-center gap-5">
                          {/* Left side - Café Info */}
                          <div className="flex-1">
                            <div className="flex items-start gap-4">
                              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#ff073a]/20 to-[#00f0ff]/20 flex items-center justify-center flex-shrink-0">
                                <Gamepad2 className="w-6 h-6 text-white" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-2">
                                  <h3 className="text-lg font-bold truncate" style={{ fontFamily: 'Orbitron, sans-serif' }}>
                                    {booking.cafe?.name || "Gaming Café"}
                                  </h3>
                                  <div className={`status-badge inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${statusInfo.color}`}>
                                    {statusInfo.icon}
                                    {statusInfo.label}
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-4 text-sm text-zinc-400">
                                  <div className="flex items-center gap-1.5">
                                    <Calendar className="w-4 h-4" />
                                    <span style={{ fontFamily: 'Inter, sans-serif' }}>
                                      {formatDate(booking.booking_date)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <Clock className="w-4 h-4" />
                                    <span style={{ fontFamily: 'Inter, sans-serif' }}>
                                      {formatTime(booking.start_time)} - {formatTime(booking.end_time)}
                                    </span>
                                  </div>
                                  {booking.cafe?.city && (
                                    <div className="flex items-center gap-1.5">
                                      <MapPin className="w-4 h-4" />
                                      <span style={{ fontFamily: 'Inter, sans-serif' }}>
                                        {booking.cafe.city}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Right side - Price & Actions */}
                          <div className="flex flex-col md:items-end gap-3">
                            <div className="flex items-center gap-2">
                              <DollarSign className="w-5 h-5 text-[#00f0ff]" />
                              <span className="text-2xl font-bold text-white" style={{ fontFamily: 'Orbitron, sans-serif' }}>
                                ₹{booking.total_amount || 0}
                              </span>
                              <span className="text-sm text-zinc-400">
                                for {booking.hours || 1} hour{booking.hours !== 1 ? 's' : ''}
                              </span>
                            </div>

                            <div className="flex gap-2">
                              {canCancel && (
                                <button
                                  onClick={(e) => handleCancelBooking(booking.id, e)}
                                  disabled={cancelingId === booking.id}
                                  className="cancel-btn flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                                  style={{ fontFamily: 'Inter, sans-serif' }}
                                >
                                  {cancelingId === booking.id ? (
                                    <>
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                      Cancelling...
                                    </>
                                  ) : (
                                    <>
                                      <XCircle className="w-4 h-4" />
                                      Cancel
                                    </>
                                  )}
                                </button>
                              )}
                              <button
                                onClick={() => router.push(`/bookings/${booking.id}`)}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm font-medium transition-colors"
                                style={{ fontFamily: 'Inter, sans-serif' }}
                              >
                                View Details
                                <ExternalLink className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              // History Tab
              past.length === 0 ? (
                <div className="empty-state rounded-2xl p-12 text-center">
                  <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-[#ff073a]/10 to-[#00f0ff]/10 flex items-center justify-center">
                    <History className="w-12 h-12 text-zinc-600" />
                  </div>
                  <h3 className="text-xl font-bold mb-3" style={{ fontFamily: 'Orbitron, sans-serif' }}>
                    No Gaming History
                  </h3>
                  <p className="text-zinc-400 mb-8 max-w-md mx-auto" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Your gaming history will appear here after your first session. Start gaming to build your history!
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {past.map((booking) => {
                    const statusInfo = getStatusInfo(booking.status, false);

                    return (
                      <div
                        key={booking.id}
                        onClick={() => router.push(`/bookings/${booking.id}`)}
                        className="booking-card rounded-2xl p-5 opacity-80 hover:opacity-100 transition-opacity"
                      >
                        <div className="flex flex-col md:flex-row md:items-center gap-5">
                          {/* Left side - Café Info */}
                          <div className="flex-1">
                            <div className="flex items-start gap-4">
                              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#ff073a]/10 to-[#00f0ff]/10 flex items-center justify-center flex-shrink-0">
                                <Gamepad2 className="w-6 h-6 text-zinc-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-2">
                                  <h3 className="text-lg font-bold truncate" style={{ fontFamily: 'Orbitron, sans-serif' }}>
                                    {booking.cafe?.name || "Gaming Café"}
                                  </h3>
                                  <div className={`status-badge inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${statusInfo.color}`}>
                                    {statusInfo.icon}
                                    {statusInfo.label}
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-4 text-sm text-zinc-400">
                                  <div className="flex items-center gap-1.5">
                                    <Calendar className="w-4 h-4" />
                                    <span style={{ fontFamily: 'Inter, sans-serif' }}>
                                      {formatDate(booking.booking_date)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <Clock className="w-4 h-4" />
                                    <span style={{ fontFamily: 'Inter, sans-serif' }}>
                                      {formatTime(booking.start_time)} - {formatTime(booking.end_time)}
                                    </span>
                                  </div>
                                  {booking.cafe?.city && (
                                    <div className="flex items-center gap-1.5">
                                      <MapPin className="w-4 h-4" />
                                      <span style={{ fontFamily: 'Inter, sans-serif' }}>
                                        {booking.cafe.city}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Right side - Price */}
                          <div className="flex flex-col md:items-end">
                            <div className="flex items-center gap-2 mb-2">
                              <DollarSign className="w-5 h-5 text-[#00f0ff]" />
                              <span className="text-2xl font-bold text-white" style={{ fontFamily: 'Orbitron, sans-serif' }}>
                                ₹{booking.total_amount || 0}
                              </span>
                            </div>
                            <div className="text-sm text-zinc-400">
                              Completed on {formatDate(booking.booking_date)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </main>

          {/* Stats Bar */}
          {bookings.length > 0 && (
            <div className="glass-card rounded-2xl p-6 mt-12">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <h3 className="text-lg font-bold mb-2" style={{ fontFamily: 'Orbitron, sans-serif' }}>
                    Your Gaming Stats
                  </h3>
                  <p className="text-zinc-400 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Track your gaming journey and achievements
                  </p>
                </div>
                <div className="flex flex-wrap gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#ff073a]" style={{ fontFamily: 'Orbitron, sans-serif' }}>
                      {stats.total}
                    </div>
                    <div className="text-sm text-zinc-400">Total Sessions</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#00f0ff]" style={{ fontFamily: 'Orbitron, sans-serif' }}>
                      {stats.totalHours}
                    </div>
                    <div className="text-sm text-zinc-400">Hours Played</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-emerald-400" style={{ fontFamily: 'Orbitron, sans-serif' }}>
                      ₹{stats.totalSpent}
                    </div>
                    <div className="text-sm text-zinc-400">Total Spent</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-amber-400" style={{ fontFamily: 'Orbitron, sans-serif' }}>
                      {stats.confirmed}
                    </div>
                    <div className="text-sm text-zinc-400">Confirmed</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </PullToRefresh>
  );
}
