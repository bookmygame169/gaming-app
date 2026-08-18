// src/app/checkout/page.tsx
"use client";

import { errorMessage } from "@/lib/sanitize";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import useUser from "@/hooks/useUser";
import { ConsoleId, colors, fonts, CONSOLE_LABELS } from "@/lib/constants";
import { getEndTime } from "@/lib/timeUtils";
import {
  ArrowLeft,
  CheckCircle,
  Gamepad2,
  Ticket,
  Calendar,
  Clock,
  ShieldCheck,
  Edit2,
  Trash2,
  Home,
  ExternalLink,
  Loader2,
  AlertCircle,
  IndianRupee,
  MapPin,
  Check,
  XCircle
} from "lucide-react";

type CheckoutTicket = {
  ticketId: string;
  console: ConsoleId;
  title: string;
  price: number;
  quantity: number;
};

type CheckoutDraft = {
  cafeId: string;
  cafeName: string;
  bookingDate: string;
  timeSlot: string;
  tickets: CheckoutTicket[];
  totalAmount: number;
  durationMinutes: 30 | 60 | 90;
  source: "online";
};

export default function CheckoutPage() {
  const router = useRouter();
  const { user } = useUser();

  const [draft, setDraft] = useState<CheckoutDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [successBookingId, setSuccessBookingId] = useState<string | null>(null);
  /** What the server actually settled, so the confirmation can say so. */
  const [settled, setSettled] = useState<{ walletUsed: number; payableAtVenue: number }>({
    walletUsed: 0,
    payableAtVenue: 0,
  });

  const removeTicket = (ticketId: string) => {
    if (!draft) return;

    const updatedTickets = draft.tickets.filter((t) => t.ticketId !== ticketId);
    const newTotal = updatedTickets.reduce((sum, t) => sum + t.price * t.quantity, 0);

    const updatedDraft = {
      ...draft,
      tickets: updatedTickets,
      totalAmount: newTotal,
    };

    setDraft(updatedDraft);

    if (typeof window !== "undefined") {
      if (updatedTickets.length === 0) {
        window.sessionStorage.removeItem("checkoutDraft");
        router.back();
      } else {
        window.sessionStorage.setItem("checkoutDraft", JSON.stringify(updatedDraft));
      }
    }
  };

  const editBooking = () => {
    router.back();
  };

  useEffect(() => {
    async function checkUserRole() {
      if (!user) return;

      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        const role = profile?.role?.toLowerCase();
        setIsOwner(role === "owner" || role === "admin" || role === "super_admin");
      } catch (err) {
        console.error("Error checking user role:", err);
      }
    }

    checkUserRole();
  }, [user]);

  useEffect(() => {
    try {
      const raw =
        typeof window !== "undefined"
          ? window.sessionStorage.getItem("checkoutDraft")
          : null;
      if (!raw) {
        setError("No booking in progress.");
        setLoading(false);
        return;
      }
      const parsed = JSON.parse(raw) as CheckoutDraft;
      setDraft(parsed);
      setLoading(false);
    } catch (err) {
      console.error("Failed to read checkoutDraft", err);
      setError("Could not load booking details.");
      setLoading(false);
    }
  }, []);



  /**
   * Money the customer has already paid this café.
   *
   * Paying from it needs nobody to confirm anything — the café was paid when
   * the wallet was topped up — so a booking covered by the wallet is live the
   * moment it is made.
   */
  const [walletBalance, setWalletBalance] = useState(0);
  const [useWallet, setUseWallet] = useState(true);

  useEffect(() => {
    if (!draft?.cafeId || !user) return;

    let cancelled = false;

    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;
        if (!accessToken) return;

        const res = await fetch("/api/wallet/mine", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return;

        const data = await res.json();
        // Wallets are per café, so only this café's balance can pay for this
        // booking.
        const here = (data.cafes || []).find(
          (entry: { cafeId: string }) => entry.cafeId === draft.cafeId
        );

        if (!cancelled) setWalletBalance(Number(here?.balance) || 0);
      } catch {
        // No wallet shown is the right outcome; the booking still works.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [draft?.cafeId, user]);

  // Coupon state
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{
    id: string;
    code: string;
    discountType: 'percentage' | 'flat';
    discountValue: number;
    maxDiscountAmount: number | null;
    bonusMinutes: number;
    discountAmount: number;
  } | null>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  async function handleApplyCoupon() {
    if (!couponCode.trim() || !draft || !user) return;
    setApplyingCoupon(true);
    setCouponError(null);

    try {
      const { data, error } = await supabase.rpc('validate_coupon', {
        p_code: couponCode.trim(),
        p_cafe_id: draft.cafeId,
        p_order_amount: draft.totalAmount,
        p_user_phone: user.phone || undefined
      });

      if (error) throw error;

      if (!data[0].is_valid) { // RPC returns array
        setCouponError(data[0].error_message);
        setApplyingCoupon(false);
        return;
      }

      const couponData = data[0];
      let discountAmount = 0;

      if (couponData.discount_type === 'percentage') {
        discountAmount = (draft.totalAmount * couponData.discount_value) / 100;
        if (couponData.max_discount_amount) {
          discountAmount = Math.min(discountAmount, couponData.max_discount_amount);
        }
      } else {
        discountAmount = couponData.discount_value;
      }

      // Ensure discount doesn't exceed total
      discountAmount = Math.min(discountAmount, draft.totalAmount);

      setAppliedCoupon({
        id: couponData.coupon_id,
        code: couponCode.toUpperCase(),
        discountType: couponData.discount_type,
        discountValue: couponData.discount_value,
        maxDiscountAmount: couponData.max_discount_amount,
        bonusMinutes: couponData.bonus_minutes,
        discountAmount: discountAmount
      });
      setCouponCode(""); // Clear input on success
    } catch (err) {
      console.error('Coupon error:', err);
      setCouponError(errorMessage(err, "Failed to apply coupon"));
    } finally {
      setApplyingCoupon(false);
    }
  }

  function handleRemoveCoupon() {
    setAppliedCoupon(null);
    setCouponError(null);
  }

  async function handlePlaceOrder() {
    if (!draft) return;
    if (!user) {
      alert("Please login again.");
      router.push("/login");
      return;
    }

    setPlacing(true);
    setError(null);

    try {
      const { cafeId, bookingDate, timeSlot, tickets } = draft;

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        setError("Your session expired. Please sign in again.");
        setPlacing(false);
        return;
      }

      // The server places the booking. It recalculates the price from the
      // café's own pricing, reserves the actual machines, and re-checks the
      // coupon — none of which can be trusted from this page. It also has to
      // be a same-origin request, because the cafés' ISP blocks Supabase.
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          cafeId,
          bookingDate,
          startTime: timeSlot,
          durationMinutes: draft.durationMinutes,
          items: tickets.map((t) => ({ console: t.console, quantity: t.quantity })),
          couponCode: appliedCoupon?.code || undefined,
          // The server decides how much the wallet actually covers; this only
          // says whether to try.
          useWallet: useWallet && walletBalance > 0,
        }),
      });

      const result = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(result.error || "Could not place booking. Please try again.");
        setPlacing(false);
        return;
      }

      const bookingId = result.bookingId as string;
      const finalAmount = Number(result.totalAmount) || 0;
      setSettled({
        walletUsed: Number(result.walletUsed) || 0,
        payableAtVenue: Number(result.payableAtVenue) || 0,
      });
      const discount = Number(result.discount) || 0;
      const extraMinutes = Number(result.bonusMinutes) || 0;

      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("checkoutDraft");
      }

      setSuccessBookingId(bookingId);
      setBookingSuccess(true);
      setPlacing(false);
      setDraft(null);

    } catch (err) {
      console.error("Place order error", err);
      setError("Something went wrong. Please try again.");
      setPlacing(false);
    }
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: colors.dark,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: fonts.body,
          color: colors.textSecondary,
          gap: "16px",
          padding: "20px",
        }}
      >
        <Loader2 size={32} className="animate-spin" color={colors.cyan} />
        <p style={{ fontSize: "14px" }}>Loading checkout...</p>
      </div>
    );
  }



  // What is left after the wallet, so the bottom bar and the button agree
  // with the breakdown above them.
  const dueAfterCoupon = draft
    ? Math.max(0, draft.totalAmount - (appliedCoupon?.discountAmount || 0))
    : 0;
  const payableNow =
    useWallet && walletBalance > 0
      ? Math.max(0, dueAfterCoupon - Math.min(walletBalance, dueAfterCoupon))
      : dueAfterCoupon;

  if (bookingSuccess) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: `linear-gradient(180deg, ${colors.dark} 0%, #0a0a10 100%)`,
          fontFamily: fonts.body,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
        }}
      >
        <div
          style={{
            maxWidth: "500px",
            width: "100%",
            background: colors.darkCard,
            border: `1px solid ${colors.border}`,
            borderRadius: "24px",
            padding: "32px 24px",
            textAlign: "center",
            boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
          }}
        >
          <div
            style={{
              width: "80px",
              height: "80px",
              margin: "0 auto 24px",
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${colors.green} 0%, #16a34a 100%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CheckCircle size={40} color="white" />
          </div>

          <h1
            style={{
              fontFamily: fonts.heading,
              fontSize: "clamp(22px, 5vw, 28px)",
              fontWeight: 700,
              color: colors.textPrimary,
              marginBottom: "12px",
            }}
          >
            Booking Successful!
          </h1>

          <p
            style={{
              fontSize: "14px",
              color: colors.textSecondary,
              marginBottom: "24px",
            }}
          >
            Booking ID:{" "}
            <strong style={{ color: colors.cyan }}>
              #{successBookingId?.slice(0, 8)}
            </strong>
          </p>

          <p
            style={{
              fontSize: "13px",
              color: colors.textMuted,
              marginBottom: "32px",
              lineHeight: 1.6,
            }}
          >
            {/* This used to claim the payment had been received on every
                booking, including pay-at-venue ones where nothing had been
                taken. It now says what actually happened. */}
            {settled.walletUsed > 0 && settled.payableAtVenue === 0
              ? `Paid in full from your wallet — ₹${settled.walletUsed}. Nothing to pay at the café.`
              : settled.walletUsed > 0
                ? `₹${settled.walletUsed} came out of your wallet. Pay the remaining ₹${settled.payableAtVenue} at the café.`
                : `Your seat is reserved. Pay ₹${settled.payableAtVenue} at the café.`}{" "}
            You will receive a confirmation email shortly.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <button
              onClick={() => router.push("/")}
              style={{
                width: "100%",
                padding: "14px 20px",
                background: `linear-gradient(135deg, ${colors.red} 0%, #ff3366 100%)`,
                border: "none",
                borderRadius: "12px",
                color: "white",
                fontFamily: fonts.heading,
                fontSize: "14px",
                fontWeight: 600,
                letterSpacing: "0.5px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              <Home size={18} />
              {isOwner ? "Create New Booking" : "Back to Home"}
            </button>

            <button
              onClick={() => router.push(`/bookings/success?ref=${successBookingId}`)}
              style={{
                width: "100%",
                padding: "12px 20px",
                background: "rgba(255, 255, 255, 0.05)",
                border: `1px solid ${colors.border}`,
                borderRadius: "12px",
                color: colors.textSecondary,
                fontFamily: fonts.body,
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              View Booking Details
              <ExternalLink size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: colors.dark,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: fonts.body,
          color: colors.textSecondary,
          padding: "24px",
          textAlign: "center",
          gap: "16px",
        }}
      >
        <AlertCircle size={48} color={colors.textMuted} />
        <p style={{ fontSize: "16px" }}>
          {error || "No booking found. Go back and start a new booking."}
        </p>
        <button
          onClick={() => router.back()}
          style={{
            padding: "10px 20px",
            background: colors.cyan,
            border: "none",
            borderRadius: "8px",
            color: "white",
            fontFamily: fonts.body,
            fontSize: "14px",
            fontWeight: 500,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            marginTop: "12px",
          }}
        >
          <ArrowLeft size={16} />
          Go Back
        </button>
      </div>
    );
  }

  const dateLabel = new Date(
    `${draft.bookingDate}T00:00:00`
  ).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const totalTickets = draft.tickets.reduce((sum, t) => sum + t.quantity, 0);
  const durationMinutes = draft.durationMinutes || 60;
  const endTime = getEndTime(draft.timeSlot, durationMinutes);

  const durationText =
    durationMinutes === 30 ? "30 min" :
      durationMinutes === 60 ? "1 hour" :
        durationMinutes === 90 ? "1.5 hours" : `${durationMinutes} min`;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: `linear-gradient(180deg, ${colors.dark} 0%, #0a0a10 100%)`,
        fontFamily: fonts.body,
        color: colors.textPrimary,
      }}
    >
      <div
        style={{
          maxWidth: "600px",
          margin: "0 auto",
          padding: "16px 16px 120px",
        }}
      >
        {/* Header */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "24px",
            paddingTop: "8px",
          }}
        >
          <button
            onClick={() => router.back()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "transparent",
              border: "none",
              color: colors.textSecondary,
              fontSize: "14px",
              cursor: "pointer",
              padding: "8px 0",
            }}
          >
            <ArrowLeft size={18} />
            <span style={{ fontSize: "14px" }}>Back</span>
          </button>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 10px",
              borderRadius: "20px",
              background: "rgba(22,163,74,0.12)",
              border: `1px solid rgba(22,163,74,0.4)`,
              fontSize: "11px",
              fontWeight: 500,
              letterSpacing: "0.3px",
            }}
          >
            <ShieldCheck size={12} color={colors.green} />
            <span>Secure Checkout</span>
          </div>
        </header>

        {/* Page Title */}
        <div style={{ marginBottom: "24px" }}>
          <h1
            style={{
              fontFamily: fonts.heading,
              fontSize: "clamp(24px, 6vw, 28px)",
              fontWeight: 700,
              marginBottom: "8px",
              lineHeight: 1.2,
            }}
          >
            Order Summary
          </h1>
          <p
            style={{
              fontSize: "14px",
              color: colors.textSecondary,
            }}
          >
            Review your booking before confirmation
          </p>
        </div>

        {/* Cafe & Time Card */}
        <section
          style={{
            background: colors.darkCard,
            borderRadius: "16px",
            border: `1px solid ${colors.border}`,
            padding: "16px",
            marginBottom: "20px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "3px",
              background: `linear-gradient(90deg, ${colors.green}, ${colors.cyan})`,
            }}
          />

          <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "12px",
                background: "rgba(34, 197, 94, 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Gamepad2 size={22} color={colors.green} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <h2
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  marginBottom: "8px",
                  color: colors.textPrimary,
                }}
              >
                {draft.cafeName}
              </h2>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  marginBottom: "12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Calendar size={14} color={colors.textMuted} />
                  <span style={{ fontSize: "13px", color: colors.textSecondary }}>
                    {dateLabel}
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Clock size={14} color={colors.textMuted} />
                  <span style={{ fontSize: "13px", color: colors.textSecondary }}>
                    {draft.timeSlot} – {endTime}
                    <span style={{ color: colors.textMuted, marginLeft: "4px" }}>
                      ({durationText})
                    </span>
                  </span>
                </div>
              </div>

              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "4px 10px",
                  borderRadius: "12px",
                  background: "rgba(59, 130, 246, 0.1)",
                  border: `1px solid rgba(59, 130, 246, 0.3)`,
                  fontSize: "11px",
                  color: colors.cyan,
                }}
              >
                <Clock size={10} />
                <span>Online Booking</span>
              </div>
            </div>
          </div>
        </section>

        {/* Tickets Section */}
        <section
          style={{
            background: colors.darkCard,
            borderRadius: "16px",
            border: `1px solid ${colors.border}`,
            marginBottom: "20px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "16px",
              borderBottom: `1px solid ${colors.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  background: "rgba(234, 179, 8, 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ticket size={16} color="#eab308" />
              </div>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600 }}>
                  Your Tickets
                </div>
                <div style={{ fontSize: "12px", color: colors.textMuted }}>
                  {totalTickets} ticket{totalTickets > 1 ? "s" : ""} • {durationText}
                </div>
              </div>
            </div>

            <button
              onClick={editBooking}
              style={{
                background: "rgba(34, 197, 94, 0.1)",
                border: `1px solid rgba(34, 197, 94, 0.3)`,
                borderRadius: "8px",
                padding: "6px 12px",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: 500,
                color: colors.green,
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <Edit2 size={12} />
              Edit
            </button>
          </div>

          <div style={{ padding: "12px 16px 16px" }}>
            {draft.tickets.map((t) => {
              const lineTotal = t.price * t.quantity;
              return (
                <div
                  key={t.ticketId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px",
                    borderRadius: "12px",
                    background: "rgba(15, 23, 42, 0.5)",
                    marginBottom: "8px",
                    border: `1px solid ${colors.border}`,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        marginBottom: "4px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {t.title}
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: colors.textMuted,
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <span>{t.quantity} × ₹{t.price}</span>
                      <span style={{ color: colors.border }}>•</span>
                      <span>{CONSOLE_LABELS[t.console]}</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div
                      style={{
                        fontFamily: fonts.heading,
                        fontSize: "15px",
                        fontWeight: 600,
                        color: colors.textPrimary,
                        minWidth: "60px",
                        textAlign: "right",
                        display: "flex",
                        alignItems: "center",
                        gap: "2px",
                      }}
                    >
                      <IndianRupee size={12} />
                      {lineTotal}
                    </div>
                    <button
                      onClick={() => removeTicket(t.ticketId)}
                      style={{
                        background: "rgba(239, 68, 68, 0.1)",
                        border: `1px solid rgba(239, 68, 68, 0.3)`,
                        borderRadius: "8px",
                        padding: "6px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "32px",
                        height: "32px",
                      }}
                      title="Remove ticket"
                    >
                      <Trash2 size={16} color="#ef4444" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Coupon Section */}
          <div style={{ padding: "0 16px 16px", borderBottom: `1px solid ${colors.border}`, background: colors.darkCard }}>
            {!appliedCoupon ? (
              <div style={{ display: "flex", gap: "8px" }}>
                <div style={{ position: "relative", flex: 1 }}>
                  <input
                    type="text"
                    placeholder="Have a coupon code?"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    style={{
                      width: "100%",
                      padding: "10px 12px 10px 36px",
                      background: "rgba(15, 23, 42, 0.5)",
                      border: `1px solid ${couponError ? colors.red : colors.border}`,
                      borderRadius: "8px",
                      color: "white",
                      fontSize: "14px",
                      outline: "none"
                    }}
                  />
                  <Ticket size={16} color={colors.textMuted} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)" }} />
                </div>
                <button
                  onClick={handleApplyCoupon}
                  disabled={applyingCoupon || !couponCode}
                  style={{
                    padding: "0 16px",
                    borderRadius: "8px",
                    background: applyingCoupon || !couponCode ? "rgba(255,255,255,0.1)" : colors.cyan,
                    color: applyingCoupon || !couponCode ? colors.textMuted : "white",
                    border: "none",
                    cursor: applyingCoupon || !couponCode ? "not-allowed" : "pointer",
                    fontSize: "13px",
                    fontWeight: 500
                  }}
                >
                  {applyingCoupon ? <Loader2 size={14} className="animate-spin" /> : "Apply"}
                </button>
              </div>
            ) : (
              <div style={{
                padding: "12px",
                background: "rgba(22, 163, 74, 0.1)",
                border: `1px solid rgba(22, 163, 74, 0.2)`,
                borderRadius: "8px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ padding: "4px", background: colors.green, borderRadius: "50%" }}>
                    <Check size={10} color="white" />
                  </div>
                  <div>
                    <div style={{ color: colors.green, fontWeight: 600, fontSize: "13px" }}>
                      '{appliedCoupon.code}' Applied
                    </div>
                    <div style={{ color: colors.textSecondary, fontSize: "11px" }}>
                      You saved ₹{appliedCoupon.discountAmount}
                      {appliedCoupon.bonusMinutes > 0 && ` + ${appliedCoupon.bonusMinutes}m free time`}
                    </div>
                  </div>
                </div>
                <button onClick={handleRemoveCoupon} style={{ background: "none", border: "none", cursor: "pointer", color: colors.textMuted }}>
                  <XCircle size={16} />
                </button>
              </div>
            )}
            {couponError && (
              <div style={{ marginTop: "8px", fontSize: "12px", color: colors.red, display: "flex", alignItems: "center", gap: "4px" }}>
                <AlertCircle size={12} />
                {couponError}
              </div>
            )}
          </div>

          {/* Price Summary */}
          <div
            style={{
              // borderTop: `1px solid ${colors.border}`, // Removed duplicate border
              padding: "16px",
              background: "rgba(15, 23, 42, 0.5)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "8px",
              }}
            >
              <span style={{ fontSize: "14px", color: colors.textSecondary }}>
                Subtotal
              </span>
              <span style={{ fontSize: "14px", fontWeight: 500 }}>
                ₹{draft.totalAmount}
              </span>
            </div>

            {appliedCoupon && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "8px",
                }}
              >
                <span style={{ fontSize: "14px", color: colors.green }}>
                  Discount ({appliedCoupon.code})
                </span>
                <span style={{ fontSize: "14px", fontWeight: 500, color: colors.green }}>
                  -₹{appliedCoupon.discountAmount}
                </span>
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "12px",
              }}
            >
              <span style={{ fontSize: "14px", color: colors.textSecondary }}>
                Taxes & Fees
              </span>
              <span style={{ fontSize: "14px", color: colors.textMuted }}>
                Included
              </span>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                paddingTop: "12px",
                borderTop: `1px solid ${colors.border}`,
              }}
            >
              <span style={{ fontSize: "16px", fontWeight: 600 }}>
                Total Amount
              </span>
              <span
                style={{
                  fontFamily: fonts.heading,
                  fontSize: "20px",
                  fontWeight: 700,
                  color: colors.green,
                  display: "flex",
                  alignItems: "center",
                  gap: "2px",
                }}
              >
                <IndianRupee size={16} />
                {Math.max(0, draft.totalAmount - (appliedCoupon?.discountAmount || 0))}
              </span>
            </div>

            {/* Money already paid to this café. Offered by default, because a
                balance sitting unused is the customer paying twice. */}
            {walletBalance > 0 && (
              <div
                style={{
                  marginTop: "14px",
                  padding: "12px 14px",
                  borderRadius: "14px",
                  background: useWallet ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${useWallet ? "rgba(34,197,94,0.3)" : colors.border}`,
                }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={useWallet}
                    onChange={(e) => setUseWallet(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: colors.green }}
                  />
                  <span style={{ flex: 1 }}>
                    <span
                      style={{ display: "block", fontSize: "14px", fontWeight: 600, color: colors.textPrimary }}
                    >
                      Use my wallet
                    </span>
                    <span style={{ display: "block", fontSize: "12px", color: colors.textSecondary }}>
                      ₹{walletBalance.toLocaleString("en-IN")} at {draft.cafeName}
                    </span>
                  </span>
                </label>

                {useWallet && (
                  <div
                    style={{
                      marginTop: "10px",
                      paddingTop: "10px",
                      borderTop: `1px solid ${colors.border}`,
                      fontSize: "13px",
                    }}
                  >
                    {(() => {
                      const due = Math.max(
                        0,
                        draft.totalAmount - (appliedCoupon?.discountAmount || 0)
                      );
                      const fromWallet = Math.min(walletBalance, due);
                      const atVenue = due - fromWallet;

                      return (
                        <>
                          <div style={{ display: "flex", justifyContent: "space-between", color: colors.green }}>
                            <span>From wallet</span>
                            <span style={{ fontWeight: 700 }}>−₹{fromWallet}</span>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              marginTop: "6px",
                              color: colors.textPrimary,
                              fontWeight: 700,
                            }}
                          >
                            <span>{atVenue > 0 ? "Pay at the café" : "Nothing left to pay"}</span>
                            <span>₹{atVenue}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Note */}
        <div
          style={{
            padding: "16px",
            borderRadius: "12px",
            background: "rgba(34, 197, 94, 0.05)",
            border: `1px solid rgba(34, 197, 94, 0.2)`,
            marginBottom: "20px",
          }}
        >
          <p
            style={{
              fontSize: "13px",
              color: colors.textSecondary,
              lineHeight: 1.6,
              margin: 0,
              display: "flex",
              alignItems: "flex-start",
              gap: "8px",
            }}
          >
            <CheckCircle size={16} color={colors.green} style={{ flexShrink: 0, marginTop: "2px" }} />
            <span>
              <strong style={{ color: colors.green }}>Note:</strong> Complete the payment to
              lock your slot and confirm your booking. You'll receive a confirmation email.
            </span>
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "12px",
              background: "rgba(239, 68, 68, 0.1)",
              border: `1px solid rgba(239, 68, 68, 0.3)`,
              marginBottom: "20px",
              display: "flex",
              alignItems: "flex-start",
              gap: "8px",
            }}
          >
            <AlertCircle size={18} color="#ef4444" style={{ flexShrink: 0, marginTop: "1px" }} />
            <span style={{ fontSize: "13px", color: "#fecaca", lineHeight: 1.5 }}>{error}</span>
          </div>
        )}
      </div>

      {/* Fixed Bottom Bar */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          background: colors.dark,
          borderTop: `1px solid ${colors.border}`,
          padding: "16px",
          zIndex: 50,
          backdropFilter: "blur(10px)",
        }}
      >
        <div
          style={{
            maxWidth: "600px",
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: "14px",
                color: colors.textMuted,
                marginBottom: "2px",
              }}
            >
              {/* What they actually hand over, not the sticker price — the
                  wallet has already covered the rest. */}
              {useWallet && walletBalance > 0 ? "Pay at the café" : "Total Amount"}
            </div>
            <div
              style={{
                fontFamily: fonts.heading,
                fontSize: "20px",
                fontWeight: 700,
                color: colors.green,
                lineHeight: 1,
                display: "flex",
                alignItems: "center",
                gap: "2px",
              }}
            >
              <IndianRupee size={16} />
              {payableNow}
            </div>
          </div>

          <button
            disabled={placing}
            onClick={handlePlaceOrder}
            style={{
              flexShrink: 0,
              padding: "14px 24px",
              borderRadius: "12px",
              border: "none",
              fontFamily: fonts.heading,
              fontSize: "14px",
              fontWeight: 600,
              cursor: placing ? "not-allowed" : "pointer",
              background: placing
                ? "rgba(148, 163, 184, 0.3)"
                : `linear-gradient(135deg, ${colors.green} 0%, #16a34a 100%)`,
              color: "white",
              minWidth: "160px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              boxShadow: placing ? "none" : `0 4px 20px rgba(34, 197, 94, 0.3)`,
            }}
          >
            {placing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <IndianRupee size={16} />
                {payableNow === 0 ? "Confirm booking" : `Pay ${payableNow}`}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Responsive Styles */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        
        @media (max-width: 640px) {
          .checkout-container {
            padding-left: 12px !important;
            padding-right: 12px !important;
          }
          
          .fixed-bottom-bar {
            padding: 12px !important;
          }
          
          .confirm-button {
            min-width: 140px !important;
            padding: 12px 16px !important;
            font-size: 13px !important;
          }
        }
        
        @media (max-width: 480px) {
          .checkout-title {
            font-size: 22px !important;
          }
          
          .ticket-item {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 8px !important;
          }
          
          .ticket-info {
            width: 100% !important;
          }
          
          .ticket-actions {
            width: 100% !important;
            justify-content: space-between !important;
          }
          
          .price-display {
            min-width: auto !important;
            text-align: left !important;
          }
          
          .bottom-bar {
            flex-direction: column !important;
            gap: 12px !important;
            text-align: center !important;
          }
        }
        
        @media (max-width: 360px) {
          .confirm-button {
            min-width: 120px !important;
            padding: 10px 12px !important;
            font-size: 12px !important;
          }
          
          .header-content {
            flex-direction: column !important;
            gap: 8px !important;
            align-items: flex-start !important;
          }
          
          .secure-badge {
            align-self: flex-start !important;
          }
        }
      `}</style>
    </div>
  );
}