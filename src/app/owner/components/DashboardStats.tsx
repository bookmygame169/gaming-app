'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { StatCard } from './ui';

const REVENUE_VISIBILITY_KEY = 'owner-dashboard-revenue-visible';

import { getLocalDateString } from '../utils';

interface DashboardStatsProps {
  bookings: DashboardBooking[];
  subscriptions: DashboardSubscription[];
  activeTimers: Map<string, number>;
  loadingData: boolean;
  isMobile: boolean;
}

interface DashboardBooking {
  booking_date?: string | null;
  payment_mode?: string | null;
  status?: string | null;
  total_amount?: number | null;
  booking_orders?: Array<{
    id: string;
    quantity?: number | null;
    total_price: number | null;
  }>;
}

interface DashboardSubscription {
  amount_paid?: number | string | null;
  id: string;
  purchase_date?: string | null;
}

export function DashboardStats({
  bookings,
  subscriptions,
  activeTimers,
  loadingData,
  isMobile,
}: DashboardStatsProps) {
  const [showRevenue, setShowRevenue] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [loadedPreference, setLoadedPreference] = useState(false);

  useEffect(() => {
    try {
      setShowRevenue(localStorage.getItem(REVENUE_VISIBILITY_KEY) === 'true');
    } catch {
      setShowRevenue(false);
    } finally {
      setLoadedPreference(true);
    }
  }, []);

  const toggleRevenueVisibility = (e: React.MouseEvent) => {
    e.stopPropagation(); // Don't trigger the breakdown toggle
    setShowRevenue((current) => {
      const next = !current;

      try {
        localStorage.setItem(REVENUE_VISIBILITY_KEY, String(next));
      } catch {
        // Ignore storage failures and keep the in-memory toggle working.
      }

      return next;
    });
  };

  const toggleBreakdown = () => {
    if (revenueVisible) {
      setShowBreakdown(prev => !prev);
    }
  };

  const activeBookingsCount = bookings.filter(
    (b) => b.status === 'in-progress' && b.booking_date === getLocalDateString()
  ).length;

  const activeSubscriptionsCount = subscriptions.filter((sub) =>
    activeTimers.has(sub.id)
  ).length;

  const activeNow = activeBookingsCount + activeSubscriptionsCount;

  const todayStr = getLocalDateString();
  const todayBookings = bookings.filter(
    (b) => b.booking_date === todayStr &&
      b.status !== 'cancelled' &&
      b.payment_mode !== 'owner'
  );
  const todaySubscriptions = subscriptions.filter((sub) => {
    const purchaseDate = sub.purchase_date
      ? getLocalDateString(new Date(sub.purchase_date))
      : null;

    return purchaseDate === todayStr;
  });

  const cashBookings = todayBookings.filter((b) => b.payment_mode?.toLowerCase() === 'cash');
  const onlineBookings = todayBookings.filter((b) => {
    const mode = b.payment_mode?.toLowerCase();
    return mode === 'online' || mode === 'upi';
  });
  const cardBookings = todayBookings.filter((b) => b.payment_mode?.toLowerCase() === 'card');

  const cashTotal = cashBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);
  const onlineTotal = onlineBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);
  const cardTotal = cardBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);

  const membershipRevenue = todaySubscriptions.reduce(
    (sum, sub) => {
      const amountPaid =
        typeof sub.amount_paid === 'number'
          ? sub.amount_paid
          : parseFloat(sub.amount_paid ?? '0') || 0;

      return sum + amountPaid;
    },
    0
  );

  const totalRevenue = cashTotal + onlineTotal + cardTotal + membershipRevenue;

  const snacksRevenue = todayBookings.reduce((sum, b) => {
    const orderSum = b.booking_orders?.reduce((s, order) => s + (order.total_price || 0), 0) || 0;
    return sum + orderSum;
  }, 0);

  const cashSnacks = cashBookings.reduce((sum, b) => sum + (b.booking_orders?.reduce((s, o) => s + (o.total_price || 0), 0) || 0), 0);
  const onlineSnacks = onlineBookings.reduce((sum, b) => sum + (b.booking_orders?.reduce((s, o) => s + (o.total_price || 0), 0) || 0), 0);
  const cardSnacks = cardBookings.reduce((sum, b) => sum + (b.booking_orders?.reduce((s, o) => s + (o.total_price || 0), 0) || 0), 0);

  const displayCash = cashTotal - cashSnacks;
  const displayOnline = onlineTotal - onlineSnacks;
  const displayCard = cardTotal - cardSnacks;
  
  const revenueVisible = loadedPreference && showRevenue;

  const todaySessions = bookings.filter(
    (b) => b.booking_date === todayStr && b.status !== 'cancelled' && b.payment_mode !== 'owner'
  ).length;

  const snacksSoldToday = todayBookings.reduce((sum, b) => {
    const qtySum = b.booking_orders?.reduce((s, order) => s + (order.quantity || 0), 0) || 0;
    return sum + qtySum;
  }, 0);

  return (
    <div className="grid grid-cols-1 gap-4 mb-8 md:grid-cols-2 lg:grid-cols-3 md:gap-6">
      <StatCard
        title="Active Now"
        value={loadingData ? '...' : activeNow}
        icon="▶️"
        gradient="radial-gradient(circle at top right, rgba(239, 68, 68, 0.15), transparent 70%), linear-gradient(135deg, rgba(30, 41, 59, 0.4), rgba(15, 23, 42, 0.6))"
        color="#ef4444"
        isMobile={isMobile}
      />

      <div
        onClick={toggleBreakdown}
        className={`
          relative overflow-hidden rounded-2xl border transition-all duration-300
          ${isMobile ? 'p-4' : 'p-6'}
          ${revenueVisible ? 'cursor-pointer hover:border-emerald-500/50 hover:bg-emerald-500/5' : ''}
        `}
        style={{
          background:
            'radial-gradient(circle at top right, rgba(34, 197, 94, 0.15), transparent 70%), linear-gradient(135deg, rgba(30, 41, 59, 0.4), rgba(15, 23, 42, 0.6))',
          borderColor: '#22c55e40',
        }}
      >
        <div
          className="absolute -top-5 right-12 opacity-10"
          style={{ fontSize: isMobile ? 60 : 80 }}
        >
          ₹
        </div>

        <button
          type="button"
          onClick={toggleRevenueVisibility}
          className={`
            absolute right-3 top-3 z-20 inline-flex items-center justify-center rounded-full
            border border-emerald-500/30 bg-slate-950/70 text-emerald-400 transition-colors
            hover:bg-slate-900
            ${isMobile ? 'h-9 w-9' : 'h-10 w-10'}
          `}
          aria-label={revenueVisible ? 'Hide today revenue' : 'Show today revenue'}
          aria-pressed={revenueVisible}
          title={revenueVisible ? 'Hide today revenue' : 'Show today revenue'}
        >
          {revenueVisible ? <EyeOff size={isMobile ? 16 : 18} /> : <Eye size={isMobile ? 16 : 18} />}
        </button>

        <div className="relative z-10">
          <p
            className={`
              uppercase tracking-wider font-semibold
              ${isMobile ? 'text-[9px] mb-1.5' : 'text-[11px] mb-2'}
            `}
            style={{ color: '#22c55eE6' }}
          >
            Today&apos;s Revenue
          </p>
          <div className="flex items-center gap-2">
            <p
              className={`
                font-bold leading-none
                ${isMobile ? 'text-2xl my-1.5' : 'text-4xl my-2'}
              `}
              style={{ color: '#22c55e' }}
            >
              {loadingData
                ? '...'
                : revenueVisible
                  ? `₹${totalRevenue}`
                  : '••••••'}
            </p>
            {revenueVisible && !showBreakdown && (
              <span className="text-[10px] text-emerald-400/50 font-medium bg-emerald-500/10 px-1.5 py-0.5 rounded animate-pulse">
                TAP TO SEE BREAKDOWN
              </span>
            )}
          </div>
          
          <div 
            className={`
              overflow-hidden transition-all duration-300 ease-in-out
              ${showBreakdown && revenueVisible ? 'max-h-20 opacity-100 mt-2' : 'max-h-0 opacity-0 mt-0'}
            `}
          >
            <p
              className={`${isMobile ? 'text-[11px]' : 'text-[13px]'}`}
              style={{ color: '#22c55eB3' }}
            >
              {loadingData
                ? 'Loading revenue...'
                : revenueVisible
                  ? [
                      `Cash: ₹${displayCash}`,
                      `Online: ₹${displayOnline}`,
                      displayCard > 0 ? `Card: ₹${displayCard}` : null,
                      membershipRevenue > 0 ? `Memberships: ₹${membershipRevenue}` : null,
                      snacksRevenue > 0 ? `Snacks: ₹${snacksRevenue}` : null,
                    ].filter(Boolean).join(' • ')
                  : ''}
            </p>
          </div>
          
          {!revenueVisible && (
            <p
              className={`${isMobile ? 'text-[11px] mt-1.5' : 'text-[13px] mt-2'}`}
              style={{ color: '#22c55eB3' }}
            >
              Hidden. Tap the eye icon to reveal.
            </p>
          )}
        </div>
      </div>

      <StatCard
        title="Today's Sessions"
        value={loadingData ? '...' : todaySessions}
        icon="🕐"
        gradient="radial-gradient(circle at top right, rgba(249, 115, 22, 0.15), transparent 70%), linear-gradient(135deg, rgba(30, 41, 59, 0.4), rgba(15, 23, 42, 0.6))"
        color="#f97316"
        isMobile={isMobile}
      />
    </div>
  );
}
