/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo } from 'react';
import { OwnerStats, CafeRow, BookingRow } from '../types';

export function useOwnerData(ownerId: string | null, allowed: boolean) {
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

  // Pagination state (internal to hook for now, or expose if needed)
  const [bookingPage, setBookingPage] = useState(1);

  const refreshData = () => setRefreshTrigger(prev => prev + 1);

  // Derive stats from bookings and cafes - Exclude cancelled bookings from revenue
  const stats = useMemo<OwnerStats | null>(() => {
    if (!cafes.length) return null;

    const now = new Date();
    // Use local date instead of UTC to match Indian timezone
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentQuarter = Math.floor(now.getMonth() / 3);
    const startOfQuarter = new Date(now.getFullYear(), currentQuarter * 3, 1);

    // Filter out cancelled bookings for revenue calculations
    const activeBookings = bookings.filter(b => b.status !== 'cancelled');

    const bookingsToday = activeBookings.filter(b => b.booking_date === todayStr).length;
    const pendingBookings = bookings.filter(b => b.status?.toLowerCase() === "pending").length;
    const recentRevenue = activeBookings.slice(0, 20).reduce((sum, b) => sum + (b.total_amount || 0), 0);
    const todayRevenue = activeBookings.filter(b => b.booking_date === todayStr).reduce((sum, b) => sum + (b.total_amount || 0), 0);

    const weekRevenue = activeBookings.filter(b => new Date(b.booking_date || "") >= startOfWeek).reduce((sum, b) => sum + (b.total_amount || 0), 0);
    const monthRevenue = activeBookings.filter(b => new Date(b.booking_date || "") >= startOfMonth).reduce((sum, b) => sum + (b.total_amount || 0), 0);
    const quarterRevenue = activeBookings.filter(b => new Date(b.booking_date || "") >= startOfQuarter).reduce((sum, b) => sum + (b.total_amount || 0), 0);
    const totalRevenue = activeBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);

    return {
      cafesCount: cafes.length,
      bookingsToday,
      recentBookings: Math.min(activeBookings.length, 20),
      recentRevenue,
      todayRevenue,
      weekRevenue,
      monthRevenue,
      quarterRevenue,
      totalRevenue,
      totalBookings: totalBookingsCount || bookings.length,
      pendingBookings
    };
  }, [bookings, cafes, totalBookingsCount]);

  // Auto-refresh bookings based on timer
  useEffect(() => {
    if (!allowed || !ownerId) return;

    const interval = setInterval(() => {
      setRefreshTrigger(prev => prev + 1);
    }, 10000); // 10 seconds

    return () => clearInterval(interval);
  }, [allowed, ownerId]);

  useEffect(() => {
    if (!allowed || !ownerId) return;

    async function loadData() {
      try {
        if (refreshTrigger === 0) setLoadingData(true);
        setError(null);

        const res = await fetch('/api/owner/data', {
          method: 'POST',
        });

        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Failed to load data');

        setCafes(data.cafes as CafeRow[]);
        setBookings(data.bookings as BookingRow[]);
        setStationPricing(data.stationPricing);
        setConsolePricing(data.consolePricing);
        setCafeConsoles(data.cafeConsoles);
        setAvailableConsoleTypes(data.availableConsoleTypes);
        setMembershipPlans(data.membershipPlans);
        setSubscriptions(data.subscriptions);
        setTotalBookingsCount(data.totalBookingsCount);
        setLoadingData(false);
      } catch (err: any) {
        console.error("Error loading data:", err);
        setError(err.message);
        setLoadingData(false);
      }
    }

    loadData();
  }, [allowed, ownerId, refreshTrigger]);

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
    setSubscriptions,
    setBookings,
    refreshData,
    bookingPage,
    setBookingPage,
    setCafes,
    setStationPricing,
    setConsolePricing
  };
}
