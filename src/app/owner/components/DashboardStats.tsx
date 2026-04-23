'use client';

import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, TrendingUp, TrendingDown, Minus, Zap, Timer, Smartphone } from 'lucide-react';
import { getLocalDateString } from '../utils';

function Sparkline({ data, compact = false }: { data: number[]; compact?: boolean }) {
  if (data.length < 2) return null;
  const W = 320;
  const H = compact ? 34 : 52;
  const P = 4;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const xStep = (W - P * 2) / (data.length - 1);
  const pts = data.map((v, i) => [P + i * xStep, H - P - ((v - min) / range) * (H - P * 2)] as [number, number]);
  const polyline = pts.map(([x, y]) => `${x},${y}`).join(' ');
  const area = `${P},${H - P} ${polyline} ${P + (data.length - 1) * xStep},${H - P}`;
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: compact ? 34 : 52 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="spkGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#spkGrad)" />
      <polyline points={polyline} fill="none" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="3" fill="#22d3ee" />
      <circle cx={lx} cy={ly} r="7" fill="#22d3ee" opacity="0.18" />
    </svg>
  );
}

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
  source?: string | null;
  total_amount?: number | null;
  booking_items?: Array<{ id: string; console?: string | null }> | null;
  booking_orders?: Array<{ id: string; quantity?: number | null; total_price: number | null }>;
}

interface DashboardSubscription {
  amount_paid?: number | string | null;
  id: string;
  payment_mode?: string | null;
  purchase_date?: string | null;
}

const DIGITAL_PAYMENT_MODES = new Set(['online', 'upi', 'paytm', 'gpay', 'phonepe', 'card']);

function getPaymentBucket(mode?: string | null): 'cash' | 'upi' {
  const normalized = mode?.toLowerCase().trim() || 'cash';
  return DIGITAL_PAYMENT_MODES.has(normalized) ? 'upi' : 'cash';
}

function Trend({ today, yesterday }: { today: number; yesterday: number }) {
  if (yesterday === 0 && today === 0) return null;
  if (yesterday === 0) return <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md">New</span>;
  const pct = Math.round(((today - yesterday) / yesterday) * 100);
  if (pct === 0) return <span className="flex items-center gap-0.5 text-[10px] font-semibold text-slate-500"><Minus size={10} />0%</span>;
  const up = pct > 0;
  return (
    <span className={`flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${up ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'}`}>
      {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {up ? '+' : ''}{pct}%
    </span>
  );
}

const SkeletonCard = () => (
  <div className="relative rounded-xl glass px-4 py-4 flex flex-col gap-3 animate-pulse overflow-hidden">
    <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/[0.08]" />
    <div className="h-2 w-20 rounded-full bg-white/[0.07]" />
    <div className="h-7 w-12 rounded-lg bg-white/[0.07]" />
    <div className="h-2 w-24 rounded-full bg-white/[0.05]" />
  </div>
);

export function DashboardStats({ bookings, subscriptions, activeTimers, loadingData, isMobile }: DashboardStatsProps) {
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

  const billableSessionBookings = bookings.filter(
    (booking) => booking.payment_mode !== 'owner' && booking.status !== 'cancelled' && booking.source !== 'membership'
  );

  const activeBookingsCount = billableSessionBookings.filter(
    (booking) => booking.status === 'in-progress' && booking.booking_date === todayStr
  ).length;
  const activeSubscriptionsCount = subscriptions.filter(sub => activeTimers.has(sub.id)).length;
  const activeNow = activeBookingsCount + activeSubscriptionsCount;

  const todayBookings = billableSessionBookings.filter((booking) => booking.booking_date === todayStr);
  const todaySessions = todayBookings.filter(b => b.booking_items && b.booking_items.length > 0).length;
  const todaySubscriptions = subscriptions.filter(sub => sub.purchase_date && getLocalDateString(new Date(sub.purchase_date)) === todayStr);

  // Week data
  const weekBookings = billableSessionBookings.filter(b => (b.booking_date ?? '') >= weekAgoStr && (b.booking_date ?? '') <= todayStr);
  const weekSessions = weekBookings.filter(b => b.booking_items && b.booking_items.length > 0).length;
  const weekSubscriptions = subscriptions.filter(sub => {
    const d = sub.purchase_date ? getLocalDateString(new Date(sub.purchase_date)) : '';
    return d >= weekAgoStr && d <= todayStr;
  });
  const prevWeekBookings = billableSessionBookings.filter(b => (b.booking_date ?? '') >= prevWeekStartStr && (b.booking_date ?? '') < weekAgoStr);
  const prevWeekSubscriptions = subscriptions.filter(sub => {
    const d = sub.purchase_date ? getLocalDateString(new Date(sub.purchase_date)) : '';
    return d >= prevWeekStartStr && d < weekAgoStr;
  });

  const calcRevenue = (bkgs: DashboardBooking[], subs: DashboardSubscription[]) => {
    const bkgTotal = bkgs.reduce((s, b) => s + (b.total_amount || 0), 0);
    const subTotal = subs.reduce((s, sub) => {
      const amt = typeof sub.amount_paid === 'number' ? sub.amount_paid : parseFloat(sub.amount_paid ?? '0') || 0;
      return s + amt;
    }, 0);
    return bkgTotal + subTotal;
  };

  const totalRevenue = calcRevenue(todayBookings, todaySubscriptions);
  const yesterdayBookings = billableSessionBookings.filter((booking) => booking.booking_date === yesterdayStr);
  const yesterdaySubscriptions = subscriptions.filter(sub => sub.purchase_date && getLocalDateString(new Date(sub.purchase_date)) === yesterdayStr);
  const yesterdayRevenue = calcRevenue(yesterdayBookings, yesterdaySubscriptions);
  const yesterdaySessions = yesterdayBookings.filter(b => b.booking_items && b.booking_items.length > 0).length;

  const weekRevenue = calcRevenue(weekBookings, weekSubscriptions);
  const prevWeekRevenue = calcRevenue(prevWeekBookings, prevWeekSubscriptions);

  // Active card values based on period
  const displaySessions = period === 'today' ? todaySessions : weekSessions;
  const displayRevenue = period === 'today' ? totalRevenue : weekRevenue;
  const displayPrevRevenue = period === 'today' ? yesterdayRevenue : prevWeekRevenue;

  const membershipRevenue = todaySubscriptions.reduce((s, sub) => {
    const amt = typeof sub.amount_paid === 'number' ? sub.amount_paid : parseFloat(sub.amount_paid ?? '0') || 0;
    return s + amt;
  }, 0);

  const getFbTotal = (b: DashboardBooking) =>
    (b.booking_orders || []).reduce((s, o) => s + (o.total_price || 0), 0);

  let snacksRevenue = 0;
  let gamingCash = 0;
  let gamingUpi = 0;

  for (const b of todayBookings) {
    const isSnackOnly = !b.booking_items || b.booking_items.length === 0;
    const fbTotal = isSnackOnly ? (b.total_amount || 0) : getFbTotal(b);
    const gamingAmount = (b.total_amount || 0) - fbTotal;
    const paymentBucket = getPaymentBucket(b.payment_mode);
    snacksRevenue += fbTotal;
    if (paymentBucket === 'cash') gamingCash += gamingAmount;
    else gamingUpi += gamingAmount;
  }

  const revenueVisible = loadedPreference && showRevenue;

  // 7-day sparkline data (daily revenue totals)
  const sparklineData = useMemo(() => {
    const days: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const dateStr = getLocalDateString(d);
      const rev = bookings
        .filter(b => b.booking_date === dateStr && b.status !== 'cancelled' && b.payment_mode !== 'owner')
        .reduce((s, b) => s + (b.total_amount || 0), 0);
      days.push(rev);
    }
    return days;
  }, [bookings]);
  const gamingRevenue = gamingCash + gamingUpi;
  const totalForSplit = gamingRevenue + snacksRevenue + membershipRevenue;
  const gamingPct = totalForSplit > 0 ? Math.round((gamingRevenue / totalForSplit) * 100) : 0;
  const snacksPct = totalForSplit > 0 ? Math.round((snacksRevenue / totalForSplit) * 100) : 0;
  const memberPct = totalForSplit > 0 ? 100 - gamingPct - snacksPct : 0;
  const bookingPaymentSplit = todayBookings.reduce(
    (totals, booking) => {
      const bucket = getPaymentBucket(booking.payment_mode);
      totals[bucket] += booking.total_amount || 0;
      return totals;
    },
    { cash: 0, upi: 0 }
  );
  const subscriptionPaymentSplit = todaySubscriptions.reduce(
    (totals, subscription) => {
      const bucket = getPaymentBucket(subscription.payment_mode);
      const amount = typeof subscription.amount_paid === 'number'
        ? subscription.amount_paid
        : parseFloat(subscription.amount_paid ?? '0') || 0;
      totals[bucket] += amount;
      return totals;
    },
    { cash: 0, upi: 0 }
  );
  const cashTotal = bookingPaymentSplit.cash + subscriptionPaymentSplit.cash;
  const upiTotal = bookingPaymentSplit.upi + subscriptionPaymentSplit.upi;
  const paymentSplitTotal = cashTotal + upiTotal;
  const upiPct = paymentSplitTotal > 0 ? Math.round((upiTotal / paymentSplitTotal) * 100) : 0;
  const cashPct = paymentSplitTotal > 0 ? 100 - upiPct : 0;
  const totalCheckouts = todayBookings.length + todaySubscriptions.length;
  const averageCheckout = totalCheckouts > 0 ? Math.round(totalRevenue / totalCheckouts) : 0;
  const liveIndicatorColor = activeNow > 0 ? '#10b981' : '#475569';
  const sessionChange = todaySessions - yesterdaySessions;
  const compactTileClass = isMobile ? 'p-3' : 'p-4';
  const compactTileHeightClass = isMobile ? '' : 'min-h-[190px]';
  const compactRevenuePadding = isMobile ? 'p-3.5' : 'p-5';
  const paymentSummaryText = paymentSplitTotal > 0
    ? isMobile
      ? `${cashPct}% cash · ${totalCheckouts} checks`
      : `${cashPct}% cash across ${totalCheckouts} checkout${totalCheckouts === 1 ? '' : 's'}`
    : 'No payments recorded today';
  const activeSummaryText = activeNow > 0
    ? isMobile
      ? `${activeBookingsCount} gaming · ${activeSubscriptionsCount} mem`
      : `${activeBookingsCount} gaming · ${activeSubscriptionsCount} memberships`
    : 'No active sessions right now';
  const sessionsSummaryText = totalCheckouts > 0
    ? isMobile
      ? `Avg ₹${averageCheckout.toLocaleString('en-IN')}`
      : `Avg checkout ₹${averageCheckout.toLocaleString('en-IN')}`
    : 'No completed checkouts today';

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

  return (
    <div>
      {/* Main grid: revenue card (5/12) + 3 KPI tiles side-by-side (7/12) */}
      <div className={`grid grid-cols-12 ${isMobile ? 'gap-2.5' : 'gap-4'}`}>

        {/* ── BIG REVENUE CARD ── */}
        <div className={`col-span-12 lg:col-span-5 glass rounded-2xl ${compactRevenuePadding} relative overflow-hidden`} style={{ position: 'relative' }}>
          {/* Glow orb */}
          <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(closest-side, rgba(6,182,212,0.18), transparent)' }} />
          {/* Noise overlay */}
          <div className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{ backgroundImage: 'linear-gradient(to bottom right, rgba(255,255,255,0.03), transparent 30%)', mixBlendMode: 'overlay' }} />

          {/* Top row */}
          <div className="relative flex items-start justify-between gap-2">
            <div className="text-[10px] text-slate-500 font-semibold" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.12em' }}>
              {period === 'today' ? 'Today · Revenue' : '7 Days · Revenue'}
            </div>
            <div className="flex items-center gap-1.5">
              {revenueVisible && (
                <div className="flex items-center gap-1 text-[10px] text-slate-500">
                  <TrendingUp size={isMobile ? 11 : 12} />
                  <Trend today={displayRevenue} yesterday={displayPrevRevenue} />
                  {!isMobile && <span>vs yest</span>}
                </div>
              )}
              <button type="button" onClick={toggleRevenueVisibility} className="p-1 rounded text-slate-500 hover:text-slate-300 transition-colors">
                {revenueVisible ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </div>

          {/* Revenue amount + sessions */}
          <div className={`relative flex items-baseline gap-2 ${isMobile ? 'mt-1' : 'mt-2'}`}>
            <p className="mono font-bold text-white leading-none tracking-tight" style={{ fontSize: isMobile ? 28 : 44 }}>
              {revenueVisible ? `₹${displayRevenue.toLocaleString('en-IN')}` : '₹ ••••••'}
            </p>
            <span className="text-[10px] text-slate-500">{displaySessions} sessions</span>
          </div>

          {/* Sparkline */}
          {revenueVisible && <div className={`${isMobile ? 'mt-2' : 'mt-4'} relative`}><Sparkline data={sparklineData} compact={isMobile} /></div>}

          {/* Split bar */}
          {revenueVisible && totalForSplit > 0 && (
            <div className={isMobile ? 'mt-2' : 'mt-4'}>
              <div className={`${isMobile ? 'h-1.5' : 'h-2'} rounded-full overflow-hidden flex`} style={{ background: 'rgba(255,255,255,0.04)' }}>
                {gamingPct > 0 && <div style={{ width: `${gamingPct}%`, background: 'linear-gradient(90deg,#06b6d4,#22d3ee)' }} />}
                {snacksPct > 0 && <div style={{ width: `${snacksPct}%`, background: 'linear-gradient(90deg,#f59e0b,#fbbf24)' }} />}
                {memberPct > 0 && <div style={{ width: `${memberPct}%`, background: 'linear-gradient(90deg,#8b5cf6,#a78bfa)' }} />}
              </div>
              {isMobile ? (
                <div className="mt-2 flex items-center gap-3 overflow-x-auto no-scrollbar">
                  {gamingRevenue > 0 && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="h-6 w-1.5 rounded shrink-0" style={{ background: '#06b6d4' }} />
                      <div>
                        <div className="text-[9px] text-slate-500" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.1em' }}>Gaming</div>
                        <p className="mono text-[14px] font-bold text-white">₹{gamingRevenue.toLocaleString('en-IN')}</p>
                      </div>
                    </div>
                  )}
                  {snacksRevenue > 0 && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="h-6 w-1.5 rounded shrink-0" style={{ background: '#f59e0b' }} />
                      <div>
                        <div className="text-[9px] text-slate-500" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.1em' }}>Snacks</div>
                        <p className="mono text-[14px] font-bold text-white">₹{snacksRevenue.toLocaleString('en-IN')}</p>
                      </div>
                    </div>
                  )}
                  {membershipRevenue > 0 && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="h-6 w-1.5 rounded shrink-0" style={{ background: '#8b5cf6' }} />
                      <div>
                        <div className="text-[9px] text-slate-500" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.1em' }}>Members</div>
                        <p className="mono text-[14px] font-bold text-white">₹{membershipRevenue.toLocaleString('en-IN')}</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  {gamingRevenue > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-8 rounded shrink-0" style={{ background: '#06b6d4' }} />
                      <div>
                        <div className="text-[10px] text-slate-500" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.1em' }}>Gaming · {gamingPct}%</div>
                        <p className="mono font-bold text-white text-base">₹{gamingRevenue.toLocaleString('en-IN')}</p>
                      </div>
                    </div>
                  )}
                  {snacksRevenue > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-8 rounded shrink-0" style={{ background: '#f59e0b' }} />
                      <div>
                        <div className="text-[10px] text-slate-500" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.1em' }}>Snacks · {snacksPct}%</div>
                        <p className="mono font-bold text-white text-base">₹{snacksRevenue.toLocaleString('en-IN')}</p>
                      </div>
                    </div>
                  )}
                  {membershipRevenue > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-8 rounded shrink-0" style={{ background: '#8b5cf6' }} />
                      <div>
                        <div className="text-[10px] text-slate-500" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.1em' }}>Members · {memberPct}%</div>
                        <p className="mono font-bold text-white text-base">₹{membershipRevenue.toLocaleString('en-IN')}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── 3 KPI TILES side-by-side ── */}
        <div className={`col-span-12 lg:col-span-7 grid ${isMobile ? 'grid-cols-1 gap-2.5' : 'grid-cols-1 sm:grid-cols-3 gap-4'}`}>

          {/* Payment split */}
          <div className={`glass rounded-2xl ${compactTileClass} relative overflow-hidden`}>
            <div className="absolute inset-0 rounded-2xl pointer-events-none"
              style={{ backgroundImage: 'linear-gradient(to bottom right, rgba(255,255,255,0.03), transparent 30%)', mixBlendMode: 'overlay' }} />
            <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(closest-side, rgba(6,182,212,0.12), transparent)' }} />
            {isMobile ? (
              <div className="relative flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(6,182,212,0.18)', color: '#22d3ee' }}>
                      <Smartphone size={13} />
                    </div>
                    <div className="text-[10px] text-slate-500" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.12em' }}>Payment split</div>
                  </div>
                  <span className="text-[10px] text-slate-600" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.1em' }}>Today</span>
                </div>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="mono text-[22px] font-bold text-white">{upiPct}%</span>
                      <span className="text-[10px] text-slate-500">digital</span>
                    </div>
                    <div className="mt-1 text-[10px] text-slate-500">{paymentSummaryText}</div>
                  </div>
                  <div className="grid min-w-[132px] grid-cols-2 gap-1.5 text-[10px]">
                    <div className="rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-1.5">
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shrink-0" />
                        UPI
                      </div>
                      <div className="mono mt-0.5 text-[12px] font-semibold text-white">₹{upiTotal.toLocaleString('en-IN')}</div>
                    </div>
                    <div className="rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-1.5">
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                        Cash
                      </div>
                      <div className="mono mt-0.5 text-[12px] font-semibold text-white">₹{cashTotal.toLocaleString('en-IN')}</div>
                    </div>
                  </div>
                </div>
                {paymentSplitTotal > 0 && (
                  <div className="h-1.5 rounded-full overflow-hidden flex" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    {upiTotal > 0 && <div style={{ width: `${upiPct}%`, background: '#06b6d4' }} />}
                    {cashTotal > 0 && <div style={{ width: `${cashPct}%`, background: '#10b981' }} />}
                  </div>
                )}
              </div>
            ) : (
              <div className={`relative flex h-full flex-col ${compactTileHeightClass}`}>
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(6,182,212,0.18)', color: '#22d3ee' }}>
                    <Smartphone size={14} />
                  </div>
                  <span className="text-[10px] text-slate-600" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.1em' }}>Today</span>
                </div>
                <div className="mt-4 text-[10px] text-slate-500" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.12em' }}>Payment split</div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="mono font-bold text-white" style={{ fontSize: 26 }}>{upiPct}%</span>
                  <span className="text-[10px] text-slate-500">digital</span>
                </div>
                <div className="mt-1.5 text-[10px] text-slate-500">{paymentSummaryText}</div>
                {paymentSplitTotal > 0 && (
                  <>
                    <div className="mt-4 h-1.5 rounded-full overflow-hidden flex" style={{ background: 'rgba(255,255,255,0.04)' }}>
                      {upiTotal > 0 && <div style={{ width: `${upiPct}%`, background: '#06b6d4' }} />}
                      {cashTotal > 0 && <div style={{ width: `${cashPct}%`, background: '#10b981' }} />}
                    </div>
                    <div className="mt-auto pt-4 space-y-2 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-slate-500">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                          UPI
                        </span>
                        <span className="mono text-white">₹{upiTotal.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-slate-500">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                          Cash
                        </span>
                        <span className="mono text-white">₹{cashTotal.toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Active Now */}
          <div className={`glass rounded-2xl ${compactTileClass} relative overflow-hidden`}>
            <div className="absolute inset-0 rounded-2xl pointer-events-none"
              style={{ backgroundImage: 'linear-gradient(to bottom right, rgba(255,255,255,0.03), transparent 30%)', mixBlendMode: 'overlay' }} />
            <div className="absolute -left-10 -bottom-10 h-28 w-28 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(closest-side, rgba(16,185,129,0.12), transparent)' }} />
            {isMobile ? (
              <div className="relative flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.18)', color: '#10b981' }}>
                      <Zap size={13} />
                    </div>
                    <div className="text-[10px] text-slate-500" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.12em' }}>Active now</div>
                  </div>
                  <span className="relative inline-block w-1.5 h-1.5 rounded-full" style={{ background: liveIndicatorColor, color: liveIndicatorColor }} />
                </div>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="mono text-[22px] font-bold text-white">{activeNow}</span>
                      <span className="text-[10px] text-slate-500">live</span>
                    </div>
                    <div className="mt-1 text-[10px] text-slate-500">{activeSummaryText}</div>
                  </div>
                  <div className="grid min-w-[132px] grid-cols-2 gap-1.5 text-[10px]">
                    <div className="rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-1.5">
                      <div className="text-slate-500" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.1em' }}>Gaming</div>
                      <div className="mono mt-0.5 text-[12px] font-bold text-white">{activeBookingsCount}</div>
                    </div>
                    <div className="rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-1.5">
                      <div className="text-slate-500" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.1em' }}>Members</div>
                      <div className="mono mt-0.5 text-[12px] font-bold text-white">{activeSubscriptionsCount}</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className={`relative flex h-full flex-col ${compactTileHeightClass}`}>
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.18)', color: '#10b981' }}>
                    <Zap size={14} />
                  </div>
                  <span className="relative inline-block w-1.5 h-1.5 rounded-full" style={{ background: liveIndicatorColor, color: liveIndicatorColor }} />
                </div>
                <div className="mt-4 text-[10px] text-slate-500" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.12em' }}>Active now</div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="mono font-bold text-white" style={{ fontSize: 26 }}>{activeNow}</span>
                  <span className="text-[10px] text-slate-500">live sessions</span>
                </div>
                <div className="mt-1.5 text-[10px] text-slate-500">{activeSummaryText}</div>
                <div className="mt-auto grid grid-cols-2 gap-1.5 pt-4">
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                    <div className="text-[10px] text-slate-500" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.1em' }}>Gaming</div>
                    <div className="mono mt-0.5 text-[13px] font-bold text-white">{activeBookingsCount}</div>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                    <div className="text-[10px] text-slate-500" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.1em' }}>Members</div>
                    <div className="mono mt-0.5 text-[13px] font-bold text-white">{activeSubscriptionsCount}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sessions */}
          <div className={`glass rounded-2xl ${compactTileClass} relative overflow-hidden`}>
            <div className="absolute inset-0 rounded-2xl pointer-events-none"
              style={{ backgroundImage: 'linear-gradient(to bottom right, rgba(255,255,255,0.03), transparent 30%)', mixBlendMode: 'overlay' }} />
            <div className="absolute -right-10 -bottom-10 h-28 w-28 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(closest-side, rgba(6,182,212,0.12), transparent)' }} />
            {isMobile ? (
              <div className="relative flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(6,182,212,0.18)', color: '#06b6d4' }}>
                      <Timer size={13} />
                    </div>
                    <div className="text-[10px] text-slate-500" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.12em' }}>Sessions</div>
                  </div>
                  <span className={`text-[10px] font-semibold ${sessionChange > 0 ? 'text-emerald-400' : sessionChange < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                    {sessionChange > 0 ? `+${sessionChange}` : sessionChange} vs yest
                  </span>
                </div>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="mono text-[22px] font-bold text-white">{displaySessions}</span>
                      <span className="text-[10px] text-slate-500">today</span>
                    </div>
                    <div className="mt-1 text-[10px] text-slate-500">{sessionsSummaryText}</div>
                  </div>
                  <div className="grid min-w-[132px] grid-cols-2 gap-1.5 text-[10px]">
                    <div className="rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-1.5">
                      <div className="text-slate-500" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.1em' }}>Yesterday</div>
                      <div className="mono mt-0.5 text-[12px] font-bold text-white">{yesterdaySessions}</div>
                    </div>
                    <div className="rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-1.5">
                      <div className="text-slate-500" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.1em' }}>Checkouts</div>
                      <div className="mono mt-0.5 text-[12px] font-bold text-white">{totalCheckouts}</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className={`relative flex h-full flex-col ${compactTileHeightClass}`}>
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(6,182,212,0.18)', color: '#06b6d4' }}>
                    <Timer size={14} />
                  </div>
                  <span className={`text-[10px] font-semibold ${sessionChange > 0 ? 'text-emerald-400' : sessionChange < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                    {sessionChange > 0 ? `+${sessionChange}` : sessionChange} vs yest
                  </span>
                </div>
                <div className="mt-4 text-[10px] text-slate-500" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.12em' }}>
                  Sessions
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="mono font-bold text-white" style={{ fontSize: 26 }}>{displaySessions}</span>
                  <span className="text-[10px] text-slate-500">today</span>
                </div>
                <div className="mt-1.5 text-[10px] text-slate-500">{sessionsSummaryText}</div>
                <div className="mt-auto grid grid-cols-2 gap-1.5 pt-4">
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                    <div className="text-[10px] text-slate-500" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.1em' }}>Yesterday</div>
                    <div className="mono mt-0.5 text-[13px] font-bold text-white">{yesterdaySessions}</div>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                    <div className="text-[10px] text-slate-500" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.1em' }}>Checkouts</div>
                    <div className="mono mt-0.5 text-[13px] font-bold text-white">{totalCheckouts}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
