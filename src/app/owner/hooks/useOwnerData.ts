/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { getBookingRevenueTotal, isBillableRevenueBooking } from '@/lib/ownerRevenue';
import { subscribeToOwnerBookingsChanged } from '@/lib/ownerBookingsSync';
import { OwnerStats, CafeRow, BookingRow, NavTab } from '../types';
import { getLocalDateString } from '../utils';

type OwnerDataScope = 'dashboard' | 'full';

const FULL_BOOKING_TABS = new Set<NavTab>(['bookings', 'customers', 'stations', 'memberships']);
const PRICING_ONLY_TABS = new Set<NavTab>(['billing']);
const AUTO_REFRESH_TABS = new Set<NavTab>(['dashboard']);

// Compute a stable "fetch key" so switching between same-scope tabs
// does NOT trigger a re-fetch (prevents race conditions on stations/bookings).
// Only billing gets a unique key so it always fetches fresh pricing.
function getFetchKey(scope: OwnerDataScope, tab: NavTab): string {
  if (PRICING_ONLY_TABS.has(tab)) return `pricing:${tab}`;
  return scope;
}

function getOwnerDataScope(activeTab: NavTab): OwnerDataScope {
  return FULL_BOOKING_TABS.has(activeTab) ? 'full' : 'dashboard';
}

export function useOwnerData(canFetch: boolean, canAutoRefresh: boolean, activeTab: NavTab) {
  const [cafes, setCafes] = useState<CafeRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [membershipPlans, setMembershipPlans] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [cafeConsoles, setCafeConsoles] = useState<any[]>([]);
  const [availableConsoleTypes, setAvailableConsoleTypes] = useState<string[]>([]);
  const [consolePricing, setConsolePricing] = useState<Record<string, any>>({});
  const [stationPricing, setStationPricing] = useState<Record<string, any>>({});
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [totalBookingsCount, setTotalBookingsCount] = useState(0);
  const [serverStats, setServerStats] = useState<Partial<OwnerStats> | null>(null);

  const [loadedScope, setLoadedScope] = useState<OwnerDataScope>('dashboard');
  const [hasLoadedData, setHasLoadedData] = useState(false);

  const refreshData = useCallback(() => setRefreshTrigger(prev => prev + 1), []);
  const dataScope = useMemo(() => getOwnerDataScope(activeTab), [activeTab]);
  const fetchKey = useMemo(() => getFetchKey(dataScope, activeTab), [dataScope, activeTab]);
  const shouldAutoRefresh = useMemo(() => AUTO_REFRESH_TABS.has(activeTab), [activeTab]);
  // Derive stats from bookings and cafes
  const stats = useMemo<OwnerStats | null>(() => {
    if (!cafes.length) return null;

    const now = new Date();
    const todayStr = getLocalDateString(); // uses IST timezone
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentQuarter = Math.floor(now.getMonth() / 3);
    const startOfQuarter = new Date(now.getFullYear(), currentQuarter * 3, 1);

    // Exclude deleted, cancelled, and owner-use bookings from revenue
    // in-progress sessions have amounts set at booking creation time and count as earned revenue
    const activeBookings = bookings.filter(isBillableRevenueBooking);

    const bookingsToday = activeBookings.filter(b => b.booking_date === todayStr).length;
    const pendingBookings = bookings.filter(b => !b.deleted_at && b.status?.toLowerCase() === "pending").length;
    const todayRevenue = activeBookings.filter(b => b.booking_date === todayStr).reduce((sum, b) => sum + getBookingRevenueTotal(b), 0);
    const weekRevenue = activeBookings.filter(b => new Date(b.booking_date || "") >= startOfWeek).reduce((sum, b) => sum + getBookingRevenueTotal(b), 0);
    const totalRevenue = activeBookings.reduce((sum, b) => sum + getBookingRevenueTotal(b), 0);

    // Month/quarter revenue is only meaningful if the loaded data covers the full period.
    // Dashboard scope loads only ~7 days; show null so UI can render "See Reports" instead.
    const oldestLoaded = bookings.reduce<string | null>((min, b) => {
      if (!b.booking_date) return min;
      return !min || b.booking_date < min ? b.booking_date : min;
    }, null);
    const dataCoversMonth = !oldestLoaded || new Date(oldestLoaded) <= startOfMonth;
    const dataCoversQuarter = !oldestLoaded || new Date(oldestLoaded) <= startOfQuarter;

    const monthRevenue = dataCoversMonth
      ? activeBookings.filter(b => new Date(b.booking_date || "") >= startOfMonth).reduce((sum, b) => sum + getBookingRevenueTotal(b), 0)
      : null;
    const quarterRevenue = dataCoversQuarter
      ? activeBookings.filter(b => new Date(b.booking_date || "") >= startOfQuarter).reduce((sum, b) => sum + getBookingRevenueTotal(b), 0)
      : null;

    return {
      cafesCount: cafes.length,
      bookingsToday: serverStats?.bookingsToday ?? bookingsToday,
      recentBookings: Math.min(activeBookings.length, 20),
      todayRevenue: serverStats?.todayRevenue ?? todayRevenue,
      weekRevenue: serverStats?.weekRevenue ?? weekRevenue,
      monthRevenue: serverStats?.monthRevenue ?? monthRevenue,
      quarterRevenue: serverStats?.quarterRevenue ?? quarterRevenue,
      totalRevenue: serverStats?.totalRevenue ?? totalRevenue,
      totalBookings: serverStats?.totalBookings ?? (totalBookingsCount || bookings.length),
      pendingBookings: serverStats?.pendingBookings ?? pendingBookings,
    };
  }, [bookings, cafes, totalBookingsCount, serverStats]);

  // Auto-refresh bookings based on timer (60s — fast enough to catch new walk-ins)
  const lastFetchTimeRef = useRef(0);
  useEffect(() => {
    if (!canAutoRefresh || !shouldAutoRefresh) return;

    const interval = setInterval(() => {
      // Skip if a manual refresh happened less than 20s ago
      if (Date.now() - lastFetchTimeRef.current < 20_000) return;
      setRefreshTrigger(prev => prev + 1);
    }, 60_000);

    return () => clearInterval(interval);
  }, [canAutoRefresh, shouldAutoRefresh]);

  useEffect(() => {
    if (!canFetch) return;

    let cancelled = false;

    async function loadData() {
      try {
        // Show spinner only on first load or when upgrading from dashboard→full scope
        const needsSpinner = !hasLoadedData || (dataScope === 'full' && loadedScope !== 'full');
        if (needsSpinner) setLoadingData(true);
        setError(null);

        const res = await fetch('/api/owner/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scope: dataScope, tab: activeTab }),
          credentials: 'include',
          cache: 'no-store',
        });

        if (res.status === 401) {
          if (!cancelled && typeof window !== 'undefined') {
            window.location.href = '/owner/login';
          }
          return;
        }

        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Failed to load data');
        if (cancelled) return;

        const isPricingOnly = PRICING_ONLY_TABS.has(activeTab);
        setCafes(data.cafes as CafeRow[]);
        // Don't overwrite bookings/subscriptions on billing-only fetches (avoids state poisoning)
        if (!isPricingOnly) {
          setBookings(((data.bookings as BookingRow[]) || []).filter((booking) => !booking.deleted_at));
          if (Array.isArray(data.subscriptions)) {
            setSubscriptions(data.subscriptions);
          }
          setTotalBookingsCount(data.totalBookingsCount);
          setServerStats(data.dashboardStats || null);
          setLoadedScope(dataScope);
        }
        setStationPricing(data.stationPricing);
        setConsolePricing(data.consolePricing);
        setCafeConsoles(data.cafeConsoles);
        setAvailableConsoleTypes(data.availableConsoleTypes);
        setMembershipPlans(data.membershipPlans);
        lastFetchTimeRef.current = Date.now();
        setHasLoadedData(true);
        setLoadingData(false);
      } catch (err: any) {
        if (cancelled) return;
        console.error("Error loading data:", err);
        setError(err.message);
        setLoadingData(false);
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
    // activeTab and dataScope are already inside fetchKey, so the rule is
    // asking for them twice.
    //
    // hasLoadedData and loadedScope are the reason this stays suppressed. They
    // are read once, to decide whether to show a spinner, and this effect sets
    // both — so naming them would re-run it the moment they change and fetch
    // the whole dashboard a second time on every visit. A redundant spinner
    // decision is cheaper than a duplicated payload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canFetch, refreshTrigger, fetchKey]);

  useEffect(() => {
    if (!canFetch) return;

    return subscribeToOwnerBookingsChanged((detail) => {
      if (!detail?.bookingId) return;

      if (detail.action === 'deleted' || detail.action === 'permanently-deleted') {
        const deletedId = detail.bookingId;
        setBookings((prev) => prev.filter((booking) => (
          booking.id !== deletedId && (booking as any).originalBookingId !== deletedId
        )));
        return;
      }

      if (detail.action === 'restored') {
        refreshData();
      }
    });
  }, [canFetch, refreshData]);

  return {
    stats,
    cafes,
    bookings,
    loadingData,
    error,
    membershipPlans,
    subscriptions,
    cafeConsoles,
    availableConsoleTypes,
    consolePricing,
    stationPricing,
    totalBookingsCount,
    hasLoadedData,
    setSubscriptions,
    setBookings,
    refreshData,
    setCafes,
    setStationPricing,
    setConsolePricing
  };
}
