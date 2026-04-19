'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff, TrendingUp, TrendingDown, Minus, Zap, IndianRupee, Timer, Clock } from 'lucide-react';
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

  if (loadingData) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
      </div>
    );
  }

  // Card config
  const cards = [
    {
      key: 'active',
      accent: '#ef4444',
      accentClass: 'bg-red-500',
      icon: <Zap size={16} className="text-red-400" />,
      iconBg: 'bg-red-500/10',
      label: 'Active Now',
      value: activeNow,
      sub: 'sessions in progress',
      trend: null,
      extra: null,
    },
    {
      key: 'revenue',
      accent: '#22c55e',
      accentClass: 'bg-emerald-500',
      icon: <IndianRupee size={16} className="text-emerald-400" />,
      iconBg: 'bg-emerald-500/10',
      label: period === 'today' ? "Today's Revenue" : "Week Revenue",
      value: revenueVisible ? `₹${displayRevenue.toLocaleString('en-IN')}` : '••••••',
      sub: null,
      trend: revenueVisible ? <Trend today={displayRevenue} yesterday={displayPrevRevenue} /> : null,
      extra: 'revenue',
    },
    {
      key: 'sessions',
      accent: '#f97316',
      accentClass: 'bg-orange-500',
      icon: <Timer size={16} className="text-orange-400" />,
      iconBg: 'bg-orange-500/10',
      label: period === 'today' ? "Today's Sessions" : "Week Sessions",
      value: displaySessions,
      sub: 'gaming sessions',
      trend: <Trend today={displaySessions} yesterday={displayPrevSessions} />,
      extra: null,
    },
    {
      key: 'pending',
      accent: '#8b5cf6',
      accentClass: 'bg-violet-500',
      icon: <Clock size={16} className="text-violet-400" />,
      iconBg: 'bg-violet-500/10',
      label: period === 'today' ? 'Pending Today' : 'Pending (Week)',
      value: displayPending,
      sub: 'awaiting start',
      trend: null,
      extra: null,
    },
  ];

  return (
    <div className="mb-6 space-y-3">
      {/* Period toggle */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 font-semibold uppercase tracking-widest">Performance</p>
        <div className="flex rounded-lg overflow-hidden border border-white/[0.08] text-xs">
          <button
            onClick={() => setPeriod('today')}
            className={`px-3 py-1.5 font-semibold transition-colors ${period === 'today' ? 'bg-white/[0.08] text-white' : 'bg-transparent text-slate-500 hover:text-slate-300'}`}
          >Today</button>
          <button
            onClick={() => setPeriod('week')}
            className={`px-3 py-1.5 font-semibold transition-colors ${period === 'week' ? 'bg-white/[0.08] text-white' : 'bg-transparent text-slate-500 hover:text-slate-300'}`}
          >7 Days</button>
        </div>
      </div>
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div
          key={card.key}
          onClick={card.key === 'revenue' && revenueVisible ? () => setShowBreakdown(p => !p) : undefined}
          className={`
            relative rounded-xl glass px-3 py-3 md:px-4 md:py-4 flex flex-col gap-2.5 overflow-hidden transition-all duration-200
            ${card.key === 'revenue' && revenueVisible ? 'cursor-pointer hover:brightness-110' : ''}
          `}
        >
          {/* Colored top accent line */}
          <div className={`absolute top-0 left-0 right-0 h-[2px] ${card.accentClass}`} />

          {/* Header row — icon left, eye button right */}
          <div className="flex items-start justify-between gap-1 mt-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className={`w-5 h-5 md:w-6 md:h-6 rounded-md md:rounded-lg ${card.iconBg} flex items-center justify-center shrink-0`}>
                {card.icon}
              </div>
              <p className="text-[9px] md:text-[10px] uppercase tracking-wide md:tracking-widest font-semibold text-slate-400 leading-tight break-words">{card.label}</p>
            </div>
            {card.key === 'revenue' && (
              <button
                type="button"
                onClick={toggleRevenueVisibility}
                className="p-0.5 rounded text-slate-500 hover:text-slate-300 transition-colors z-10 shrink-0 mt-0.5"
              >
                {revenueVisible ? <EyeOff size={11} /> : <Eye size={11} />}
              </button>
            )}
          </div>

          {/* Value */}
          <p className="mono text-[22px] md:text-[28px] font-bold text-white leading-none tracking-tight">
            {card.value}
          </p>

          {/* Footer */}
          <div className="flex items-center justify-between gap-1">
            {card.sub && <p className="text-[9px] md:text-[10px] text-slate-500 leading-tight">{card.sub}</p>}
            {card.trend && card.trend}
            {!card.sub && !card.trend && <div />}
            {card.key === 'revenue' && revenueVisible && !showBreakdown && (
              <span className="text-[8px] md:text-[9px] text-slate-600 animate-pulse">breakdown</span>
            )}
          </div>

          {/* Revenue breakdown */}
          {card.key === 'revenue' && showBreakdown && revenueVisible && (
            <div className="mt-1 pt-2 border-t border-white/[0.06] grid grid-cols-1 gap-y-1">
              {([
                ...(gamingCash > 0 ? [['Cash', gamingCash]] : []),
                ...(gamingOnline > 0 ? [['Online/UPI', gamingOnline]] : []),
                ...(membershipRevenue > 0 ? [['Members', membershipRevenue]] : []),
                ...(snacksRevenue > 0 ? [['Snacks', snacksRevenue]] : []),
              ] as [string, number][]).map(([label, val]) => (
                <div key={label} className="flex justify-between text-[9px] md:text-[10px]">
                  <span className="text-slate-500">{label}</span>
                  <span className="text-emerald-400 font-semibold">₹{val.toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
    </div>
  );
}
