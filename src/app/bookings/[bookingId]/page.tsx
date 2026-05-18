// src/app/bookings/[bookingId]/page.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  ArrowLeft,
  Gamepad2,
  Calendar,
  Clock,
  MapPin,
  Instagram,
  Ticket,
  CreditCard,
  Info,
  CheckCircle,
  XCircle,
  Loader2,
  Users,
  Hash,
  Star,
  ExternalLink,
  AlertTriangle,
  History,
  Sparkles,
  ShieldCheck,
  Share2
} from "lucide-react";

type BookingRow = {
  id: string;
  cafe_id: string | null;
  user_id: string | null;
  booking_date: string | null;
  start_time: string | null;
  total_amount: number | null;
  status: string | null;
  created_at: string | null;
  duration?: number | null;
  source?: string | null;
  payment_mode?: string | null;
};

type BookingItemRow = {
  id?: string;
  booking_id: string;
  ticket_id: string;
  console: string | null;
  title: string | null;
  price: number | null;
  quantity: number | null;
};

type CafeRow = {
  id: string;
  name: string;
  google_maps_url?: string | null;
  instagram_url?: string | null;
  address?: string | null;
};

type BookingWithRelations = BookingRow & {
  items: BookingItemRow[];
  cafe: CafeRow | null;
};

const PAYTM_UPI_ID = "paytmqr6k4kf1@ptys";
const PAYTM_UPI_NAME = "BookMyGame";

function buildUpiPaymentUrl(amount: number, bookingId: string, cafeName?: string | null): string {
  return `upi://pay?pa=${encodeURIComponent(PAYTM_UPI_ID)}&pn=${encodeURIComponent(PAYTM_UPI_NAME)}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Advance booking ${bookingId.slice(0, 8).toUpperCase()}${cafeName ? ` - ${cafeName}` : ""}`)}`;
}

export default function BookingDetailsPage() {
  const params = useParams<{ bookingId: string }>();
  const bookingId = params?.bookingId;
  const router = useRouter();

  const [data, setData] = useState<BookingWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // Load booking data
  useEffect(() => {
    if (!bookingId) return;

    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setErrorMsg(null);

        // Fetch booking
        const { data: booking, error: bookingError } = await supabase
          .from("bookings")
          .select("*")
          .eq("id", bookingId)
          .maybeSingle<BookingRow>();

        if (bookingError) throw bookingError;
        if (!booking) {
          setErrorMsg("Booking not found.");
          return;
        }

        // Fetch items
        const { data: itemsRows, error: itemsError } = await supabase
          .from("booking_items")
          .select("*")
          .eq("booking_id", bookingId);

        if (itemsError) throw itemsError;
        const items = (itemsRows || []) as BookingItemRow[];

        // Fetch cafe
        let cafe: CafeRow | null = null;
        if (booking.cafe_id) {
          const { data: cafeRow, error: cafeError } = await supabase
            .from("cafes")
            .select("id, name, google_maps_url, instagram_url, address")
            .eq("id", booking.cafe_id)
            .maybeSingle<CafeRow>();

          if (!cafeError) cafe = cafeRow ?? null;
        }

        if (!cancelled) {
          setData({
            ...booking,
            items,
            cafe,
          });
        }
      } catch (err) {
        console.error("Error loading booking:", err);
        if (!cancelled) {
          setErrorMsg("Could not load booking details.");
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

  // Memoized values
  const formattedDate = useMemo(() => {
    if (!data?.booking_date) return "Date not set";
    try {
      const d = new Date(`${data.booking_date}T00:00:00`);
      return d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
        weekday: "short",
      });
    } catch {
      return data.booking_date;
    }
  }, [data?.booking_date]);

  const totalTickets = useMemo(() => {
    if (!data) return 0;
    return data.items.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
  }, [data]);

  const canCancel = useMemo(() => {
    if (!data) return false;
    const status = (data.status || "").toLowerCase();
    if (status === "cancelled") return false;
    if (!data.booking_date) return false;

    const todayStr = new Date().toISOString().slice(0, 10);
    return data.booking_date >= todayStr;
  }, [data]);

  const isUpcoming = useMemo(() => {
    if (!data?.booking_date) return false;
    const todayStr = new Date().toISOString().slice(0, 10);
    return data.booking_date >= todayStr;
  }, [data]);

  const bookingSource = useMemo(() => {
    if (!data?.source) return "Online";
    if (data.source === "walk_in" || data.source === "walk-in") return "Walk-in";
    if (data.source === "advance") return "Advance";
    return "Online";
  }, [data?.source]);

  const isWalkIn = useMemo(() => {
    return data?.source === "walk_in" || data?.source === "walk-in";
  }, [data?.source]);

  // Status info - BLACK/RED THEME
  const getStatusInfo = (status?: string | null) => {
    const value = (status || "confirmed").toLowerCase();
    
    if (value === "cancelled") {
      return {
        label: "CANCELLED",
        bg: "rgba(239, 68, 68, 0.15)",
        color: "#ef4444",
        icon: <XCircle className="w-4 h-4" />,
      };
    }
    if (value === "pending") {
      return {
        label: "PENDING",
        bg: "rgba(255, 166, 0, 0.15)",
        color: "#ffa600",
        icon: <Loader2 className="w-4 h-4 animate-spin" />,
      };
    }
    return {
      label: "CONFIRMED",
      bg: "rgba(0, 255, 0, 0.15)",
      color: "#00ff00",
      icon: <CheckCircle className="w-4 h-4" />,
    };
  };

  const statusInfo = getStatusInfo(data?.status);
  const isPaymentPending = (data?.status || "").toLowerCase() === "pending";
  const paymentUrl = data && bookingId
    ? buildUpiPaymentUrl(Number(data.total_amount || 0), bookingId, data.cafe?.name)
    : "";

  // Handle cancel booking
  const handleCancelBooking = async () => {
    if (!data || !bookingId || !canCancel) return;

    if (!window.confirm("Cancel this booking? This cannot be undone.")) return;

    try {
      setIsCancelling(true);
      const { error } = await supabase
        .from("bookings")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
        })
        .eq("id", bookingId);

      if (error) throw error;

      // Send cancellation email
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user?.email) {
        fetch('/api/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'booking_cancellation',
            data: {
              email: userData.user.email,
              name: userData.user.user_metadata?.full_name || userData.user.user_metadata?.name,
              bookingId,
              cafeName: data.cafe?.name || 'Gaming Cafe',
              bookingDate: data.booking_date ? new Date(data.booking_date).toLocaleDateString('en-IN', { dateStyle: 'long' }) : '',
              startTime: data.start_time || '',
              totalAmount: data.total_amount || 0,
            },
          }),
        }).catch(console.error);
      }

      setData(prev => prev ? { ...prev, status: "cancelled" } : prev);
    } catch (err) {
      console.error("Cancel error:", err);
      alert("Failed to cancel booking.");
    } finally {
      setIsCancelling(false);
    }
  };

  // Loading state - BLACK THEME
  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <Gamepad2 className="w-16 h-16 text-red-500 mx-auto mb-6 animate-pulse" />
          <p className="text-gray-400 text-sm font-medium">Loading your gaming ticket...</p>
        </div>
      </div>
    );
  }

  // Error state - BLACK/RED THEME
  if (errorMsg || !data) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <XCircle className="w-20 h-20 text-red-500 mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-white mb-3">Booking Not Found</h1>
          <p className="text-gray-400 mb-8">{errorMsg || "This booking doesn't exist."}</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-6 py-3 bg-gradient-to-r from-red-600 to-red-800 text-white rounded-lg font-semibold hover:opacity-90 transition"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Background Effects - BLACK/RED GRADIENT */}
      <div className="fixed inset-0 overflow-hidden">
        <div className="absolute top-20 left-10 w-72 h-72 bg-red-500/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 right-10 w-72 h-72 bg-red-800/5 rounded-full blur-3xl"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-black"></div>
      </div>

      <div className="relative max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-400 hover:text-red-400 transition"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Back</span>
          </button>
          
          <div className="flex items-center gap-3">
            <div 
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold"
              style={{ background: statusInfo.bg, color: statusInfo.color }}
            >
              {statusInfo.icon}
              {statusInfo.label}
            </div>
          </div>
        </div>

        {/* Booking ID */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <p className="text-red-400 text-sm font-semibold uppercase tracking-wider">
              Booking Details
            </p>
            {isWalkIn && (
              <span className="px-3 py-1 bg-gradient-to-r from-purple-500/20 to-cyan-500/20 border border-purple-500/30 text-purple-400 text-xs font-bold rounded-full uppercase tracking-wider">
                Walk-in
              </span>
            )}
          </div>
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-red-400 to-red-600 bg-clip-text text-transparent">
            #{data.id.slice(0, 8).toUpperCase()}
          </h1>
        </div>

        {/* Session Badge - BLACK/RED */}
        <div className={`flex items-center gap-3 px-5 py-3 rounded-2xl mb-8 ${
          isUpcoming 
            ? 'bg-gradient-to-r from-red-500/10 to-red-700/10 border border-red-500/20' 
            : 'bg-gray-900/50 border border-gray-800'
        }`}>
          {isUpcoming ? (
            <>
              <Calendar className="w-5 h-5 text-red-400" />
              <span className="font-semibold text-red-400">Upcoming Session</span>
              <Sparkles className="w-4 h-4 text-red-400 ml-auto" />
            </>
          ) : (
            <>
              <History className="w-5 h-5 text-gray-400" />
              <span className="font-semibold text-gray-400">Past Session</span>
            </>
          )}
        </div>

        {/* Main Card - BLACK/RED THEME */}
        <div className="bg-gradient-to-br from-gray-900/90 to-black/90 backdrop-blur-xl rounded-3xl border border-gray-800 overflow-hidden mb-8 shadow-2xl">
          {/* Card Header */}
          <div className="p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-center gap-6 mb-8">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center">
                <Gamepad2 className="w-10 h-10 text-white" />
              </div>
              
              <div className="flex-1">
                <h2 className="text-2xl font-bold mb-2">
                  {data.cafe?.name || "Gaming Cafe"}
                </h2>
                {data.cafe?.address && (
                  <div className="flex items-center gap-2 text-gray-400">
                    <MapPin className="w-4 h-4" />
                    <span className="text-sm">{data.cafe.address}</span>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 mt-3">
                  <span className="px-3 py-1 bg-red-500/10 text-red-400 text-xs font-semibold rounded-full">
                    Premium Gaming
                  </span>
                  <span className="px-3 py-1 bg-red-800/10 text-red-300 text-xs font-semibold rounded-full">
                    High Performance
                  </span>
                </div>
              </div>
            </div>

            {/* Divider - RED THEME */}
            <div className="h-px bg-gradient-to-r from-transparent via-red-800/50 to-transparent my-8"></div>

            {/* Details Grid - BLACK/RED */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="bg-gray-900/70 p-5 rounded-2xl border border-gray-800">
                <div className="flex items-center gap-3 text-gray-400 mb-2">
                  <Calendar className="w-4 h-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Date</span>
                </div>
                <p className="text-xl font-bold">{formattedDate}</p>
              </div>

              <div className="bg-gray-900/70 p-5 rounded-2xl border border-gray-800">
                <div className="flex items-center gap-3 text-gray-400 mb-2">
                  <Clock className="w-4 h-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Time</span>
                </div>
                <p className="text-xl font-bold text-red-400">
                  {data.start_time || "Time not set"}
                  {data.duration && ` • ${data.duration} min`}
                </p>
              </div>

              <div className={`p-5 rounded-2xl border ${isWalkIn ? 'bg-gradient-to-br from-purple-500/10 to-cyan-500/10 border-purple-500/20' : 'bg-gray-900/70 border-gray-800'}`}>
                <div className="flex items-center gap-3 text-gray-400 mb-2">
                  <Hash className="w-4 h-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Source</span>
                </div>
                <p className={`text-xl font-bold ${isWalkIn ? 'text-purple-400' : 'text-white'}`}>
                  {bookingSource}
                </p>
              </div>

              <div className="bg-gray-900/70 p-5 rounded-2xl border border-gray-800">
                <div className="flex items-center gap-3 text-gray-400 mb-2">
                  <Ticket className="w-4 h-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Tickets</span>
                </div>
                <p className="text-xl font-bold">{totalTickets} {totalTickets === 1 ? 'Ticket' : 'Tickets'}</p>
              </div>
            </div>

            {/* Social Links - BLACK/RED */}
            {(data.cafe?.google_maps_url || data.cafe?.instagram_url) && (
              <div className="mb-8">
                <p className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-4">
                  Connect With Venue
                </p>
                <div className="flex flex-wrap gap-3">
                  {data.cafe.google_maps_url && (
                    <a
                      href={data.cafe.google_maps_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-5 py-3 bg-gradient-to-r from-red-700 to-red-900 rounded-xl hover:opacity-90 transition"
                    >
                      <MapPin className="w-5 h-5" />
                      <span className="font-semibold">Google Maps</span>
                      <ExternalLink className="w-4 h-4 ml-2" />
                    </a>
                  )}
                  
                  {data.cafe.instagram_url && (
                    <a
                      href={data.cafe.instagram_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-5 py-3 bg-gradient-to-r from-red-600 to-pink-700 rounded-xl hover:opacity-90 transition"
                    >
                      <Instagram className="w-5 h-5" />
                      <span className="font-semibold">Instagram</span>
                      <ExternalLink className="w-4 h-4 ml-2" />
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Review Section - BLACK/GREEN */}
            <div className="bg-gradient-to-r from-green-500/10 to-green-700/10 border border-green-500/20 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-3">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                ))}
              </div>
              <p className="text-gray-300">
                <span className="font-semibold text-green-400">Enjoyed your session?</span>{' '}
                Leave a review and help other gamers!
              </p>
            </div>
          </div>
        </div>

        {/* Tickets Section - BLACK/RED */}
        <div className="bg-gradient-to-br from-gray-900/90 to-black/90 backdrop-blur-xl rounded-3xl border border-gray-800 p-6 md:p-8 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Ticket className="w-6 h-6 text-red-400" />
              <h3 className="text-xl font-bold">Your Tickets</h3>
            </div>
            <span className="px-4 py-2 bg-gradient-to-r from-red-600 to-red-800 rounded-full text-sm font-bold">
              {totalTickets} Total
            </span>
          </div>

          <div className="space-y-4">
            {data.items.length === 0 ? (
              <p className="text-gray-400 text-center py-8">No ticket details available.</p>
            ) : (
              data.items.map((item) => (
                <div
                  key={item.id || `${item.ticket_id}-${item.console}`}
                  className="bg-gray-900/70 p-5 rounded-2xl border border-gray-800 hover:border-red-500/30 transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500/20 to-red-800/20 flex items-center justify-center">
                        <Gamepad2 className="w-6 h-6 text-red-400" />
                      </div>
                      <div>
                        <h4 className="font-bold">{item.title || "Gaming Session"}</h4>
                        <p className="text-gray-400 text-sm">
                          {item.quantity} × ₹{item.price}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-red-400">
                        ₹{(item.price ?? 0) * (item.quantity ?? 0)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Payment Section - BLACK/RED */}
        <div className="bg-gradient-to-br from-gray-900/90 to-black/90 backdrop-blur-xl rounded-3xl border border-gray-800 p-6 md:p-8 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <CreditCard className="w-6 h-6 text-red-400" />
            <h3 className="text-xl font-bold">Payment Summary</h3>
          </div>

          <div className={`${isPaymentPending ? "bg-gradient-to-r from-yellow-500/10 to-orange-700/10 border-yellow-500/20" : "bg-gradient-to-r from-green-500/10 to-green-700/10 border-green-500/20"} border rounded-2xl p-6`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <p className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-2">
                  {isPaymentPending ? "Amount Payable" : "Total Amount Paid"}
                </p>
                <p className="text-4xl font-bold">
                  ₹{data.total_amount || 0}
                </p>
                {isPaymentPending && (
                  <p className="mt-3 text-sm text-yellow-200/80">
                    Pay now using UPI. The venue will verify the payment in Paytm Business and confirm this booking.
                  </p>
                )}
              </div>
              {isPaymentPending ? (
                <a
                  href={paymentUrl}
                  className="flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-yellow-500 to-orange-600 rounded-xl font-bold text-black hover:opacity-90 transition"
                >
                  <CreditCard className="w-5 h-5" />
                  Pay Now
                </a>
              ) : (
                <div className="flex items-center gap-3 px-6 py-3 bg-green-500/20 rounded-full border border-green-500/30">
                  <ShieldCheck className="w-5 h-5 text-green-400" />
                  <span className="font-semibold text-green-400">Payment Secured</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Info Section - BLACK/RED */}
        <div className="bg-gradient-to-br from-red-500/10 to-red-700/10 backdrop-blur-xl rounded-3xl border border-red-500/20 p-6 md:p-8 mb-8">
          <div className="flex items-start gap-4">
            <Info className="w-6 h-6 text-red-400 mt-1" />
            <div>
              <p className="text-lg mb-2">
                {isUpcoming 
                  ? "🎮 Show this booking at the venue. Arrive 5 minutes early for the best experience!"
                  : "🎉 Thank you for gaming with us! Hope you had an epic time."
                }
              </p>
              <p className="text-gray-400 text-sm">
                Booked on: {new Date(data.created_at || "").toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons - BLACK/RED */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <button
            onClick={() => router.push("/dashboard")}
            className="px-6 py-4 bg-gradient-to-r from-red-600 to-red-800 rounded-xl font-bold text-lg hover:opacity-90 transition flex items-center justify-center gap-3"
          >
            <Users className="w-5 h-5" />
            View All Bookings
          </button>

          <Link
            href="/"
            className="px-6 py-4 bg-gray-900 border border-gray-800 rounded-xl font-bold text-lg hover:bg-gray-800 transition flex items-center justify-center gap-3 text-center"
          >
            <Gamepad2 className="w-5 h-5" />
            Book Another Session
          </Link>

          <button
            onClick={() => navigator.clipboard.writeText(window.location.href)}
            className="px-6 py-4 bg-gray-900 border border-gray-800 rounded-xl font-bold text-lg hover:bg-gray-800 transition flex items-center justify-center gap-3"
          >
            <Share2 className="w-5 h-5" />
            Share Booking
          </button>
        </div>

        {/* Cancel Button - BLACK/RED */}
        {canCancel && (
          <div className="text-center">
            <button
              onClick={handleCancelBooking}
              disabled={isCancelling}
              className="px-8 py-4 bg-gradient-to-r from-red-500/20 to-red-700/20 border border-red-500/30 text-red-400 rounded-xl font-bold text-lg hover:bg-red-500/30 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 mx-auto"
            >
              {isCancelling ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Cancelling...
                </>
              ) : (
                <>
                  <AlertTriangle className="w-5 h-5" />
                  Cancel Booking
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Add Tailwind styles - BLACK/RED THEME */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        
        body {
          font-family: 'Inter', sans-serif;
          overflow-x: hidden;
          background: black;
        }
        
        /* Smooth animations */
        * {
          transition: all 0.3s ease;
        }
        
        /* Custom scrollbar - RED THEME */
        ::-webkit-scrollbar {
          width: 8px;
        }
        
        ::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
        }
        
        ::-webkit-scrollbar-thumb {
          background: linear-gradient(to bottom, #dc2626, #7f1d1d);
          border-radius: 4px;
        }
        
        ::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(to bottom, #ef4444, #991b1b);
        }
        
        /* Gradient text utility - RED THEME */
        .gradient-text {
          background: linear-gradient(to right, #ef4444, #dc2626, #b91c1c);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
      `}</style>
    </div>
  );
}
