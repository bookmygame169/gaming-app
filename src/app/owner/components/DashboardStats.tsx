'use client';

import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, TrendingUp, TrendingDown, Minus, Zap, IndianRupee, Timer } from 'lucide-react';
import { getLocalDateString } from '../utils';

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const W = 320, H = 52, P = 4;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const xStep = (W - P * 2) / (data.length - 1);
  const pts = data.map((v, i) => [P + i * xStep, H - P - ((v - min) / range) * (H - P * 2)] as [number, number]);
  const polyline = pts.map(([x, y]) => `${x},${y}`).join(' ');
  const area = `${P},${H - P} ${polyline} ${P + (data.length - 1) * xStep},${H - P}`;
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 52 }} preserveAspectRatio="none">
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
  purchase_date?: string | null;
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

export function DashboardStats({ bookings, subscriptions, activeTimers, loadingData }: DashboardStatsProps) {
  const [showRevenue, setShowRevenue] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [loadedPreference, setLoadedPreference] = useState(false);
  const [period, setPeriod] = useState<'today' | 'week'>('today');

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
  const pendingBookings = billableSessionBookings.filter(
    (booking) => booking.booking_date === todayStr && booking.status === 'confirmed'
  ).length;
  const todaySubscriptions = subscriptions.filter(sub => sub.purchase_date && getLocalDateString(new Date(sub.purchase_date)) === todayStr);

  // Week data
  const weekBookings = billableSessionBookings.filter(b => (b.booking_date ?? '') >= weekAgoStr && (b.booking_date ?? '') <= todayStr);
  const weekSessions = weekBookings.filter(b => b.booking_items && b.booking_items.length > 0).length;
  const weekPending = billableSessionBookings.filter(b => (b.booking_date ?? '') >= weekAgoStr && (b.booking_date ?? '') <= todayStr && b.status === 'confirmed').length;
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
  const yesterdaySessions = yesterdayBookings.filter(b => b.booking_items && b.booking_items.length > 0).length;
  const yesterdaySubscriptions = subscriptions.filter(sub => sub.purchase_date && getLocalDateString(new Date(sub.purchase_date)) === yesterdayStr);
  const yesterdayRevenue = calcRevenue(yesterdayBookings, yesterdaySubscriptions);

  const weekRevenue = calcRevenue(weekBookings, weekSubscriptions);
  const prevWeekRevenue = calcRevenue(prevWeekBookings, prevWeekSubscriptions);

  // Active card values based on period
  const displaySessions = period === 'today' ? todaySessions : weekSessions;
  const displayRevenue = period === 'today' ? totalRevenue : weekRevenue;
  const displayPrevRevenue = period === 'today' ? yesterdayRevenue : prevWeekRevenue;
  const displayPrevSessions = period === 'today' ? yesterdaySessions : Math.round(prevWeekBookings.filter(b => b.booking_items && b.booking_items.length > 0).length);
  const displayPending = period === 'today' ? pendingBookings : weekPending;

  const ONLINE_MODES = ['online', 'upi', 'paytm', 'gpay', 'phonepe', 'card'];
  const membershipRevenue = todaySubscriptions.reduce((s, sub) => {
    const amt = typeof sub.amount_paid === 'number' ? sub.amount_paid : parseFloat(sub.amount_paid ?? '0') || 0;
    return s + amt;
  }, 0);

  const getFbTotal = (b: DashboardBooking) =>
    (b.booking_orders || []).reduce((s, o) => s + (o.total_price || 0), 0);

  let snacksRevenue = 0;
  let gamingCash = 0;
  let gamingOnline = 0;

  for (const b of todayBookings) {
    const isSnackOnly = !b.booking_items || b.booking_items.length === 0;
    const fbTotal = isSnackOnly ? (b.total_amount || 0) : getFbTotal(b);
    const gamingAmount = (b.total_amount || 0) - fbTotal;
    const mode = b.payment_mode?.toLowerCase() || '';
    snacksRevenue += fbTotal;
    if (mode === 'cash') gamingCash += gamingAmount;
    else if (ONLINE_MODES.includes(mode)) gamingOnline += gamingAmount;
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
  const gamingRevenue = gamingCash + gamingOnline;
  const totalForSplit = gamingRevenue + snacksRevenue + membershipRevenue;
  const gamingPct = totalForSplit > 0 ? Math.round((gamingRevenue / totalForSplit) * 100) : 0;
  const snacksPct = totalForSplit > 0 ? Math.round((snacksRevenue / totalForSplit) * 100) : 0;
  const memberPct = totalForSplit > 0 ? 100 - gamingPct - snacksPct : 0;
  const cashTotal = todayBookings.filter(b => (b.payment_mode || '').toLowerCase() === 'cash').reduce((s, b) => s + (b.total_amount || 0), 0);
  const upiTotal = todayBookings.filter(b => ONLINE_MODES.includes((b.payment_mode || '').toLowerCase())).reduce((s, b) => s + (b.total_amount || 0), 0);

  if (loadingData) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-3 mb-6">
        <SkeletonCard />
        <div className="grid grid-rows-3 gap-3">
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      </div>
    );
  }


  return (
    <div className="mb-6 space-y-3">
      {/* Header row with period toggle */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest">Performance</p>
        <div className="flex rounded-lg overflow-hidden border border-white/[0.08] text-xs">
          <button onClick={() => setPeriod('today')} className={`px-3 py-1.5 font-semibold transition-colors ${period === 'today' ? 'bg-white/[0.08] text-white' : 'bg-transparent text-slate-500 hover:text-slate-300'}`}>Today</button>
          <button onClick={() => setPeriod('week')} className={`px-3 py-1.5 font-semibold transition-colors ${period === 'week' ? 'bg-white/[0.08] text-white' : 'bg-transparent text-slate-500 hover:text-slate-300'}`}>7 Days</button>
        </div>
      </div>

      {/* Main grid: big revenue card + 3 stacked small cards */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-3">

        {/* ── BIG REVENUE CARD ── */}
        <div className="relative glass rounded-2xl p-5 overflow-hidden flex flex-col justify-between min-h-[180px]">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-emerald-500" />
          {/* Noise + glow overlays */}
          <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{ background: 'linear-gradient(to bottom right, rgba(255,255,255,0.03), transparent 35%)', mixBlendMode: 'overlay' }} />
          <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full pointer-events-none" style={{ background: 'radial-gradient(closest-side, rgba(6,182,212,0.15), transparent)' }} />

          {/* Top row */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <IndianRupee size={13} className="text-emerald-400" />
              </div>
              <span className="text-[10px] uppercase tracking-widest font-semibold text-slate-400">
                {period === 'today' ? 'Today · Revenue' : '7 Days · Revenue'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {revenueVisible && <Trend today={displayRevenue} yesterday={displayPrevRevenue} />}
              <button type="button" onClick={toggleRevenueVisibility} className="p-1 rounded text-slate-500 hover:text-slate-300 transition-colors">
                {revenueVisible ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </div>

          {/* Revenue amount */}
          <p className="mono text-4xl md:text-5xl font-bold text-white leading-none tracking-tight mb-3">
            {revenueVisible ? `₹${displayRevenue.toLocaleString('en-IN')}` : '₹ ••••••'}
          </p>

          {/* Sparkline */}
          {revenueVisible && <div className="mb-2 -mx-1"><Sparkline data={sparklineData} /></div>}

          {/* Collections row */}
          {revenueVisible && (period === 'today') && (cashTotal > 0 || upiTotal > 0) && (
            <div className="flex items-center gap-4 mb-3">
              {upiTotal > 0 && (
                <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block" />
                  UPI <span className="text-white font-semibold ml-1">₹{upiTotal.toLocaleString('en-IN')}</span>
                </span>
              )}
              {cashTotal > 0 && (
                <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                  Cash <span className="text-white font-semibold ml-1">₹{cashTotal.toLocaleString('en-IN')}</span>
                </span>
              )}
            </div>
          )}

          {/* Gaming / Snacks split bar */}
          {revenueVisible && totalForSplit > 0 && (
            <div>
              <div className="flex rounded-full overflow-hidden h-1.5 gap-px mb-2.5">
                {gamingPct > 0 && <div className="h-full rounded-l-full" style={{ width: `${gamingPct}%`, background: '#06b6d4' }} />}
                {snacksPct > 0 && <div className="h-full" style={{ width: `${snacksPct}%`, background: '#f59e0b' }} />}
                {memberPct > 0 && <div className="h-full rounded-r-full" style={{ width: `${memberPct}%`, background: '#8b5cf6' }} />}
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                {gamingRevenue > 0 && (
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase tracking-wide flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block" /> Gaming · {gamingPct}%
                    </span>
                    <p className="mono text-sm font-bold text-white">₹{gamingRevenue.toLocaleString('en-IN')}</p>
                  </div>
                )}
                {snacksRevenue > 0 && (
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase tracking-wide flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" /> Snacks · {snacksPct}%
                    </span>
                    <p className="mono text-sm font-bold text-white">₹{snacksRevenue.toLocaleString('en-IN')}</p>
                  </div>
                )}
                {membershipRevenue > 0 && (
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase tracking-wide flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400 inline-block" /> Members · {memberPct}%
                    </span>
                    <p className="mono text-sm font-bold text-white">₹{membershipRevenue.toLocaleString('en-IN')}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── 3 SMALL STACKED CARDS ── */}
        <div className="grid grid-cols-1 gap-3">

          {/* Collections — PayBreakdown tile */}
          <div className="relative glass rounded-xl px-4 py-4 overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-violet-500" />
            <div className="flex items-center justify-between mb-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.18)', color: '#c4b5fd' }}>
                <IndianRupee size={13} />
              </div>
              <span className="text-[9px] text-slate-600 uppercase tracking-widest">Today</span>
            </div>
            <p className="text-[9px] uppercase tracking-widest text-slate-500 mb-0.5">Collections</p>
            <p className="mono text-2xl font-bold text-white leading-none mb-3">₹{(cashTotal + upiTotal).toLocaleString('en-IN')}</p>
            {(cashTotal + upiTotal) > 0 && (
              <>
                <div className="h-1.5 rounded-full overflow-hidden flex mb-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <div style={{ width: `${Math.round(upiTotal / (cashTotal + upiTotal) * 100)}%`, background: '#06b6d4' }} />
                  <div style={{ width: `${Math.round(cashTotal / (cashTotal + upiTotal) * 100)}%`, background: '#10b981' }} />
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="flex items-center gap-1.5 text-slate-400"><span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />UPI <span className="mono text-white ml-1">₹{upiTotal.toLocaleString('en-IN')}</span></span>
                  <span className="flex items-center gap-1.5 text-slate-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Cash <span className="mono text-white ml-1">₹{cashTotal.toLocaleString('en-IN')}</span></span>
                </div>
              </>
            )}
          </div>

          {/* Active Now */}
          <div className="relative glass rounded-xl px-4 py-4 overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-emerald-500" />
            <div className="flex items-center justify-between mb-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-500/10">
                <Zap size={13} className="text-emerald-400" />
              </div>
              <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" style={{ color: '#10b981' }} />
            </div>
            <p className="text-[9px] uppercase tracking-widest text-slate-500 mb-0.5">Active Now</p>
            <div className="flex items-baseline gap-1.5">
              <p className="mono text-2xl font-bold text-white leading-none">{activeNow}</p>
              <span className="text-[10px] text-slate-500">in progress</span>
            </div>
          </div>

          {/* Sessions */}
          <div className="relative glass rounded-xl px-4 py-4 overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-cyan-500" />
            <div className="flex items-center justify-between mb-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-cyan-500/10">
                <Timer size={13} className="text-cyan-400" />
              </div>
              <Trend today={displaySessions} yesterday={displayPrevSessions} />
            </div>
            <p className="text-[9px] uppercase tracking-widest text-slate-500 mb-0.5">{period === 'today' ? 'Sessions Today' : 'Week Sessions'}</p>
            <p className="mono text-2xl font-bold text-white leading-none">{displaySessions}</p>
          </div>

        </div>
      </div>
    </div>
  );
}

