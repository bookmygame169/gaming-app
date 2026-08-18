// src/app/bookings/success/page.tsx
"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { colors, fonts } from "@/lib/constants";
import { formatDate } from "@/lib/timeUtils";
import { getIndiaDateString } from "@/lib/bookingFilters";
import {
  CheckCircle,
  Gamepad2,
  GamepadDirectional,
  Calendar,
  Clock,
  Ticket,
  Info,
  XCircle,
  AlertCircle,
  Loader2,
  Star,
  Instagram,
  Users,
  RectangleGoggles,
  Car
} from "lucide-react";

type BookingRow = {
  id: string;
  cafe_id: string | null;
  user_id?: string | null;
  booking_date: string | null;
  start_time: string | null;
  total_amount: number | null;
  status: string | null;
  created_at: string | null;
  source?: "online" | null;
  duration?: number | null;
};

type CafeRow = {
  id: string;
  name: string;
  google_maps_url?: string | null;
  instagram_url?: string | null;
  address?: string | null;
};

type BookingItemRow = {
  id: string;
  booking_id: string;
  title: string;
  price: number;
  quantity: number;
  console?: string;
};

type FullBooking = {
  booking: BookingRow;
  cafe: CafeRow | null;
  items: BookingItemRow[];
};

// Console icons mapping
const consoleIcons: Record<string, React.ReactNode> = {
  ps5: <GamepadDirectional className="w-6 h-6" />,
  ps4: <Gamepad2 className="w-6 h-6" />,
  xbox: <Gamepad2 className="w-6 h-6" />,
  pc: <Gamepad2 className="w-6 h-6" />,
  pool: <Gamepad2 className="w-6 h-6" />,
  arcade: <Gamepad2 className="w-6 h-6" />,
  snooker: <Gamepad2 className="w-6 h-6" />,
  vr: <RectangleGoggles className="w-6 h-6" />,
  steering: <Car className="w-6 h-6" />,
  steering_wheel: <Car className="w-6 h-6" />,
};

function BookingSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bookingId = searchParams.get("ref");

  const [data, setData] = useState<FullBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!bookingId) {
        setErrorMsg("Missing booking reference.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setErrorMsg(null);

        // booking
        const { data: booking, error: bookingError } = await supabase
          .from("bookings")
          .select("*")
          .eq("id", bookingId)
          .maybeSingle();

        if (bookingError) {
          throw bookingError;
        }
        if (!booking) {
          setErrorMsg("Booking not found.");
          return;
        }

        const { data: userData } = await supabase.auth.getUser();
        const currentUserId = userData?.user?.id ?? null;
        if (!currentUserId || booking.user_id !== currentUserId) {
          setErrorMsg("Booking not found.");
          return;
        }

        // cafe
        let cafe: CafeRow | null = null;
        if (booking.cafe_id) {
          const { data: cafeRow, error: cafeError } = await supabase
            .from("cafes")
            .select("id, name, google_maps_url, instagram_url, address")
            .eq("id", booking.cafe_id)
            .maybeSingle();
          if (cafeError) throw cafeError;
          cafe = cafeRow ?? null;
        }

        // items
        const { data: itemRows, error: itemsError } = await supabase
          .from("booking_items")
          .select("id, booking_id, title, price, quantity, console")
          .eq("booking_id", bookingId);

        if (itemsError) throw itemsError;

        if (!cancelled) {
          setData({
            booking,
            cafe,
            items: (itemRows ?? []) as BookingItemRow[],
          });
        }
      } catch (err) {
        console.error("Error loading booking details:", err);
        if (!cancelled) {
          setErrorMsg("Could not load booking details. Please try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [bookingId]);


  const canCancel = useMemo(() => {
    if (!data) return false;
    const status = (data.booking.status || "").toLowerCase();
    if (status === "cancelled") return false;
    if (!data.booking.booking_date) return false;

    const todayStr = getIndiaDateString();
    return data.booking.booking_date >= todayStr;
  }, [data]);

  async function handleCancelBooking() {
    if (!data || !bookingId) return;
    if (!canCancel) return;

    const ok = window.confirm(
      "Are you sure you want to cancel this booking? This cannot be undone."
    );
    if (!ok) return;

    try {
      setIsCancelling(true);

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const cancelResponse = await fetch(`/api/bookings/${bookingId}/cancel`, {
        method: "POST",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });

      if (!cancelResponse.ok) {
        const body = await cancelResponse.json().catch(() => ({}));
        throw new Error(body.error || "Failed to cancel booking");
      }

      setData((prev) =>
        prev
          ? {
              ...prev,
              booking: { ...prev.booking, status: "cancelled" },
            }
          : prev
      );
    } catch (err) {
      console.error("Error cancelling booking:", err);
      alert("Could not cancel booking. Please try again.");
    } finally {
      setIsCancelling(false);
    }
  }

  function getStatusInfo(status?: string | null) {
    const value = (status || "confirmed").toLowerCase();

    if (value === "cancelled") {
      return {
        label: "CANCELLED",
        bg: "rgba(239, 68, 68, 0.15)",
        border: "rgba(239, 68, 68, 0.3)",
        color: "#ef4444",
        icon: <XCircle className="w-5 h-5" />,
      };
    }
    if (value === "pending") {
      return {
        label: "PENDING",
        bg: "rgba(245, 158, 11, 0.15)",
        border: "rgba(245, 158, 11, 0.3)",
        color: "#f59e0b",
        icon: <AlertCircle className="w-5 h-5" />,
      };
    }
    return {
      label: "CONFIRMED",
      bg: "rgba(34, 197, 94, 0.15)",
      border: "rgba(34, 197, 94, 0.3)",
      color: "#22c55e",
      icon: <CheckCircle className="w-5 h-5" />,
    };
  }

  // ---------- UI STATES ----------

  if (loading) {
    return (
      <div className="loading-container">
        <Loader2 className="loading-spinner" />
        <p className="loading-text">Loading your booking...</p>
      </div>
    );
  }

  if (errorMsg || !data) {
    return (
      <div className="error-container">
        <AlertCircle className="error-icon" />
        <h1 className="error-title">Booking Not Found</h1>
        <p className="error-message">
          {errorMsg ?? "This booking doesn't exist or has been removed."}
        </p>
        <button
          onClick={() => router.push("/dashboard")}
          className="error-button"
        >
          Go to Dashboard
        </button>
      </div>
    );
  }

  const { booking, cafe, items } = data;
  const statusInfo = getStatusInfo(booking.status);
  const isConfirmed = (booking.status || "confirmed").toLowerCase() === "confirmed";

  return (
    <>
      <style jsx global>{`
        .booking-success-page {
          min-height: 100vh;
          background: linear-gradient(180deg, ${colors.dark} 0%, #0a0a10 100%);
          font-family: ${fonts.body};
          color: ${colors.textPrimary};
          position: relative;
          overflow: hidden;
        }

        .background-glow {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: radial-gradient(ellipse at 50% 0%, rgba(34, 197, 94, 0.12) 0%, transparent 50%);
          pointer-events: none;
          z-index: 0;
        }

        /* Confetti Animation */
        @keyframes confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }

        @keyframes pulse-success {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
          50% { box-shadow: 0 0 0 15px rgba(34, 197, 94, 0); }
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Loading States */
        .loading-container {
          min-height: 100vh;
          background: linear-gradient(180deg, ${colors.dark} 0%, #0a0a10 100%);
          font-family: ${fonts.body};
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .loading-spinner {
          width: 56px;
          height: 56px;
          color: ${colors.cyan};
          animation: spin 1s linear infinite;
        }

        .loading-text {
          margin-top: 20px;
          color: ${colors.textSecondary};
          font-size: 14px;
        }

        /* Error States */
        .error-container {
          min-height: 100vh;
          background: linear-gradient(180deg, ${colors.dark} 0%, #0a0a10 100%);
          font-family: ${fonts.body};
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 20px;
          text-align: center;
        }

        .error-icon {
          width: 64px;
          height: 64px;
          color: ${colors.red};
          margin-bottom: 20px;
        }

        .error-title {
          font-family: ${fonts.heading};
          font-size: 20px;
          color: ${colors.red};
          margin-bottom: 12px;
        }

        .error-message {
          color: ${colors.textSecondary};
          font-size: 14px;
          margin-bottom: 24px;
          max-width: 300px;
        }

        .error-button {
          padding: 14px 28px;
          background: linear-gradient(135deg, ${colors.red} 0%, #ff3366 100%);
          border: none;
          border-radius: 12px;
          color: white;
          font-family: ${fonts.heading};
          font-size: 13px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 1px;
          cursor: pointer;
        }

        /* Main Container */
        .success-container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px 16px 40px;
          position: relative;
          z-index: 1;
        }

        /* Header */
        .success-header {
          text-align: center;
          margin-bottom: 32px;
          padding-top: 20px;
        }

        .success-icon-container {
          width: 80px;
          height: 80px;
          margin: 0 auto 20px;
          border-radius: 50%;
          background: linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, transparent 100%);
          border: 2px solid rgba(34, 197, 94, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          animation: pulse-success 2s ease-in-out infinite;
        }

        .success-icon {
          color: #22c55e;
        }

        .success-title {
          font-family: ${fonts.heading};
          font-size: 24px;
          font-weight: 700;
          color: #22c55e;
          margin-bottom: 8px;
        }

        .success-subtitle {
          font-size: 14px;
          color: ${colors.textSecondary};
        }

        /* Booking Card */
        .booking-card {
          background: linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, ${colors.darkCard} 100%);
          border: 1px solid rgba(34, 197, 94, 0.2);
          border-radius: 20px;
          padding: 24px;
          margin-bottom: 20px;
          position: relative;
          overflow: hidden;
        }

        .booking-card-header {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, ${colors.green}, ${colors.cyan});
        }

        /* ID + Status */
        .booking-id-section {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
          padding-bottom: 16px;
          border-bottom: 1px solid ${colors.border};
        }

        .booking-id-label {
          font-size: 11px;
          color: ${colors.textMuted};
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 4px;
        }

        .booking-id-value {
          font-family: ${fonts.heading};
          font-size: 14px;
          color: ${colors.cyan};
          letter-spacing: 1px;
        }

        .status-badge {
          padding: 6px 14px;
          border-radius: 20px;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.5px;
        }

        /* Venue + Time */
        .venue-section {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 20px;
        }

        .venue-icon-container {
          width: 56px;
          height: 56px;
          background: linear-gradient(135deg, ${colors.red}20 0%, ${colors.red}10 100%);
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .venue-details {
          display: flex;
          flex-direction: column;
        }

        .venue-name {
          font-size: 18px;
          font-weight: 600;
          color: ${colors.textPrimary};
          margin-bottom: 4px;
        }

        .venue-meta {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .meta-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: ${colors.textSecondary};
        }

        .meta-item.time {
          color: ${colors.cyan};
          font-weight: 600;
        }

        /* Tickets */
        .tickets-section {
          background: rgba(255, 255, 255, 0.03);
          border-radius: 12px;
          padding: 16px;
        }

        .tickets-label {
          font-size: 11px;
          color: ${colors.textMuted};
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .tickets-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .ticket-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.02);
          border-radius: 8px;
          border: 1px solid ${colors.border};
        }

        .ticket-info {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .ticket-details {
          display: flex;
          flex-direction: column;
        }

        .ticket-name {
          font-size: 13px;
          font-weight: 600;
          color: ${colors.textPrimary};
        }

        .ticket-quantity {
          font-size: 11px;
          color: ${colors.textMuted};
        }

        .ticket-price {
          font-family: ${fonts.heading};
          font-size: 14px;
          font-weight: 600;
          color: ${colors.cyan};
        }

        /* Payment Summary */
        .payment-summary {
          background: ${colors.darkCard};
          border: 1px solid ${colors.border};
          border-radius: 16px;
          padding: 20px;
          margin-bottom: 20px;
        }

        .payment-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .payment-info {
          display: flex;
          flex-direction: column;
        }

        .payment-label {
          font-size: 11px;
          color: ${colors.textMuted};
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 4px;
        }

        .payment-amount {
          font-family: ${fonts.heading};
          font-size: 28px;
          font-weight: 700;
          color: ${colors.textPrimary};
        }

        .payment-status-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          background: rgba(34, 197, 94, 0.1);
          border-radius: 10px;
        }

        .payment-status-text {
          font-size: 12px;
          color: #22c55e;
          font-weight: 600;
        }

        /* Info Banner */
        .info-banner {
          background: rgba(0, 240, 255, 0.05);
          border: 1px solid rgba(0, 240, 255, 0.15);
          border-radius: 12px;
          padding: 14px 16px;
          margin-bottom: 24px;
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }

        .info-text {
          font-size: 13px;
          color: ${colors.textSecondary};
          line-height: 1.5;
          margin: 0;
        }

        /* Social & Review Section */
        .social-section {
          background: linear-gradient(135deg, rgba(255, 7, 58, 0.08) 0%, rgba(0, 240, 255, 0.08) 100%);
          border: 1px solid ${colors.border};
          border-radius: 16px;
          padding: 20px;
          margin-bottom: 24px;
        }

        .social-header {
          text-align: center;
          margin-bottom: 16px;
        }

        .social-title {
          font-size: 16px;
          font-weight: 600;
          color: ${colors.textPrimary};
          margin-bottom: 4px;
        }

        .social-subtitle {
          font-size: 13px;
          color: ${colors.textSecondary};
        }

        .social-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .social-button {
          padding: 14px 16px;
          border: none;
          border-radius: 12px;
          color: white;
          font-family: ${fonts.body};
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          text-decoration: none;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
          transition: transform 0.2s;
        }

        .social-button:hover {
          transform: translateY(-2px);
        }

        .social-button.maps {
          background: linear-gradient(135deg, #4285F4 0%, #34A853 100%);
        }

        .social-button.instagram {
          background: linear-gradient(135deg, #F58529 0%, #DD2A7B 50%, #8134AF 100%);
        }

        /* Action Buttons */
        .action-buttons {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .primary-button {
          padding: 16px 24px;
          border: none;
          border-radius: 14px;
          color: ${colors.dark};
          font-family: ${fonts.heading};
          font-size: 14px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 1px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.2s ease;
          background: linear-gradient(135deg, ${colors.cyan} 0%, #0891b2 100%);
          box-shadow: 0 8px 32px rgba(0, 240, 255, 0.4);
        }

        .primary-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 40px rgba(0, 240, 255, 0.6);
        }

        .secondary-button {
          padding: 16px 24px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid ${colors.border};
          border-radius: 14px;
          color: ${colors.textPrimary};
          font-family: ${fonts.heading};
          font-size: 14px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 1px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          text-decoration: none;
          transition: all 0.2s ease;
        }

        .secondary-button:hover {
          background: rgba(255, 255, 255, 0.08);
          transform: translateY(-2px);
        }

        .cancel-button {
          padding: 14px 24px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 12px;
          color: #ef4444;
          font-family: ${fonts.body};
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          margin-top: 8px;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .cancel-button:hover:not(:disabled) {
          background: rgba(239, 68, 68, 0.15);
        }

        .cancel-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* Confetti */
        .confetti-container {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          pointer-events: none;
          z-index: 10;
          overflow: hidden;
        }

        /* Mobile Responsive */
        @media (max-width: 480px) {
          .success-container {
            padding: 16px 12px 32px;
          }

          .success-title {
            font-size: 20px;
          }

          .social-grid {
            grid-template-columns: 1fr;
          }

          .venue-meta {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
          }

          .primary-button,
          .secondary-button {
            padding: 14px 20px;
            font-size: 13px;
          }

          .booking-card {
            margin: 0 -12px;
            border-radius: 12px;
          }
        }

        @media (min-width: 640px) {
          .success-container {
            padding: 24px 20px 48px;
          }
        }
      `}</style>

      <div className="booking-success-page">
        {/* Background glow */}
        <div className="background-glow" />

        {/* Confetti */}
        {showConfetti && isConfirmed && (
          <div className="confetti-container">
            {[...Array(50)].map((_, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  top: "-10px",
                  left: `${Math.random() * 100}%`,
                  width: `${Math.random() * 10 + 5}px`,
                  height: `${Math.random() * 10 + 5}px`,
                  background: [
                    colors.red,
                    colors.cyan,
                    colors.green,
                    colors.orange,
                    colors.purple,
                  ][Math.floor(Math.random() * 5)],
                  borderRadius: Math.random() > 0.5 ? "50%" : "2px",
                  animation: `confetti-fall ${Math.random() * 3 + 2}s linear forwards`,
                  animationDelay: `${Math.random() * 2}s`,
                  opacity: 0.8,
                }}
              />
            ))}
          </div>
        )}

        <div className="success-container">
          {/* Header */}
          <header className="success-header">
            <div className="success-icon-container">
              <CheckCircle className="success-icon w-10 h-10" />
            </div>

            <h1 className="success-title">Booking Confirmed!</h1>
            <p className="success-subtitle">
              Get ready for an amazing gaming session!
            </p>
          </header>

          {/* Booking card */}
          <section className="booking-card">
            <div className="booking-card-header" />

            {/* ID + status */}
            <div className="booking-id-section">
              <div>
                <p className="booking-id-label">Booking ID</p>
                <p className="booking-id-value">
                  #{booking.id.slice(0, 8).toUpperCase()}
                </p>
              </div>
              <div 
                className="status-badge"
                style={{
                  background: statusInfo.bg,
                  border: `1px solid ${statusInfo.border}`,
                  color: statusInfo.color,
                }}
              >
                {statusInfo.icon}
                <span>{statusInfo.label}</span>
              </div>
            </div>

            {/* Venue + time */}
            <div className="venue-section">
              <div className="venue-icon-container">
                <Gamepad2 className="w-8 h-8 text-red-400" />
              </div>
              <div className="venue-details">
                <p className="venue-name">
                  {cafe?.name ?? "Gaming Café"}
                </p>
                <div className="venue-meta">
                  <div className="meta-item">
                    <Calendar className="w-4 h-4" />
                    {formatDate(booking.booking_date)}
                  </div>
                  <div className="meta-item time">
                    <Clock className="w-4 h-4" />
                    {booking.start_time || "Time not set"}
                  </div>
                  {booking.duration && (
                    <div className="meta-item">
                      <Clock className="w-4 h-4" />
                      {booking.duration} minutes
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Tickets */}
            <div className="tickets-section">
              <p className="tickets-label">
                <Ticket className="w-4 h-4" />
                Your Tickets
              </p>

              {items.length === 0 ? (
                <p style={{ fontSize: "13px", color: colors.textSecondary }}>
                  Ticket details not available.
                </p>
              ) : (
                <div className="tickets-list">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="ticket-item"
                    >
                      <div className="ticket-info">
                        <div className="text-cyan-400">
                          {consoleIcons[item.console as string] || <Gamepad2 className="w-6 h-6" />}
                        </div>
                        <div className="ticket-details">
                          <p className="ticket-name">
                            {item.title}
                          </p>
                          <p className="ticket-quantity">
                            {item.quantity} × ₹{item.price}
                          </p>
                        </div>
                      </div>
                      <p className="ticket-price">
                        ₹{item.price * (item.quantity ?? 1)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Payment summary */}
          <section className="payment-summary">
            <div className="payment-content">
              <div className="payment-info">
                <p className="payment-label">Total Paid</p>
                <p className="payment-amount">
                  ₹{booking.total_amount ?? 0}
                </p>
              </div>
              <div className="payment-status-badge">
                <CheckCircle className="w-4 h-4" />
                <span className="payment-status-text">Payment Complete</span>
              </div>
            </div>
          </section>

          {/* Info note */}
          <section className="info-banner">
            <Info className="w-5 h-5 text-cyan-400 flex-shrink-0" />
            <p className="info-text">
              Show this booking at the venue. Your booking is also saved in your
              dashboard for quick access.
            </p>
          </section>

          {/* Social Media & Review Section */}
          {cafe && (
            <section className="social-section">
              <div className="social-header">
                <p className="social-title">Enjoyed your visit?</p>
                <p className="social-subtitle">
                  Help us grow by leaving a review and following us!
                </p>
              </div>

              <div className="social-grid">
                {/* Google Maps Button */}
                {cafe.google_maps_url && (
                  <a
                    href={cafe.google_maps_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="social-button maps"
                  >
                    <Star className="w-6 h-6" />
                    <span>Google Review</span>
                  </a>
                )}

                {/* Instagram Follow Button */}
                {cafe.instagram_url && (
                  <a
                    href={cafe.instagram_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="social-button instagram"
                  >
                    <Instagram className="w-6 h-6" />
                    <span>Follow on Instagram</span>
                  </a>
                )}
              </div>
            </section>
          )}

          {/* Buttons */}
          <div className="action-buttons">
            <button
              onClick={() => router.push(`/bookings/${booking.id}`)}
              className="primary-button"
            >
              <Ticket className="w-5 h-5" />
              View Booking Details
            </button>

            <button
              onClick={() => router.push("/dashboard")}
              className="secondary-button"
            >
              <Users className="w-5 h-5" />
              Go to Dashboard
            </button>

            {canCancel && (
              <button
                onClick={handleCancelBooking}
                disabled={isCancelling}
                className="cancel-button"
              >
                {isCancelling ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4" />
                    Cancel Booking
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default function BookingSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="loading-container">
          <Loader2 className="loading-spinner" />
          <p className="loading-text">Loading your booking confirmation...</p>
        </div>
      }
    >
      <BookingSuccessContent />
    </Suspense>
  );
}