'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff, TrendingUp, TrendingDown, Minus } from 'lucide-react';
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
  payment_mode?: string | null;
  status?: string | null;
  total_amount?: number | null;
  booking_items?: Array<{ id: string; console?: string | null }> | null;
  booking_orders?: Array<{ id: string; quantity?: number | null; total_price: number | null }>;
}

interface DashboardSubscription {
  amount_paid?: number | string | null;
  id: string;
  purchase_date?: string | null;
}

function Trend({ today, yesterday }: { today: number; yesterday: number }) {
  if (yesterday === 0 && today === 0) return null;
  if (yesterday === 0) return <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">New</span>;
  const pct = Math.round(((today - yesterday) / yesterday) * 100);
  if (pct === 0) return <span className="flex items-center gap-0.5 text-[10px] font-semibold text-slate-400"><Minus size={10} />0%</span>;
  const up = pct > 0;
  return (
    <span className={`flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded ${up ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'}`}>
      {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {up ? '+' : ''}{pct}% vs yesterday
    </span>
  );
}

export function DashboardStats({ bookings, subscriptions, activeTimers, loadingData, isMobile }: DashboardStatsProps) {
  const [showRevenue, setShowRevenue] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [loadedPreference, setLoadedPreference] = useState(false);

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
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = getLocalDateString(yesterday);

  // Today's stats
  const activeBookingsCount = bookings.filter(b => b.status === 'in-progress' && b.booking_date === todayStr).length;
  const activeSubscriptionsCount = subscriptions.filter(sub => activeTimers.has(sub.id)).length;
  const activeNow = activeBookingsCount + activeSubscriptionsCount;

  const todayBookings = bookings.filter(b => b.booking_date === todayStr && b.status !== 'cancelled' && b.payment_mode !== 'owner');
  // Only count gaming sessions (bookings with console items), not standalone snack sales
  const todaySessions = todayBookings.filter(b => b.booking_items && b.booking_items.length > 0).length;
  const pendingBookings = bookings.filter(b => b.booking_date === todayStr && b.status === 'confirmed').length;

  const todaySubscriptions = subscriptions.filter(sub => sub.purchase_date && getLocalDateString(new Date(sub.purchase_date)) === todayStr);

  const calcRevenue = (bkgs: DashboardBooking[], subs: DashboardSubscription[]) => {
    const bkgTotal = bkgs.reduce((s, b) => s + (b.total_amount || 0), 0);
    const subTotal = subs.reduce((s, sub) => {
      const amt = typeof sub.amount_paid === 'number' ? sub.amount_paid : parseFloat(sub.amount_paid ?? '0') || 0;
      return s + amt;
    }, 0);
    return bkgTotal + subTotal;
  };

  const totalRevenue = calcRevenue(todayBookings, todaySubscriptions);

  // Yesterday's stats for trend
  const yesterdayBookings = bookings.filter(b => b.booking_date === yesterdayStr && b.status !== 'cancelled' && b.payment_mode !== 'owner');
  const yesterdaySessions = yesterdayBookings.filter(b => b.booking_items && b.booking_items.length > 0).length;
  const yesterdaySubscriptions = subscriptions.filter(sub => sub.purchase_date && getLocalDateString(new Date(sub.purchase_date)) === yesterdayStr);
  const yesterdayRevenue = calcRevenue(yesterdayBookings, yesterdaySubscriptions);

  // Revenue breakdown
  const ONLINE_MODES = ['online', 'upi', 'paytm', 'gpay', 'phonepe', 'card'];
  const cashTotal = todayBookings.filter(b => b.payment_mode?.toLowerCase() === 'cash').reduce((s, b) => s + (b.total_amount || 0), 0);
  const onlineTotal = todayBookings.filter(b => ONLINE_MODES.includes(b.payment_mode?.toLowerCase() || '')).reduce((s, b) => s + (b.total_amount || 0), 0);
  const cardTotal = 0; // merged into onlineTotal above
  const membershipRevenue = todaySubscriptions.reduce((s, sub) => {
    const amt = typeof sub.amount_paid === 'number' ? sub.amount_paid : parseFloat(sub.amount_paid ?? '0') || 0;
    return s + amt;
  }, 0);
  // Snack-only bookings have no console items. Use total_amount directly (reliable).
  // Gaming+snack mixed bookings: F&B is bundled in total_amount, already in cashTotal/onlineTotal.
  const snackOnlyBookings = todayBookings.filter(b => !b.booking_items || b.booking_items.length === 0);
  const snacksRevenue = snackOnlyBookings.reduce((s, b) => s + (b.total_amount || 0), 0);
  // Deduct snack-only amounts from cash/online to avoid double-counting in gaming totals
  const snackCash = snackOnlyBookings.filter(b => b.payment_mode?.toLowerCase() === 'cash').reduce((s, b) => s + (b.total_amount || 0), 0);
  const snackOnline = snackOnlyBookings.filter(b => ONLINE_MODES.includes(b.payment_mode?.toLowerCase() || '')).reduce((s, b) => s + (b.total_amount || 0), 0);
  const gamingCash = cashTotal - snackCash;
  const gamingOnline = onlineTotal - snackOnline;

  const revenueVisible = loadedPreference && showRevenue;

  const cardBase = `relative overflow-hidden rounded-2xl border p-5 flex flex-col justify-between min-h-[120px]`;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">

      {/* Active Now */}
      <div className={cardBase} style={{ background: 'radial-gradient(circle at top right, rgba(239,68,68,0.15), transparent 70%), linear-gradient(135deg, rgba(30,41,59,0.4), rgba(15,23,42,0.6))', borderColor: '#ef444440' }}>
        <div className="absolute -top-3 right-8 text-5xl opacity-10">▶️</div>
        <p className="text-[10px] uppercase tracking-widest font-bold text-red-400/80 mb-1">Active Now</p>
        <p className="text-4xl font-bold text-red-400 leading-none">{loadingData ? '—' : activeNow}</p>
        <p className="text-[11px] text-slate-500 mt-2">sessions in progress</p>
      </div>

      {/* Today's Revenue */}
      <div
        onClick={() => revenueVisible && setShowBreakdown(p => !p)}
        className={`${cardBase} ${revenueVisible ? 'cursor-pointer hover:border-emerald-500/40' : ''}`}
        style={{ background: 'radial-gradient(circle at top right, rgba(34,197,94,0.15), transparent 70%), linear-gradient(135deg, rgba(30,41,59,0.4), rgba(15,23,42,0.6))', borderColor: '#22c55e40' }}
      >
        <div className="absolute -top-3 right-8 text-5xl opacity-10">₹</div>
        <div className="flex items-start justify-between">
          <p className="text-[10px] uppercase tracking-widest font-bold text-emerald-400/80">Today's Revenue</p>
          <button type="button" onClick={toggleRevenueVisibility} className="p-1 rounded-full text-emerald-400 hover:bg-emerald-500/10 transition-colors z-10" aria-label="toggle revenue">
            {revenueVisible ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <p className="text-4xl font-bold text-emerald-400 leading-none my-1">
          {loadingData ? '—' : revenueVisible ? `₹${totalRevenue.toLocaleString('en-IN')}` : '••••••'}
        </p>
        {revenueVisible && (
          <div className="flex items-center justify-between mt-1">
            <Trend today={totalRevenue} yesterday={yesterdayRevenue} />
            {!showBreakdown && <span className="text-[9px] text-emerald-400/40 animate-pulse">tap for breakdown</span>}
          </div>
        )}
        {showBreakdown && revenueVisible && (
          <div className="mt-2 pt-2 border-t border-emerald-500/10 grid grid-cols-2 gap-x-3 gap-y-0.5">
            {([
              // Show gaming cash/online; fall back to full cash/online if no snacks to deduct
              ...(gamingCash > 0 ? [['Cash', gamingCash]] : cashTotal > 0 && snacksRevenue === 0 ? [['Cash', cashTotal]] : []),
              ...(gamingOnline > 0 ? [['Online/UPI', gamingOnline]] : onlineTotal > 0 && snacksRevenue === 0 ? [['Online/UPI', onlineTotal]] : []),
              ...(membershipRevenue > 0 ? [['Memberships', membershipRevenue]] : []),
              ...(snacksRevenue > 0 ? [['Snacks', snacksRevenue]] : []),
            ] as [string, number][]).map(([label, val]) => (
              <div key={label} className="flex justify-between text-[10px]">
                <span className="text-slate-400">{label}</span>
                <span className="text-emerald-400 font-semibold">₹{val.toLocaleString('en-IN')}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Today's Sessions */}
      <div className={cardBase} style={{ background: 'radial-gradient(circle at top right, rgba(249,115,22,0.15), transparent 70%), linear-gradient(135deg, rgba(30,41,59,0.4), rgba(15,23,42,0.6))', borderColor: '#f9731640' }}>
        <div className="absolute -top-3 right-8 text-5xl opacity-10">🕐</div>
        <p className="text-[10px] uppercase tracking-widest font-bold text-orange-400/80 mb-1">Today's Sessions</p>
        <p className="text-4xl font-bold text-orange-400 leading-none">{loadingData ? '—' : todaySessions}</p>
        <div className="flex items-center justify-between mt-2">
          <Trend today={todaySessions} yesterday={yesterdaySessions} />
        </div>
      </div>

      {/* Pending */}
      <div className={cardBase} style={{ background: 'radial-gradient(circle at top right, rgba(139,92,246,0.15), transparent 70%), linear-gradient(135deg, rgba(30,41,59,0.4), rgba(15,23,42,0.6))', borderColor: '#8b5cf640' }}>
        <div className="absolute -top-3 right-8 text-5xl opacity-10">📋</div>
        <p className="text-[10px] uppercase tracking-widest font-bold text-violet-400/80 mb-1">Pending Today</p>
        <p className="text-4xl font-bold text-violet-400 leading-none">{loadingData ? '—' : pendingBookings}</p>
        <p className="text-[11px] text-slate-500 mt-2">bookings awaiting start</p>
      </div>

    </div>
  );
}
