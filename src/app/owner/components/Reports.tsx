'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, Button, Select, StatCard } from './ui';
import {
    TrendingUp,
    TrendingDown,
    Clock,
    Download,
    ArrowUpRight,
    CreditCard,
    Banknote,
    Gamepad2,
    Calendar,
    X,
    Users,
    Globe,
    Store,
} from 'lucide-react';

interface ReportsProps {
    cafeId: string;
    isMobile: boolean;
    openingHours?: string;
}

interface BookingItem {
    console: string;
    quantity: number;
    price?: number;
}

interface BookingData {
    id: string;
    total_amount: number;
    created_at: string;
    booking_date: string;
    status: string;
    payment_mode: string;
    start_time?: string;
    booking_items?: BookingItem[];
    customer_name?: string;
    source?: string;
}

interface PreviousBookingData {
    id: string;
    total_amount: number;
    booking_date: string;
    status: string;
    payment_mode: string;
}

const formatLocalDate = (date: Date): string => (
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
);

const parseLocalDate = (value: string): Date => {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
};

export function Reports({ cafeId, isMobile, openingHours }: ReportsProps) {
    const [dateRange, setDateRange] = useState('7d');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [showCustomPicker, setShowCustomPicker] = useState(false);
    const [loading, setLoading] = useState(false);
    const [bookings, setBookings] = useState<BookingData[]>([]);
    const [previousBookings, setPreviousBookings] = useState<PreviousBookingData[]>([]);
    const [peakHoursBookings, setPeakHoursBookings] = useState<BookingData[]>([]);
    const [cafeHours, setCafeHours] = useState<{ openHour: number; closeHour: number }>({ openHour: 10, closeHour: 23 });
    const [expandedChart, setExpandedChart] = useState(false);

    // Fetch data based on range — skip until cafeId is available
    useEffect(() => {
        if (!cafeId) return;
        fetchReportsData();
        fetchCafeHours();
        fetchPeakHoursData();
    }, [dateRange, cafeId, customStart, customEnd]);

    const getDateRange = (range: string) => {
        const now = new Date();
        const todayStr = formatLocalDate(now);

        let startDate = todayStr;
        let endDate = todayStr;
        let prevStartDate = todayStr;
        let prevEndDate = todayStr;

        if (range === 'today') {
            startDate = todayStr;
            endDate = todayStr;
            const yesterday = new Date(now);
            yesterday.setDate(now.getDate() - 1);
            prevStartDate = formatLocalDate(yesterday);
            prevEndDate = prevStartDate;
        } else if (range === 'yesterday') {
            const yesterday = new Date(now);
            yesterday.setDate(now.getDate() - 1);
            startDate = formatLocalDate(yesterday);
            endDate = startDate;
            const dayBefore = new Date(now);
            dayBefore.setDate(now.getDate() - 2);
            prevStartDate = formatLocalDate(dayBefore);
            prevEndDate = prevStartDate;
        } else if (range === '7d') {
            const sevenDaysAgo = new Date(now);
            sevenDaysAgo.setDate(now.getDate() - 6);
            startDate = formatLocalDate(sevenDaysAgo);
            endDate = todayStr;
            const fourteenDaysAgo = new Date(now);
            fourteenDaysAgo.setDate(now.getDate() - 13);
            prevStartDate = formatLocalDate(fourteenDaysAgo);
            // Previous period ends the day before the current period starts (no overlap)
            const dayBeforeCurrent = new Date(now);
            dayBeforeCurrent.setDate(now.getDate() - 7);
            prevEndDate = formatLocalDate(dayBeforeCurrent);
        } else if (range === '30d') {
            const thirtyDaysAgo = new Date(now);
            thirtyDaysAgo.setDate(now.getDate() - 29);
            startDate = formatLocalDate(thirtyDaysAgo);
            endDate = todayStr;
            const sixtyDaysAgo = new Date(now);
            sixtyDaysAgo.setDate(now.getDate() - 59);
            prevStartDate = formatLocalDate(sixtyDaysAgo);
            // Previous period ends the day before the current period starts (no overlap)
            const dayBeforeCurrent30 = new Date(now);
            dayBeforeCurrent30.setDate(now.getDate() - 30);
            prevEndDate = formatLocalDate(dayBeforeCurrent30);
        } else if (range === 'month') {
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            startDate = formatLocalDate(firstDay);
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            endDate = formatLocalDate(lastDay);
            const prevFirstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            prevStartDate = formatLocalDate(prevFirstDay);
            const prevLastDay = new Date(now.getFullYear(), now.getMonth(), 0);
            prevEndDate = formatLocalDate(prevLastDay);
        } else if (range === 'all') {
            startDate = '2020-01-01';
            endDate = todayStr;
            prevStartDate = '2019-01-01';
            prevEndDate = '2019-12-31';
        } else if (range === 'custom' && customStart) {
            startDate = customStart;
            endDate = customEnd || customStart;
            // For custom, calculate same duration previous period
            const start = parseLocalDate(customStart);
            const end = parseLocalDate(customEnd || customStart);
            const duration = end.getTime() - start.getTime();
            const prevEnd = new Date(start.getTime() - 1);
            const prevStart = new Date(prevEnd.getTime() - duration);
            prevStartDate = formatLocalDate(prevStart);
            prevEndDate = formatLocalDate(prevEnd);
        }

        return { startDate, endDate, prevStartDate, prevEndDate };
    };

    const fetchReportsData = async () => {
        if (!cafeId) return;
        setLoading(true);
        try {
            const { startDate, endDate, prevStartDate, prevEndDate } = getDateRange(dateRange);

            const res = await fetch('/api/owner/reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ cafeId, startDate, endDate, prevStartDate, prevEndDate }),
            });

            if (!res.ok) throw new Error('Failed to fetch reports');
            const { currentBookings, previousBookings: prevBookings } = await res.json();

            setBookings(currentBookings || []);
            setPreviousBookings(prevBookings || []);
        } catch (error) {
            console.error('Error fetching reports:', error);
        } finally {
            setLoading(false);
        }
    };

    // --- Analytics Calculations ---
    // Exclude owner-use internal records (payment_mode='owner', total_amount=0) from all stats
    const billableBookings = useMemo(
        () => bookings.filter(b => b.payment_mode !== 'owner'),
        [bookings]
    );

    const stats = useMemo(() => {
        const totalRevenue = billableBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);
        const totalBookings = billableBookings.length;
        const avgOrderValue = totalBookings > 0 ? totalRevenue / totalBookings : 0;

        // Previous period stats (also exclude owner-use)
        const prevBillable = previousBookings.filter(b => b.payment_mode !== 'owner');
        const prevRevenue = prevBillable.reduce((sum, b) => sum + (b.total_amount || 0), 0);
        const prevBookings = prevBillable.length;
        const prevAov = prevBookings > 0 ? prevRevenue / prevBookings : 0;

        // Calculate percentage changes — null when no prev data (shows '—' instead of a fake 0%)
        const revenueChange = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : null;
        const bookingsChange = prevBookings > 0 ? ((totalBookings - prevBookings) / prevBookings) * 100 : null;
        const aovChange = prevAov > 0 ? ((avgOrderValue - prevAov) / prevAov) * 100 : null;

        return {
            revenue: totalRevenue,
            count: totalBookings,
            aov: avgOrderValue,
            revenueChange,
            bookingsChange,
            aovChange,
        };
    }, [billableBookings, previousBookings]);

    // --- Chart Data Preparation ---

    // 1. Revenue over time — parse date string directly to avoid UTC-to-local timezone shift
    //    e.g. new Date("2024-01-15") = Jan 14 at 18:30 IST (UTC midnight) → wrong day in charts
    const revenueTrendData = useMemo(() => {
        const daily: Record<string, number> = {};
        billableBookings.forEach(b => {
            // Parse YYYY-MM-DD directly without Date constructor to avoid timezone shift
            const [year, month, day] = b.booking_date.split('-').map(Number);
            const dateObj = new Date(year, month - 1, day); // local midnight, correct
            const date = dateObj.toLocaleDateString('en-IN', {
                weekday: 'short',
                day: 'numeric',
                month: 'short'
            });
            daily[date] = (daily[date] || 0) + (b.total_amount || 0);
        });
        return Object.entries(daily).map(([date, amount]) => ({ date, amount }));
    }, [billableBookings]);

    const maxRevenue = Math.max(...revenueTrendData.map(d => d.amount), 100);

    // 2. Peak Hours - filtered to cafe operating hours
    const peakHoursData = useMemo(() => {
        const { openHour, closeHour } = cafeHours;
        const hoursCount = closeHour > openHour ? closeHour - openHour : 24 - openHour + closeHour;
        const hourly: { hour: number; count: number }[] = [];

        // Initialize hours within operating range
        for (let i = 0; i < hoursCount; i++) {
            const hour = (openHour + i) % 24;
            hourly.push({ hour, count: 0 });
        }

        // Helper to parse time string to 24-hour format
        const parseTimeToHour = (timeStr: string): number | null => {
            if (!timeStr) return null;

            // Try "4:00 PM" or "04:00 PM" format
            const amPmMatch = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
            if (amPmMatch) {
                let hour = parseInt(amPmMatch[1], 10);
                const period = amPmMatch[3].toUpperCase();
                if (period === 'PM' && hour !== 12) hour += 12;
                else if (period === 'AM' && hour === 12) hour = 0;
                return hour;
            }

            // Try "16:00" 24-hour format
            const h24Match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
            if (h24Match) {
                return parseInt(h24Match[1], 10);
            }

            return null;
        };

        // Count bookings per hour (use 30-day peak data, not the selected-period bookings)
        peakHoursBookings.forEach(b => {
            let hour: number | null = null;

            if (b.start_time) {
                hour = parseTimeToHour(b.start_time);
            }

            if (hour === null) {
                // Fallback to created_at
                hour = new Date(b.created_at).getHours();
            }

            if (hour !== null) {
                const hourEntry = hourly.find(h => h.hour === hour);
                if (hourEntry) hourEntry.count++;
            }
        });

        return hourly;
    }, [peakHoursBookings, cafeHours]);

    const maxHourly = Math.max(...peakHoursData.map(h => h.count), 5);

    // Fetch 30 days of booking data specifically for peak hours analysis
    const fetchPeakHoursData = async () => {
        if (!cafeId) return;
        try {
            const res = await fetch(`/api/owner/reports?cafeId=${cafeId}`, { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to fetch peak hours data');
            const { bookings: data } = await res.json();
            if (data) {
                setPeakHoursBookings(data as BookingData[]);
            }
        } catch (err) {
            console.error('Error fetching peak hours data:', err);
        }
    };

    // Parse cafe operating hours from prop
    const fetchCafeHours = () => {
        const hoursStr = openingHours;
        if (!hoursStr) return;

        const match = hoursStr.match(/(\d{1,2})(?::\d{2})?\s*(AM|PM)\s*[-–]\s*(\d{1,2})(?::\d{2})?\s*(AM|PM)/i);
        if (match) {
            let openHour = parseInt(match[1], 10);
            const openPeriod = match[2].toUpperCase();
            let closeHour = parseInt(match[3], 10);
            const closePeriod = match[4].toUpperCase();

            if (openPeriod === 'PM' && openHour !== 12) openHour += 12;
            else if (openPeriod === 'AM' && openHour === 12) openHour = 0;

            if (closePeriod === 'PM' && closeHour !== 12) closeHour += 12;
            else if (closePeriod === 'AM' && closeHour === 12) closeHour = 0;

            setCafeHours({ openHour, closeHour });
        }
    };

    // 3. Payment Method Breakdown
    const paymentData = useMemo(() => {
        const methods: Record<string, { count: number; amount: number }> = {
            cash: { count: 0, amount: 0 },
            online: { count: 0, amount: 0 },
            upi: { count: 0, amount: 0 },
            card: { count: 0, amount: 0 },
        };

        billableBookings.forEach(b => {
            const mode = (b.payment_mode || 'cash').toLowerCase();
            if (mode === 'cash') {
                methods.cash.count++;
                methods.cash.amount += b.total_amount || 0;
            } else if (mode === 'upi') {
                methods.upi.count++;
                methods.upi.amount += b.total_amount || 0;
            } else if (mode === 'card') {
                methods.card.count++;
                methods.card.amount += b.total_amount || 0;
            } else {
                methods.online.count++;
                methods.online.amount += b.total_amount || 0;
            }
        });

        const total = billableBookings.length || 1;
        return {
            cash: { ...methods.cash, percent: (methods.cash.count / total) * 100 },
            online: { ...methods.online, percent: (methods.online.count / total) * 100 },
            upi: { ...methods.upi, percent: (methods.upi.count / total) * 100 },
            card: { ...methods.card, percent: (methods.card.count / total) * 100 },
        };
    }, [billableBookings]);

    // 4. Console Popularity
    const consoleData = useMemo(() => {
        const consoles: Record<string, { count: number; revenue: number }> = {};
        let snackCount = 0;
        let snackRevenue = 0;

        billableBookings.forEach(b => {
            const items = b.booking_items;
            const bookingTotal = b.total_amount || 0;

            if (!items || !Array.isArray(items) || items.length === 0) {
                // Snack-only booking — no console items, all revenue goes to Snacks & F&B
                if (bookingTotal > 0) {
                    snackCount += 1;
                    snackRevenue += bookingTotal;
                }
                return;
            }

            const seenInThisBooking = new Set<string>();

            // Sum stored item prices to use as proportional weights.
            // If sum > 0, each item gets (item.price / priceSum) * total_amount.
            // This guarantees the per-booking attribution always equals total_amount exactly,
            // even if the owner manually adjusted total_amount after setting item prices.
            const priceSum = items.reduce(
                (s: number, it: BookingItem) =>
                    s + (typeof it.price === 'number' && it.price > 0 ? it.price : 0),
                0
            );
            // Equal fallback when no prices are stored at all
            const equalShare = bookingTotal / items.length;

            items.forEach((item: BookingItem) => {
                const consoleName = item.console || 'Unknown';
                if (!consoles[consoleName]) {
                    consoles[consoleName] = { count: 0, revenue: 0 };
                }
                if (!seenInThisBooking.has(consoleName)) {
                    seenInThisBooking.add(consoleName);
                    consoles[consoleName].count += 1;
                }
                // Proportional share: (this item's price / sum of all prices) × total_amount
                // Falls back to equal split when no prices are stored
                const itemPrice = typeof item.price === 'number' && item.price > 0 ? item.price : 0;
                const itemRevenue = priceSum > 0
                    ? (itemPrice / priceSum) * bookingTotal
                    : equalShare;
                consoles[consoleName].revenue += itemRevenue;
            });
        });

        const sorted = Object.entries(consoles)
            .map(([name, data]) => ({ name, ...data }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5); // Top 5 gaming consoles

        // Always append Snacks & F&B if there are any snack revenues
        if (snackRevenue > 0) {
            sorted.push({ name: 'Snacks & F&B', count: snackCount, revenue: snackRevenue });
        }

        return sorted;
    }, [billableBookings]);

    const maxConsoleCount = Math.max(...consoleData.map(c => c.count), 1);

    // Export to CSV
    const exportToCSV = () => {
        const headers = ['Date', 'Time', 'Customer', 'Amount', 'Payment Mode', 'Status', 'Consoles'];
        const rows = bookings.map(b => [
            b.booking_date,
            b.start_time || 'N/A',
            b.customer_name || 'Walk-in',
            b.total_amount,
            b.payment_mode || 'Cash',
            b.status,
            b.booking_items?.map(i => `${i.quantity}x ${i.console}`).join(', ') || 'N/A'
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `reports_${dateRange}_${formatLocalDate(new Date())}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Format console names
    const formatConsoleName = (name: string) => {
        const nameMap: Record<string, string> = {
            'ps5': 'PlayStation 5',
            'ps4': 'PlayStation 4',
            'xbox': 'Xbox Series',
            'pc': 'Gaming PC',
            'vr': 'VR Headset',
            'steering': 'Steering Wheel',
            'steering_wheel': 'Steering Wheel',
            'racing_sim': 'Racing Sim',
        };
        return nameMap[name.toLowerCase()] || name.charAt(0).toUpperCase() + name.slice(1);
    };

    // Growth indicator component
    const GrowthIndicator = ({ value, suffix = '%' }: { value: number | null; suffix?: string }) => {
        if (value === null) return <span className="text-slate-500 text-xs">No prev. data</span>;
        if (value === 0) return <span className="text-slate-500 text-xs">No change</span>;
        const isPositive = value > 0;
        return (
            <span className={`flex items-center gap-1 text-xs font-medium ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {isPositive ? '+' : ''}{value.toFixed(1)}{suffix}
            </span>
        );
    };

    // Apply custom date range
    const applyCustomRange = () => {
        if (customStart) {
            setDateRange('custom');
            setShowCustomPicker(false);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header & Controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Reports & Analytics</h1>
                    <p className="text-slate-400 mt-1">Insights into your venue's performance</p>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 bg-slate-900/50 p-1 rounded-xl border border-slate-800">
                        <Select
                            value={dateRange}
                            onChange={(val) => {
                                if (val === 'custom') {
                                    setShowCustomPicker(true);
                                } else {
                                    setDateRange(val);
                                }
                            }}
                            options={[
                                { label: 'Today', value: 'today' },
                                { label: 'Yesterday', value: 'yesterday' },
                                { label: 'Last 7 Days', value: '7d' },
                                { label: 'Last 30 Days', value: '30d' },
                                { label: 'This Month', value: 'month' },
                                { label: 'All Bookings', value: 'all' },
                                { label: 'Custom Range', value: 'custom' },
                            ]}
                            className="w-40 border-none bg-transparent"
                        />
                        <Button
                            variant="ghost"
                            className="h-9 w-9 p-0 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                            onClick={exportToCSV}
                            title="Export to CSV"
                        >
                            <Download size={18} />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Custom Date Range Picker Modal */}
            {showCustomPicker && (
                <Card className="relative animate-in slide-in-from-top-2 duration-200">
                    <button
                        onClick={() => setShowCustomPicker(false)}
                        className="absolute top-4 right-4 p-1 hover:bg-slate-800 rounded-lg transition-colors"
                    >
                        <X size={18} className="text-slate-400" />
                    </button>
                    <div className="flex items-center gap-2 mb-4">
                        <Calendar size={20} className="text-emerald-500" />
                        <h3 className="text-lg font-semibold text-white">Custom Date Range</h3>
                    </div>
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1">
                            <label className="block text-sm text-slate-400 mb-2">Start Date</label>
                            <input
                                type="date"
                                value={customStart}
                                onChange={(e) => setCustomStart(e.target.value)}
                                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white focus:border-emerald-500 focus:outline-none"
                            />
                        </div>
                        <div className="flex-1">
                            <label className="block text-sm text-slate-400 mb-2">End Date</label>
                            <input
                                type="date"
                                value={customEnd}
                                onChange={(e) => setCustomEnd(e.target.value)}
                                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white focus:border-emerald-500 focus:outline-none"
                            />
                        </div>
                        <div className="flex items-end">
                            <Button variant="primary" onClick={applyCustomRange} disabled={!customStart}>
                                Apply Range
                            </Button>
                        </div>
                    </div>
                </Card>
            )}

            {/* Key Metrics Grid with Growth Indicators */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card padding="lg" className="bg-gradient-to-br from-slate-900 to-slate-900/50 border-slate-800">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-sm font-medium text-slate-400 mb-1">Total Revenue</p>
                            <p className="text-3xl font-bold text-white">₹{stats.revenue.toLocaleString()}</p>
                            <p className="text-xs text-slate-500 mt-1">{bookings.length} transactions</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500">
                                <TrendingUp size={20} />
                            </div>
                            <GrowthIndicator value={stats.revenueChange} />
                        </div>
                    </div>
                </Card>

                <Card padding="lg" className="bg-gradient-to-br from-slate-900 to-slate-900/50 border-slate-800">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-sm font-medium text-slate-400 mb-1">Total Bookings</p>
                            <p className="text-3xl font-bold text-white">{stats.count}</p>
                            <p className="text-xs text-slate-500 mt-1">Confirmed sessions</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500">
                                <Calendar size={20} />
                            </div>
                            <GrowthIndicator value={stats.bookingsChange} />
                        </div>
                    </div>
                </Card>

                <Card padding="lg" className="bg-gradient-to-br from-slate-900 to-slate-900/50 border-slate-800">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-sm font-medium text-slate-400 mb-1">Avg. Order Value</p>
                            <p className="text-3xl font-bold text-white">₹{Math.round(stats.aov)}</p>
                            <p className="text-xs text-slate-500 mt-1">Per booking</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500">
                                <Banknote size={20} />
                            </div>
                            <GrowthIndicator value={stats.aovChange} />
                        </div>
                    </div>
                </Card>
            </div>

            {/* Charts Section - Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Revenue Trend Chart */}
                <div
                    className={revenueTrendData.length > 7 ? "cursor-pointer" : ""}
                    onClick={() => revenueTrendData.length > 7 && setExpandedChart(true)}
                >
                    <Card className="min-h-[300px] flex flex-col hover:ring-1 hover:ring-emerald-500/30 transition-all">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                    <TrendingUp size={20} className="text-emerald-500" />
                                    Revenue Trend
                                </h3>
                                <p className="text-sm text-slate-400">Daily earnings based on service date</p>
                            </div>
                            {revenueTrendData.length > 7 && (
                                <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded">Click to expand</span>
                            )}
                        </div>

                        <div className="w-full relative pt-6 pb-2">
                            {loading ? (
                                <div className="h-[150px] flex items-center justify-center text-slate-500">Loading chart...</div>
                            ) : revenueTrendData.length === 0 ? (
                                <div className="h-[150px] flex items-center justify-center text-slate-500">No data available</div>
                            ) : (() => {
                                const displayData = revenueTrendData.slice(-7);
                                const maxInView = Math.max(...displayData.map(x => x.amount), 100);
                                return (
                                    <div className="flex items-end justify-between px-2 gap-1" style={{ height: '150px' }}>
                                        {displayData.map((d, i) => {
                                            const barHeight = Math.max((d.amount / maxInView) * 100, 8);
                                            // Format date: "Thu, 15 Jan" -> "Thu 15"
                                            const parts = d.date.split(' ');
                                            const shortDate = `${parts[0].replace(',', '')} ${parts[1]}`;
                                            return (
                                                <div key={i} className="flex flex-col items-center gap-2 group flex-1">
                                                    <div className="w-full flex flex-col items-center h-full justify-end relative">
                                                        <div className="w-full max-w-[60px] relative flex items-end h-[120px]">
                                                            <div
                                                                className="w-full bg-emerald-500/20 border-t-2 border-emerald-500 rounded-t-sm hover:bg-emerald-500/40 transition-all relative"
                                                                style={{ height: `${barHeight}%` }}
                                                            >
                                                                <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-emerald-400 font-medium whitespace-nowrap">
                                                                    ₹{d.amount.toLocaleString()}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <span className="text-[10px] text-slate-500 whitespace-nowrap">{shortDate}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </div>
                        {revenueTrendData.length > 7 && (
                            <p className="text-center text-xs text-slate-500 mt-3">Showing last 7 days of {revenueTrendData.length} • Click to see all</p>
                        )}
                    </Card>
                </div>

                {/* Expanded Revenue Chart Modal */}
                {expandedChart && (
                    <div
                        className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
                        onClick={() => setExpandedChart(false)}
                    >
                        <div
                            className="bg-slate-900 rounded-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden border border-slate-800"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between p-6 border-b border-slate-800">
                                <div>
                                    <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                                        <TrendingUp size={24} className="text-emerald-500" />
                                        Revenue Trend - Full View
                                    </h3>
                                    <p className="text-sm text-slate-400">{revenueTrendData.length} days of data</p>
                                </div>
                                <button
                                    onClick={() => setExpandedChart(false)}
                                    className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                                >
                                    <X size={24} className="text-slate-400" />
                                </button>
                            </div>
                            <div className="p-6 overflow-x-auto">
                                <div className="flex items-end gap-6 h-[400px]" style={{ minWidth: `${revenueTrendData.length * 80}px` }}>
                                    {revenueTrendData.map((d, i) => {
                                        const heightPercent = (d.amount / maxRevenue) * 100;
                                        return (
                                            <div key={i} className="flex flex-col items-center gap-2 group flex-1 h-full" style={{ minWidth: '60px' }}>
                                                <div className="flex-1 w-full flex items-end justify-center">
                                                    <div className="w-full max-w-[50px] relative h-full flex items-end">
                                                        <div
                                                            className="w-full bg-emerald-500/20 border-t-2 border-emerald-500 rounded-t-sm hover:bg-emerald-500/40 transition-all relative"
                                                            style={{ height: `${Math.max(heightPercent, 5)}%` }}
                                                        >
                                                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-emerald-400 font-medium whitespace-nowrap">
                                                                ₹{d.amount.toLocaleString()}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <span className="text-[11px] text-slate-400 whitespace-nowrap">{d.date}</span>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Peak Hours Chart */}
                <Card className="min-h-[300px] flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                <Clock size={20} className="text-blue-500" />
                                Peak Hours
                            </h3>
                            <p className="text-sm text-slate-400">Based on last 30 days of bookings</p>
                        </div>
                    </div>

                    <div className="flex-1 w-full relative flex items-end gap-1 px-2 pb-6">
                        {loading ? (
                            <div className="absolute inset-0 flex items-center justify-center text-slate-500">Loading chart...</div>
                        ) : (
                            peakHoursData.map((data, idx) => {
                                const heightPercent = (data.count / maxHourly) * 100;
                                const isBusy = heightPercent > 50;
                                // Format hour as 12-hour time
                                const hourLabel = data.hour === 0 ? '12AM' : data.hour < 12 ? `${data.hour}AM` : data.hour === 12 ? '12PM' : `${data.hour - 12}PM`;
                                return (
                                    <div key={idx} className="flex-1 flex flex-col items-center group h-full justify-end">
                                        <div
                                            className={`w-full rounded-t-sm transition-all relative ${isBusy ? 'bg-blue-500' : 'bg-slate-700'}`}
                                            style={{ height: `${Math.max(heightPercent, 5)}%`, opacity: isBusy ? 0.8 : 0.3 }}
                                        >
                                            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 text-[10px] text-white opacity-0 group-hover:opacity-100">
                                                {data.count}
                                            </div>
                                        </div>
                                        {idx % 2 === 0 && (
                                            <div className="absolute bottom-0 text-[9px] text-slate-500 transform translate-y-full whitespace-nowrap">
                                                {hourLabel}
                                            </div>
                                        )}
                                    </div>
                                )
                            })
                        )}
                        <div className="absolute bottom-0 w-full border-t border-slate-800"></div>
                    </div>
                    <p className="text-center text-xs text-slate-500 mt-4">
                        Operating Hours ({cafeHours.openHour > 12 ? `${cafeHours.openHour - 12}PM` : `${cafeHours.openHour}AM`} - {cafeHours.closeHour > 12 ? `${cafeHours.closeHour - 12}PM` : `${cafeHours.closeHour}AM`})
                    </p>
                </Card>
            </div>

            {/* Charts Section - Row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Console Popularity */}
                <Card className="min-h-[280px]">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                <Gamepad2 size={20} className="text-pink-500" />
                                Console Popularity
                            </h3>
                            <p className="text-sm text-slate-400">Most booked gaming stations</p>
                        </div>
                        {consoleData.length > 0 && (
                            <div className="text-right">
                                <p className="text-xs text-slate-500">Total Revenue</p>
                                <p className="text-base font-bold text-white">
                                    ₹{Math.round(consoleData.reduce((s, c) => s + c.revenue, 0)).toLocaleString('en-IN')}
                                </p>
                            </div>
                        )}
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center h-40 text-slate-500">Loading...</div>
                    ) : consoleData.length === 0 ? (
                        <div className="flex items-center justify-center h-40 text-slate-500">No console data available</div>
                    ) : (
                        <div className="space-y-4">
                            {consoleData.map((console, index) => {
                                const colors = ['bg-pink-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500', 'bg-orange-500'];
                                const bgColors = ['bg-pink-500/10', 'bg-blue-500/10', 'bg-emerald-500/10', 'bg-amber-500/10', 'bg-purple-500/10', 'bg-orange-500/10'];
                                const textColors = ['text-pink-500', 'text-blue-500', 'text-emerald-500', 'text-amber-500', 'text-purple-500', 'text-orange-500'];
                                const widthPercent = (console.count / maxConsoleCount) * 100;
                                const isSnacks = console.name === 'Snacks & F&B';

                                return (
                                    <div key={console.name} className="flex items-center gap-4">
                                        <div className={`p-2 rounded-lg ${bgColors[index % 6]} ${textColors[index % 6]}`}>
                                            {isSnacks ? <Store size={18} /> : <Gamepad2 size={18} />}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-sm font-medium text-white">{formatConsoleName(console.name)}</span>
                                                <span className="text-sm text-slate-400">{console.count} bookings</span>
                                            </div>
                                            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full ${colors[index % 6]} rounded-full transition-all duration-500`}
                                                    style={{ width: `${widthPercent}%` }}
                                                />
                                            </div>
                                            <p className="text-xs text-slate-500 mt-1">₹{Math.round(console.revenue).toLocaleString()} revenue</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Card>



                {/* Payment Methods Breakdown */}
                <Card className="min-h-[280px]">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                <CreditCard size={20} className="text-purple-500" />
                                Payment Methods
                            </h3>
                            <p className="text-sm text-slate-400">Breakdown by payment type</p>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center h-40 text-slate-500">Loading...</div>
                    ) : (
                        <div className="space-y-4">
                            {/* Cash */}
                            <div className="flex items-center gap-4">
                                <div className="p-2 rounded-lg bg-green-500/10 text-green-500">
                                    <Banknote size={18} />
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-sm font-medium text-white">Cash</span>
                                        <span className="text-sm text-slate-400">
                                            {paymentData.cash.count} ({paymentData.cash.percent.toFixed(0)}%)
                                        </span>
                                    </div>
                                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-green-500 rounded-full transition-all duration-500"
                                            style={{ width: `${paymentData.cash.percent}%` }}
                                        />
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1">₹{paymentData.cash.amount.toLocaleString()}</p>
                                </div>
                            </div>

                            {/* UPI */}
                            <div className="flex items-center gap-4">
                                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
                                    <CreditCard size={18} />
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-sm font-medium text-white">UPI</span>
                                        <span className="text-sm text-slate-400">
                                            {paymentData.upi.count} ({paymentData.upi.percent.toFixed(0)}%)
                                        </span>
                                    </div>
                                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-purple-500 rounded-full transition-all duration-500"
                                            style={{ width: `${paymentData.upi.percent}%` }}
                                        />
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1">₹{paymentData.upi.amount.toLocaleString()}</p>
                                </div>
                            </div>

                            {/* Card */}
                            {paymentData.card.count > 0 && (
                                <div className="flex items-center gap-4">
                                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                                        <CreditCard size={18} />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-sm font-medium text-white">Card</span>
                                            <span className="text-sm text-slate-400">
                                                {paymentData.card.count} ({paymentData.card.percent.toFixed(0)}%)
                                            </span>
                                        </div>
                                        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                                                style={{ width: `${paymentData.card.percent}%` }}
                                            />
                                        </div>
                                        <p className="text-xs text-slate-500 mt-1">₹{paymentData.card.amount.toLocaleString()}</p>
                                    </div>
                                </div>
                            )}

                            {/* Online (Other) */}
                            {paymentData.online.count > 0 && (
                                <div className="flex items-center gap-4">
                                    <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                                        <CreditCard size={18} />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-sm font-medium text-white">Online</span>
                                            <span className="text-sm text-slate-400">
                                                {paymentData.online.count} ({paymentData.online.percent.toFixed(0)}%)
                                            </span>
                                        </div>
                                        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-amber-500 rounded-full transition-all duration-500"
                                                style={{ width: `${paymentData.online.percent}%` }}
                                            />
                                        </div>
                                        <p className="text-xs text-slate-500 mt-1">₹{paymentData.online.amount.toLocaleString()}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </Card>


                {/* Booking Source Breakdown */}
                <Card className="min-h-[280px]">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                <Globe size={20} className="text-indigo-500" />
                                Booking Source
                            </h3>
                            <p className="text-sm text-slate-400">Online vs Walk-in</p>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center h-40 text-slate-500">Loading...</div>
                    ) : (
                        <div className="space-y-4">
                            {(() => {
                                const sourceStats = billableBookings.reduce((acc, curr) => {
                                    // Skip pending bookings (abandoned checkouts)
                                    if (curr.status === 'pending') return acc;

                                    // Strict check + exclude test anomalies
                                    const source = (curr.source || '').toLowerCase();
                                    const payment = (curr.payment_mode || '').toLowerCase();
                                    const isTest = curr.customer_name?.toLowerCase().includes('test');

                                    // Count as Online only if source is online AND text is not test AND payment is not cash (Pay at Venue = Walk-in)
                                    if ((source === 'online' || source === 'online_booking') && !isTest && payment !== 'cash') {
                                        acc.online++;
                                    } else {
                                        acc.walkIn++;
                                    }
                                    return acc;
                                }, { online: 0, walkIn: 0 });

                                const total = sourceStats.online + sourceStats.walkIn || 1;
                                const onlinePercent = (sourceStats.online / total) * 100;
                                const walkInPercent = (sourceStats.walkIn / total) * 100;

                                return (
                                    <>
                                        {/* Online */}
                                        <div className="flex items-center gap-4">
                                            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
                                                <Globe size={18} />
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-sm font-medium text-white">Online</span>
                                                    <span className="text-sm text-slate-400">
                                                        {sourceStats.online} ({onlinePercent.toFixed(0)}%)
                                                    </span>
                                                </div>
                                                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                                                        style={{ width: `${onlinePercent}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Walk-in */}
                                        <div className="flex items-center gap-4">
                                            <div className="p-2 rounded-lg bg-orange-500/10 text-orange-500">
                                                <Store size={18} />
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-sm font-medium text-white">Walk-in</span>
                                                    <span className="text-sm text-slate-400">
                                                        {sourceStats.walkIn} ({walkInPercent.toFixed(0)}%)
                                                    </span>
                                                </div>
                                                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-orange-500 rounded-full transition-all duration-500"
                                                        style={{ width: `${walkInPercent}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    )}
                </Card>
            </div>

            {/* Recent Transactions Table */}
            <Card padding="none" className="overflow-hidden">
                <div className="p-6 border-b border-slate-800/50 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-white">Recent Transactions</h3>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-slate-400 hover:text-white"
                        onClick={exportToCSV}
                    >
                        <Download size={16} className="mr-2" />
                        Export All
                    </Button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-900/50 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
                                <th className="px-6 py-4 font-medium">Date & Time</th>
                                <th className="px-6 py-4 font-medium">Customer</th>
                                <th className="px-6 py-4 font-medium">Amount</th>
                                <th className="px-6 py-4 font-medium">Payment</th>
                                <th className="px-6 py-4 font-medium">Status</th>
                                <th className="px-6 py-4 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {billableBookings.slice(-10).reverse().map((booking) => (
                                <tr key={booking.id} className="hover:bg-slate-800/20 transition-colors">
                                    <td className="px-6 py-4 text-white">
                                        <div className="font-medium">
                                            {parseLocalDate(booking.booking_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            {booking.start_time || 'N/A'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-slate-300">
                                        {booking.customer_name || 'Walk-in'}
                                    </td>
                                    <td className="px-6 py-4 text-white font-mono">
                                        ₹{booking.total_amount?.toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 text-slate-300 capitalize">
                                        {booking.payment_mode || 'Cash'}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${booking.status === 'confirmed' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                            booking.status === 'completed' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                                                'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                            }`}>
                                            {booking.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                            <ArrowUpRight size={16} className="text-slate-500" />
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                            {bookings.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                                        No transactions found for this period.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div >
    );
}
