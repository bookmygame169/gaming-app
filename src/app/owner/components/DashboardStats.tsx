'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getBookingRevenueTotal,
  getBookingSnackTotal,
  getOwnerPaymentBucket,
  hasBookingSessionItems,
  isBillableRevenueBooking,
} from '@/lib/ownerRevenue';
import {
  getBookingDurationMinutes,
  isBookingActiveNow,
  parseBookingStartMinutes,
} from '@/lib/bookingFilters';
import { getLocalDateString } from '../utils';

const REVENUE_VISIBILITY_KEY = 'owner-dashboard-revenue-visible';

interface DashboardStatsProps {
  bookings: DashboardBooking[];
  subscriptions: DashboardSubscription[];
  activeTimers: Map<string, number>;
  loadingData: boolean;
  isMobile: boolean;
}

interface DashboardBooking {
  booking_date?: string | null;
  deleted_at?: string | null;
  payment_mode?: string | null;
  status?: string | null;
  source?: string | null;
  start_time?: string | null;
  duration?: number | null;
  total_amount?: number | string | null;
  booking_items?: Array<{ id: string; console?: string | null; price?: number | string | null }> | null;
  booking_orders?: Array<{ id: string; quantity?: number | null; total_price: number | null }>;
}

interface DashboardSubscription {
  amount_paid?: number | string | null;
  id: string;
  payment_mode?: string | null;
  purchase_date?: string | null;
}

const SkeletonCard = () => (
  <div className="relative px-4 py-4 flex flex-col gap-3 animate-pulse overflow-hidden">
    <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/[0.08]" />
    <div className="h-2 w-20 rounded-full bg-white/[0.07]" />
    <div className="h-7 w-12 bg-white/[0.07]" />
    <div className="h-2 w-24 rounded-full bg-white/[0.05]" />
  </div>
);

export function DashboardStats({ bookings, subscriptions, activeTimers, loadingData }: DashboardStatsProps) {
  const [showRevenue, setShowRevenue] = useState(false);
  const [loadedPreference, setLoadedPreference] = useState(false);
  const [period] = useState<'today' | 'week'>('today');

  useEffect(() => {
    try { setShowRevenue(localStorage.getItem(REVENUE_VISIBILITY_KEY) === 'true'); } catch { setShowRevenue(false); }
    finally { setLoadedPreference(true); }
  }, []);

  const toggleRevenueVisibility = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowRevenue(current => {
      const next = !current;
      try { localStorage.setItem(REVENUE_VISIBILITY_KEY, String(next)); } catch {}
      return next;
    });
  };

  const todayStr = getLocalDateString();
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = getLocalDateString(yesterday);
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = getLocalDateString(weekAgo);
  const prevWeekStart = new Date(); prevWeekStart.setDate(prevWeekStart.getDate() - 14);
  const prevWeekStartStr = getLocalDateString(prevWeekStart);

  const billableRevenueBookings = bookings.filter(isBillableRevenueBooking);
  const billableSessionBookings = billableRevenueBookings.filter((booking) => booking.source !== 'membership');
  const billableMembershipBookings = billableRevenueBookings.filter((booking) => booking.source === 'membership');

  const activeBookingsCount = billableSessionBookings.filter((booking) => isBookingActiveNow(booking)).length;
  const activeSubscriptionsCount = subscriptions.filter(sub => activeTimers.has(sub.id)).length;
  const activeNow = activeBookingsCount + activeSubscriptionsCount;

  const todayBookings = billableSessionBookings.filter((booking) => booking.booking_date === todayStr);
  const todaySessions = todayBookings.filter(b => b.booking_items && b.booking_items.length > 0).length;
  const todayMembershipBookings = billableMembershipBookings.filter((booking) => booking.booking_date === todayStr);

  // Week data
  const weekBookings = billableSessionBookings.filter(b => (b.booking_date ?? '') >= weekAgoStr && (b.booking_date ?? '') <= todayStr);
  const weekMembershipBookings = billableMembershipBookings.filter(b => (b.booking_date ?? '') >= weekAgoStr && (b.booking_date ?? '') <= todayStr);
  const prevWeekBookings = billableSessionBookings.filter(b => (b.booking_date ?? '') >= prevWeekStartStr && (b.booking_date ?? '') < weekAgoStr);
  const prevWeekMembershipBookings = billableMembershipBookings.filter(b => (b.booking_date ?? '') >= prevWeekStartStr && (b.booking_date ?? '') < weekAgoStr);

  const calcRevenue = (bkgs: DashboardBooking[]) => {
    return bkgs.reduce((s, b) => s + getBookingRevenueTotal(b), 0);
  };

  const totalRevenue = calcRevenue([...todayBookings, ...todayMembershipBookings]);
  const yesterdayBookings = billableSessionBookings.filter((booking) => booking.booking_date === yesterdayStr);
  const yesterdayMembershipBookings = billableMembershipBookings.filter((booking) => booking.booking_date === yesterdayStr);
  const yesterdayRevenue = calcRevenue([...yesterdayBookings, ...yesterdayMembershipBookings]);
  const yesterdaySessions = yesterdayBookings.filter(b => b.booking_items && b.booking_items.length > 0).length;

  const weekRevenue = calcRevenue([...weekBookings, ...weekMembershipBookings]);
  const prevWeekRevenue = calcRevenue([...prevWeekBookings, ...prevWeekMembershipBookings]);

  // Active card values based on period
  const displayRevenue = period === 'today' ? totalRevenue : weekRevenue;
  const displayPrevRevenue = period === 'today' ? yesterdayRevenue : prevWeekRevenue;


  const revenueVisible = loadedPreference && showRevenue;

  // 7-day sparkline data (daily revenue totals)
  const sparklineData = useMemo(() => {
    const days: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const dateStr = getLocalDateString(d);
      const rev = bookings
        .filter(b => b.booking_date === dateStr && isBillableRevenueBooking(b))
        .reduce((s, b) => s + getBookingRevenueTotal(b), 0);
      days.push(rev);
    }
    return days;
  }, [bookings]);
  const bookingPaymentSplit = todayBookings.reduce(
    (totals, booking) => {
      const bucket = getOwnerPaymentBucket(booking.payment_mode);
      totals[bucket] += getBookingRevenueTotal(booking);
      return totals;
    },
    { cash: 0, upi: 0 }
  );
  const membershipPaymentSplit = todayMembershipBookings.reduce(
    (totals, subscription) => {
      const bucket = getOwnerPaymentBucket(subscription.payment_mode);
      totals[bucket] += getBookingRevenueTotal(subscription);
      return totals;
    },
    { cash: 0, upi: 0 }
  );
  const cashTotal = bookingPaymentSplit.cash + membershipPaymentSplit.cash;
  const upiTotal = bookingPaymentSplit.upi + membershipPaymentSplit.upi;
  const paymentSplitTotal = cashTotal + upiTotal;
  const upiPct = paymentSplitTotal > 0 ? Math.round((upiTotal / paymentSplitTotal) * 100) : 0;
  const cashPct = paymentSplitTotal > 0 ? 100 - upiPct : 0;
  const totalCheckouts = todayBookings.length + todayMembershipBookings.length;
  const averageCheckout = totalCheckouts > 0 ? Math.round(totalRevenue / totalCheckouts) : 0;

  // The design's ACTIVE NOW card reads the floor rather than the ledger:
  // how many machines are occupied, when the next one frees up, and what is
  // still owed on the machines running now.
  const liveBookings = billableSessionBookings.filter((booking) => isBookingActiveNow(booking));

  const stationsBusy = liveBookings.reduce(
    (count, booking) => count + (booking.booking_items?.length || 0),
    0
  );

  const clockLabel = (minutesOfDay: number) => {
    const wrapped = ((minutesOfDay % 1440) + 1440) % 1440;
    const hours24 = Math.floor(wrapped / 60);
    const minutes = wrapped % 60;
    const suffix = hours24 >= 12 ? 'pm' : 'am';
    const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
    return `${hours12}:${String(minutes).padStart(2, '0')} ${suffix}`;
  };

  // Soonest end across the live sessions, so staff know which machine frees up
  // next without opening the floor cards.
  const soonestEnd = liveBookings.reduce<number | null>((soonest, booking) => {
    const start = parseBookingStartMinutes(booking.start_time);
    if (start === null) return soonest;
    const end = start + getBookingDurationMinutes(booking);
    return soonest === null || end < soonest ? end : soonest;
  }, null);

  // "Pending" is how this app has always marked a session that has not been
  // paid for; ActiveSessions reads it the same way for its UNPAID tag.
  const unpaidTotal = liveBookings
    .filter((booking) => (booking.status || '').toLowerCase() === 'pending')
    .reduce((sum, booking) => sum + getBookingRevenueTotal(booking), 0);

  // Share of today's sessions that left with something from the counter. The
  // design puts this next to average checkout because it is the lever on it.
  const sessionCheckouts = todayBookings.filter(hasBookingSessionItems);
  const withSnacks = sessionCheckouts.filter((booking) => getBookingSnackTotal(booking) > 0).length;
  const snackAttachPct =
    sessionCheckouts.length > 0 ? Math.round((withSnacks / sessionCheckouts.length) * 100) : 0;

  if (loadingData) {
    return (
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-5"><SkeletonCard /></div>
        <div className="col-span-12 lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      </div>
    );
  }

  const weekTotal = sparklineData.reduce((sum, day) => sum + day, 0);
  const weekAverage = Math.round(weekTotal / 7);
  const peakDay = Math.max(...sparklineData, 1);
  const dayLabels = (() => {
    const labels: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      labels.push(d.toLocaleDateString('en-IN', { weekday: 'short' }));
    }
    return labels;
  })();

  const money = (value: number) => `₹${value.toLocaleString('en-IN')}`;
  const delta = displayRevenue - displayPrevRevenue;

  return (
    <section
      className="grid grid-cols-1 gap-px border border-[#f2f0ea]/10 bg-[#f2f0ea]/10 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]"
    >
      {/* ── revenue, with the week behind it ── */}
      <div className="flex flex-col gap-3.5 bg-[#111113] px-5 pb-4 pt-[18px]">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[9.5px] tracking-[0.2em] text-[#f2f0ea]/[0.42]">
            {period === 'today' ? 'REVENUE · TODAY' : 'REVENUE · 7 DAYS'}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={toggleRevenueVisibility}
            className="font-mono text-[10px] tracking-[0.14em] text-[#f2f0ea]/40 transition-colors hover:text-[#d8ff3c]"
          >
            {revenueVisible ? 'HIDE' : 'SHOW'}
          </button>
        </div>

        <div className="flex items-end gap-3">
          <span className="text-[clamp(32px,3.4vw,46px)] font-black leading-[0.85] tracking-[-0.03em] text-[#f2f0ea]">
            {revenueVisible ? money(displayRevenue) : '₹ ••••'}
          </span>
          {revenueVisible && displayPrevRevenue > 0 && (
            <span
              className="whitespace-nowrap pb-[5px] font-mono text-[11.5px]"
              style={{ color: delta >= 0 ? '#d8ff3c' : '#ff5c2b' }}
            >
              {delta >= 0 ? '+' : '−'}
              {money(Math.abs(delta))} vs yest
            </span>
          )}
        </div>

        {/* Seven bars, today last and lit. The old card drew a sparkline of the
            same numbers, which said the shape of the week but never which day
            was which. */}
        <div className="flex h-11 items-end gap-[5px]">
          {sparklineData.map((value, index) => {
            const isToday = index === sparklineData.length - 1;
            return (
              <div key={index} className="flex flex-1 flex-col items-center gap-1.5">
                <div
                  className="w-full"
                  style={{
                    height: `${Math.max(3, Math.round((value / peakDay) * 34))}px`,
                    background: isToday ? '#d8ff3c' : 'rgba(242,240,234,.14)',
                  }}
                />
                <span
                  className="font-mono text-[9px]"
                  style={{ color: isToday ? '#d8ff3c' : 'rgba(242,240,234,.35)' }}
                >
                  {dayLabels[index]}
                </span>
              </div>
            );
          })}
        </div>

        <div className="font-mono text-[10.5px] text-[#f2f0ea]/[0.42]">
          {revenueVisible
            ? `7-day ${money(weekTotal)} · avg ${money(weekAverage)}/day`
            : '7-day totals hidden'}
        </div>
      </div>

      {/* ── who is on a machine right now ── */}
      <div className="flex flex-col gap-3 bg-[#111113] px-5 py-[18px]">
        <span className="font-mono text-[9.5px] tracking-[0.2em] text-[#f2f0ea]/[0.42]">ACTIVE NOW</span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[34px] font-black leading-none tracking-[-0.02em] text-[#f2f0ea]">
            {activeNow}
          </span>
          <span className="font-mono text-xs text-[#f2f0ea]/[0.42]">
            live session{activeNow === 1 ? '' : 's'}
          </span>
        </div>
        <div className="flex flex-col gap-[5px] font-mono text-[11px]">
          <div className="flex min-w-0 justify-between gap-2.5">
            <span className="truncate text-[#f2f0ea]/50">STATIONS BUSY</span>
            <span className="text-[#f2f0ea]">{stationsBusy}</span>
          </div>
          <div className="flex min-w-0 justify-between gap-2.5">
            <span className="truncate text-[#f2f0ea]/50">ENDS SOONEST</span>
            <span style={{ color: soonestEnd === null ? 'rgba(242,240,234,.35)' : '#d8ff3c' }}>
              {soonestEnd === null ? '—' : clockLabel(soonestEnd)}
            </span>
          </div>
          <div className="flex min-w-0 justify-between gap-2.5">
            <span className="truncate text-[#f2f0ea]/50">UNPAID</span>
            <span style={{ color: unpaidTotal > 0 ? '#ff5c2b' : 'rgba(242,240,234,.35)' }}>
              {revenueVisible ? money(unpaidTotal) : '••••'}
            </span>
          </div>
        </div>
      </div>

      {/* ── how they paid ── */}
      <div className="flex flex-col gap-3 bg-[#111113] px-5 py-[18px]">
        <span className="font-mono text-[9.5px] tracking-[0.2em] text-[#f2f0ea]/[0.42]">PAYMENT MIX</span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[34px] font-black leading-none tracking-[-0.02em] text-[#f2f0ea]">
            {upiPct}%
          </span>
          <span className="font-mono text-xs text-[#f2f0ea]/[0.42]">digital</span>
        </div>
        <div className="flex h-1 bg-[#f2f0ea]/10">
          <div style={{ width: `${upiPct}%`, background: '#d8ff3c' }} />
          <div style={{ width: `${cashPct}%`, background: '#f2f0ea' }} />
        </div>
        <div className="flex flex-col gap-[5px] font-mono text-[11px]">
          <div className="flex min-w-0 justify-between gap-2.5">
            <span className="truncate text-[#f2f0ea]/50">CASH</span>
            <span className="text-[#f2f0ea]">{revenueVisible ? money(cashTotal) : '••••'}</span>
          </div>
          <div className="flex min-w-0 justify-between gap-2.5">
            <span className="truncate text-[#f2f0ea]/50">UPI</span>
            <span style={{ color: upiTotal > 0 ? '#d8ff3c' : 'rgba(242,240,234,.35)' }}>
              {revenueVisible ? money(upiTotal) : '••••'}
            </span>
          </div>
        </div>
      </div>

      {/* ── what an average visit is worth ── */}
      <div className="flex flex-col gap-3 bg-[#111113] px-5 py-[18px]">
        <span className="font-mono text-[9.5px] tracking-[0.2em] text-[#f2f0ea]/[0.42]">AVG CHECKOUT</span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[34px] font-black leading-none tracking-[-0.02em] text-[#f2f0ea]">
            {revenueVisible ? money(averageCheckout) : '₹ ••'}
          </span>
        </div>
        <div className="flex flex-col gap-[5px] font-mono text-[11px]">
          <div className="flex min-w-0 justify-between gap-2.5">
            <span className="truncate text-[#f2f0ea]/50">SESSIONS TODAY</span>
            <span className="text-[#f2f0ea]">{todaySessions}</span>
          </div>
          <div className="flex min-w-0 justify-between gap-2.5">
            <span className="truncate text-[#f2f0ea]/50">YESTERDAY</span>
            <span className="text-[#f2f0ea]/50">{yesterdaySessions}</span>
          </div>
          <div className="flex min-w-0 justify-between gap-2.5">
            <span className="truncate text-[#f2f0ea]/50">SNACK ATTACH</span>
            <span style={{ color: snackAttachPct >= 30 ? '#d8ff3c' : '#ff5c2b' }}>
              {snackAttachPct}%
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
