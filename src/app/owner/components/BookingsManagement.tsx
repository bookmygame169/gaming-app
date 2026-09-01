'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { parseTimeToMinutes } from "@/lib/timeUtils";
import { BookingsTable } from './BookingsTable';
import { ActiveSessions } from './ActiveSessions';
import { Card, Button } from './ui';
import { Kpis } from './consoleUi';
import { RefreshCw, Search, Check, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react';
import { DeletedBookingsPanel } from './DeletedBookingsPanel';
import { subscribeToOwnerBookingsChanged } from '@/lib/ownerBookingsSync';
import { getLocalDateString } from '../utils';
import { getBookingRevenueTotal } from '@/lib/ownerRevenue';
import { useOwnerClock } from '../context/OwnerDashboardContext';

const PAGE_SIZE_OPTIONS = [10, 30, 50, 100];
const EMPTY_BOOKING_SUMMARY = {
    cashTotal: 0,
    completed: 0,
    inProgress: 0,
    pending: 0,
    upiTotal: 0,
};

function filterVisibleBookings(bookings: any[]): any[] {
    return bookings.filter((booking) => !booking?.deleted_at);
}

function isDayPassSubscription(subscription: any): boolean {
    return subscription?.membership_plans?.plan_type === 'day_pass';
}

interface BookingsManagementProps {
    cafeId?: string;
    loading?: boolean;
    onUpdateStatus: (bookingId: string, status: string) => Promise<void>;
    onEdit?: (booking: any) => void;
    onAdjustTime?: (booking: any) => void;
    onRefresh?: () => void;
    onViewOrders?: (bookingId: string, customerName: string) => void;
    onViewCustomer?: (customer: { name: string; phone?: string; email?: string }) => void;
    onPaymentModeChange?: (bookingId: string, mode: string) => Promise<boolean>;
    refreshTrigger?: number;
    // Timer props for membership sub-tab
    activeTimers?: Map<string, number>;
    timerElapsed?: Map<string, number>;
    onStartTimer?: (subscriptionId: string) => Promise<void>;
    onStopTimer?: (subscriptionId: string) => Promise<void>;
    // Active Sessions props
    pageSubscriptions?: any[];
    pageBookings?: any[];
    onAddItems?: (bookingId: string, customerName: string) => void;
    onSessionEnded?: (info: { customerName: string; stationName: string; duration: number }) => void;
    onEndCollect?: (bookingId: string, paymentMode: 'cash' | 'upi') => Promise<void>;
    /** Unlocks or locks the physical machine(s) attached to a booking. */
    onStationCommand?: (bookingId: string, action: 'unlock' | 'lock') => Promise<void> | void;
}

function getDateRange(range: string, customStart: string, customEnd: string): { dateFrom: string; dateTo: string } {
    const today = new Date();
    const fmt = (d: Date) => getLocalDateString(d);

    if (range === 'today') return { dateFrom: fmt(today), dateTo: fmt(today) };
    if (range === 'yesterday') {
        const t = new Date(today); t.setDate(t.getDate() - 1);
        return { dateFrom: fmt(t), dateTo: fmt(t) };
    }
    if (range === 'week') {
        // Start from Monday of the current week so bookings from Mon–today all show
        const dow = today.getDay(); // 0=Sun, 1=Mon, …, 6=Sat
        const daysToMonday = dow === 0 ? 6 : dow - 1;
        const monday = new Date(today); monday.setDate(today.getDate() - daysToMonday);
        const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
        return { dateFrom: fmt(monday), dateTo: fmt(sunday) };
    }
    if (range === 'custom' && customStart && customEnd) {
        return { dateFrom: customStart, dateTo: customEnd };
    }
    return { dateFrom: '', dateTo: '' };
}

function parseStartMinutes(startTime: string | null | undefined): number | null {
    return parseTimeToMinutes(startTime);
}

function getBookingDuration(booking: any): number {
    const firstItemTitle = booking?.booking_items?.[0]?.title?.split('|')[0] || '';
    const parsedDuration = parseInt(firstItemTitle, 10);
    if (!Number.isNaN(parsedDuration) && parsedDuration > 0) {
        return parsedDuration;
    }
    return booking?.duration || 60;
}

function isActiveSessionBooking(booking: any, todayStr: string, yesterdayStr: string, currentMinutes: number): boolean {
    if (booking?.status !== 'in-progress') return false;

    const startMinutes = parseStartMinutes(booking?.start_time);
    const duration = getBookingDuration(booking);

    if (startMinutes === null || duration <= 0) {
        return booking?.booking_date === todayStr;
    }

    const endMinutes = startMinutes + duration;
    if (booking.booking_date === todayStr) return true;
    if (booking.booking_date === yesterdayStr && endMinutes > 1440) {
        return currentMinutes < (endMinutes - 1440);
    }

    return false;
}

export function BookingsManagement({ cafeId, loading: externalLoading, onUpdateStatus, onEdit, onAdjustTime, onRefresh, onViewOrders, onViewCustomer, onPaymentModeChange, refreshTrigger, activeTimers, timerElapsed: timerElapsedProp, onStartTimer, onStopTimer, pageSubscriptions, pageBookings, onAddItems, onSessionEnded, onEndCollect, onStationCommand }: BookingsManagementProps) {
    // This screen already ticks once a second for its own countdowns, so
    // reading the shared clock here costs it nothing extra.
    const clock = useOwnerClock();
    const timerElapsed = timerElapsedProp ?? clock.timerElapsed;

    const [bookings, setBookings] = useState<any[]>([]);
    const [summary, setSummary] = useState(EMPTY_BOOKING_SUMMARY);
    const [total, setTotal] = useState(0);
    const [limit, setLimit] = useState(30);
    const [currentPage, setCurrentPage] = useState(1);
    const [fetching, setFetching] = useState(false);
    const [hiddenDeletedIds, setHiddenDeletedIds] = useState<Set<string>>(new Set());

    const [bookingSubTab, setBookingSubTab] = useState<'all' | 'normal' | 'membership'>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [dateRange, setDateRange] = useState('today');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkLoading, setBulkLoading] = useState(false);
    const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
    const [mobileSessionsOpen, setMobileSessionsOpen] = useState(true);

    // Membership sub-tab state
    const [subscriptions, setSubscriptions] = useState<any[]>([]);
    const [subsLoading, setSubsLoading] = useState(false);
    const [subSearch, setSubSearch] = useState('');

    // Current time for ActiveSessions countdown
    const [currentTime, setCurrentTime] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const abortControllerRef = useRef<AbortController | null>(null);
    const subsAbortRef = useRef<AbortController | null>(null);
    const filterStateKey = `${cafeId || ''}|${statusFilter}|${bookingSubTab}|${dateRange}|${customStart}|${customEnd}|${debouncedSearch}|${limit}`;
    const previousFilterStateKeyRef = useRef(filterStateKey);

    const fetchBookings = useCallback(async (search: string, pageNumber: number) => {
        if (!cafeId) return;
        // Cancel any previous in-flight request (stale cafeId / rapid filter changes)
        abortControllerRef.current?.abort();
        abortControllerRef.current = new AbortController();
        setFetching(true);
        try {
            const { dateFrom, dateTo } = getDateRange(dateRange, customStart, customEnd);
            const params = new URLSearchParams({
                cafeId,
                page: String(pageNumber),
                pageSize: String(limit),
                ...(statusFilter !== 'all' && { status: statusFilter }),
                ...(bookingSubTab !== 'all' && { source: bookingSubTab }),
                ...(search && { search }),
                ...(dateFrom && { dateFrom }),
                ...(dateTo && { dateTo }),
            });
            const res = await fetch(`/api/owner/bookings?${params}`, {
                credentials: 'include',
                cache: 'no-store',
                signal: abortControllerRef.current.signal,
            });
            const data = await res.json();
            if (res.ok) {
                const nextTotal = Math.max(0, data.total || 0);
                const nextTotalPages = Math.max(1, Math.ceil(nextTotal / limit));
                if (pageNumber > nextTotalPages && nextTotal > 0) {
                    setCurrentPage(nextTotalPages);
                    return;
                }
                const visibleBookings = filterVisibleBookings(data.bookings || []).filter(
                    (booking) => !hiddenDeletedIds.has(booking.id)
                );
                setBookings(visibleBookings);
                setSummary(data.summary || EMPTY_BOOKING_SUMMARY);
                setTotal(nextTotal);
            } else {
                console.error('[BookingsManagement] Failed to fetch bookings:', data.error);
            }
        } catch (err: unknown) {
            if (err instanceof Error && err.name !== 'AbortError') {
                console.error('[BookingsManagement] Fetch error:', err.message);
            }
        } finally {
            setFetching(false);
        }
    }, [cafeId, statusFilter, bookingSubTab, dateRange, customStart, customEnd, hiddenDeletedIds, limit]);

    // Re-fetch when filters change — don't clear selection so user can act across searches
    useEffect(() => {
        const filtersChanged = previousFilterStateKeyRef.current !== filterStateKey;
        previousFilterStateKeyRef.current = filterStateKey;

        if (filtersChanged && currentPage !== 1) {
            setCurrentPage(1);
            return;
        }

        const pageToFetch = filtersChanged ? 1 : currentPage;
        fetchBookings(debouncedSearch, pageToFetch);
    }, [fetchBookings, debouncedSearch, currentPage, filterStateKey]);

    const latestFetchRef = useRef({ fn: fetchBookings, search: debouncedSearch, page: currentPage });
    useEffect(() => {
        latestFetchRef.current = { fn: fetchBookings, search: debouncedSearch, page: currentPage };
    }, [fetchBookings, debouncedSearch, currentPage]);

    useEffect(() => {
        if (!refreshTrigger) return;
        latestFetchRef.current.fn(latestFetchRef.current.search, latestFetchRef.current.page);
    }, [refreshTrigger]);

    useEffect(() => {
        return subscribeToOwnerBookingsChanged((detail) => {
            if (detail?.bookingId && (detail.action === 'deleted' || detail.action === 'permanently-deleted')) {
                setHiddenDeletedIds((prev) => new Set(prev).add(detail.bookingId!));
                setBookings((prev) => prev.filter((booking) => (
                    booking.id !== detail.bookingId && booking.originalBookingId !== detail.bookingId
                )));
                setTotal((prev) => Math.max(0, prev - 1));
            }
            if (detail?.bookingId && detail.action === 'restored') {
                setHiddenDeletedIds((prev) => {
                    const next = new Set(prev);
                    next.delete(detail.bookingId!);
                    return next;
                });
            }
            latestFetchRef.current.fn(latestFetchRef.current.search, latestFetchRef.current.page);
        });
    }, []);

    // Debounce search input
    const handleSearchChange = (val: string) => {
        setSearchTerm(val);
        if (searchDebounce.current) clearTimeout(searchDebounce.current);
        searchDebounce.current = setTimeout(() => {
            setDebouncedSearch(val);
        }, 400);
    };

    const loading = fetching || externalLoading;

    const handlePaymentModeUpdate = useCallback(async (bookingId: string, mode: string) => {
        if (!onPaymentModeChange) return false;

        const previousMode = bookings.find((booking) => booking.id === bookingId)?.payment_mode;
        const nextMode = mode.toLowerCase();

        setBookings((prev) => prev.map((booking) => (
            booking.id === bookingId
                ? { ...booking, payment_mode: nextMode }
                : booking
        )));

        const ok = await onPaymentModeChange(bookingId, mode);
        if (!ok) {
            setBookings((prev) => prev.map((booking) => (
                booking.id === bookingId
                    ? { ...booking, payment_mode: previousMode }
                    : booking
            )));
        }

        return ok;
    }, [bookings, onPaymentModeChange]);

    const activeSessionBookings = useMemo(() => {
        const sourceBookings = pageBookings || [];
        return filterVisibleBookings(sourceBookings).filter((booking) => {
            if (hiddenDeletedIds.has(booking.id) || hiddenDeletedIds.has(booking.originalBookingId)) return false;
            if (!cafeId) return true;
            return booking.cafe_id === cafeId;
        });
    }, [pageBookings, cafeId, hiddenDeletedIds]);

    const totalPages = Math.max(1, Math.ceil(total / limit));
    const showingStart = total === 0 ? 0 : ((currentPage - 1) * limit) + 1;
    const showingEnd = total === 0 ? 0 : Math.min(currentPage * limit, total);

    /** The rows currently on screen, as the design's EXPORT CSV offers them. */
    const exportBookingsCsv = () => {
        const header = ['Customer', 'Contact', 'Details', 'Source', 'Date', 'Start', 'Duration', 'Amount', 'Payment', 'Status'];
        const rows = bookings.map((booking) => {
            const items = booking.booking_items || [];
            return [
                booking.customer_name || booking.user_name || 'Guest',
                booking.customer_phone || booking.user_phone || '',
                items.map((item: { quantity?: number; console?: string }) => `${item.quantity}x ${item.console}`).join(' / '),
                booking.source || '',
                booking.booking_date || '',
                booking.start_time || '',
                String(booking.duration ?? ''),
                String(getBookingRevenueTotal(booking)),
                booking.payment_mode || '',
                booking.status || '',
            ];
        });
        const escape = (cell: string) => `"${String(cell).replace(/"/g, '""')}"`;
        const csv = [header, ...rows].map((cols) => cols.map(escape).join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `bookings-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    // Fetch subscriptions when Membership tab is active
    const fetchSubscriptions = useCallback(async () => {
        if (!cafeId) return;
        // Cancel previous in-flight subscription fetch
        subsAbortRef.current?.abort();
        subsAbortRef.current = new AbortController();
        setSubsLoading(true);
        try {
            const params = new URLSearchParams({ cafeId });
            const res = await fetch(`/api/owner/subscriptions?${params.toString()}`, {
                credentials: 'include',
                cache: 'no-store',
                signal: subsAbortRef.current.signal,
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to fetch subscriptions');
            }
            setSubscriptions(data.subscriptions || []);
        } catch (err: unknown) {
            if (err instanceof Error && err.name !== 'AbortError') {
                console.error('[BookingsManagement] Subscriptions fetch error:', err.message);
            }
        } finally {
            setSubsLoading(false);
        }
    }, [cafeId]);

    useEffect(() => {
        if (bookingSubTab === 'membership') fetchSubscriptions();
    }, [bookingSubTab, fetchSubscriptions]);

    const filteredSubs = subscriptions.filter(s => {
        if (!isDayPassSubscription(s)) return false;
        if (!subSearch) return true;
        const q = subSearch.toLowerCase();
        return (
            (s.customer_name || '').toLowerCase().includes(q) ||
            (s.customer_phone || '').toLowerCase().includes(q)
        );
    });

    const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const statusColor: Record<string, string> = {
        active: 'bg-[#d8ff3c]/15 text-[#d8ff3c]',
        expired: 'bg-[#ff5c2b]/15 text-[#ff5c2b]',
        cancelled: 'bg-[#f2f0ea]/[0.05] text-[#f2f0ea]/50',
    };

    async function handleBulkStatus(status: string) {
        if (!selectedIds.size || !onUpdateStatus) return;
        setBulkLoading(true);
        const ids = Array.from(selectedIds);
        let failedCount = 0;
        try {
            // Process in batches of 10 to avoid flooding the server
            const BATCH = 10;
            for (let i = 0; i < ids.length; i += BATCH) {
                const batch = ids.slice(i, i + BATCH);
                const results = await Promise.allSettled(batch.map(id => onUpdateStatus(id, status)));
                failedCount += results.filter(r => r.status === 'rejected').length;
            }
            setSelectedIds(new Set());
            fetchBookings(debouncedSearch, currentPage);
            if (failedCount > 0) {
                console.warn(`Bulk update: ${ids.length - failedCount}/${ids.length} succeeded, ${failedCount} failed`);
            }
        } finally {
            setBulkLoading(false);
        }
    }

    const todayStr = getLocalDateString();
    const yesterday = new Date(currentTime);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getLocalDateString(yesterday);
    const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    const activeSessionCount = activeSessionBookings.filter((booking) => (
        isActiveSessionBooking(booking, todayStr, yesterdayStr, currentMinutes)
    )).length;
    const activeFilterCount = [
        searchTerm.trim() ? 1 : 0,
        statusFilter !== 'all' ? 1 : 0,
        dateRange !== 'today' ? 1 : 0,
    ].reduce((sum, value) => sum + value, 0);
    const dateRangeLabelMap: Record<string, string> = {
        today: 'Today',
        yesterday: 'Yesterday',
        week: 'This week',
        all: 'All time',
        custom: 'Custom range',
    };
    const mobileFilterSummary = activeFilterCount > 0
        ? `${activeFilterCount} active`
        : `${dateRangeLabelMap[dateRange] || 'Today'} · all statuses`;

    useEffect(() => {
        if (activeSessionCount > 0) {
            setMobileSessionsOpen(true);
        }
    }, [activeSessionCount]);

    return (
        <div className="space-y-3 md:space-y-4">
            {/* The design opens on the day in four figures — how many bookings,
                how many running, how many done, and what was taken. */}
            <Kpis
                items={[
                    { label: 'BOOKINGS', value: total.toLocaleString() },
                    {
                        label: 'ACTIVE',
                        value: String(activeSessionCount),
                        tone: activeSessionCount > 0 ? 'lime' : 'ink',
                    },
                    { label: 'COMPLETED', value: String(summary.completed) },
                    {
                        label: `COLLECTED · ₹${summary.cashTotal.toLocaleString('en-IN')} CASH / ₹${summary.upiTotal.toLocaleString('en-IN')} UPI`,
                        value: `₹${(summary.cashTotal + summary.upiTotal).toLocaleString('en-IN')}`,
                        tone: summary.cashTotal + summary.upiTotal > 0 ? 'lime' : 'ink',
                    },
                ]}
            />

            {/* Active Sessions */}
            <section className="mb-2 border border-[#f2f0ea]/[0.07] bg-[#111113] p-2.5 md:border-0 md:bg-transparent md:p-0">
                <div className="flex items-center justify-between gap-3 md:mb-4">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="whitespace-nowrap font-mono text-[10px] tracking-[0.2em] text-[#f2f0ea]/50">
                            ACTIVE SESSIONS
                        </span>
                        {activeSessionCount > 0 && (
                            <span className="flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.14em] text-[#d8ff3c]">
                                <span className="h-1.5 w-1.5 animate-pulse bg-[#d8ff3c]" />
                                {activeSessionCount}
                            </span>
                        )}
                        <span className="hidden h-px flex-1 bg-[#f2f0ea]/10 md:block" />
                    </div>
                    <button
                        type="button"
                        onClick={() => setMobileSessionsOpen((open) => !open)}
                        className="inline-flex items-center gap-1.5 border border-[#f2f0ea]/10 bg-[#f2f0ea]/[0.04] px-3 py-1.5 text-[11px] font-semibold text-[#f2f0ea]/70 transition-colors hover:text-[#f2f0ea] md:hidden"
                    >
                        {mobileSessionsOpen ? 'Hide' : 'Show'}
                        {mobileSessionsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                </div>
                <div className={`${mobileSessionsOpen ? 'mt-4 md:mt-0' : 'hidden md:block'}`}>
                    <ActiveSessions
                        bookings={activeSessionBookings}
                        subscriptions={pageSubscriptions || []}
                        activeTimers={activeTimers || new Map()}
                        timerElapsed={timerElapsed || new Map()}
                        currentTime={currentTime}
                        onAddTime={onAdjustTime || onEdit}
                        onAddItems={onAddItems}
                        onEdit={onEdit}
                        onSessionEnded={onSessionEnded}
                        onEndCollect={onEndCollect}
                        onEndMembership={onStopTimer}
                        onStationCommand={onStationCommand}
                    />
                </div>
            </section>

            {/* Sub-tabs */}
            <div className="overflow-x-auto -mx-1 px-1">
            <div className="flex w-fit gap-px border border-[#f2f0ea]/10 bg-[#f2f0ea]/10">
                {([
                    { id: 'all', label: 'All Bookings' },
                    { id: 'normal', label: 'Normal' },
                    { id: 'membership', label: 'Day Pass' },
                ] as const).map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setBookingSubTab(tab.id)}
                        className={`px-3 py-1.5 font-mono text-[11px] font-semibold tracking-[0.12em] transition-colors md:px-4 md:py-2 ${bookingSubTab === tab.id ? 'bg-[#d8ff3c] text-[#0b0b0c]' : 'text-[#f2f0ea]/50 hover:bg-[#f2f0ea]/[0.04] hover:text-[#f2f0ea]'}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
            </div>

            {/* ── MEMBERSHIP SUB-TAB ── */}
            {bookingSubTab === 'membership' ? (
                <div className="space-y-4">
                    {/* Search + refresh */}
                    <Card padding="md">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <div className="relative w-full flex-1 sm:max-w-sm">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#f2f0ea]/50" size={16} />
                                <input
                                    type="text"
                                    placeholder="Search by name or phone…"
                                    value={subSearch}
                                    onChange={e => setSubSearch(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 bg-[#f2f0ea]/[0.04] border border-[#f2f0ea]/10 text-sm text-[#f2f0ea] placeholder-[#f2f0ea]/30 focus:outline-none focus:border-[#d8ff3c]/60 focus:ring-1 focus:ring-[#d8ff3c]/30"
                                />
                            </div>
                            <div className="flex items-center justify-between gap-3 sm:justify-start">
                                <Button variant="secondary" onClick={fetchSubscriptions} title="Refresh">
                                    <RefreshCw size={16} />
                                </Button>
                                <span className="text-xs text-[#f2f0ea]/40">{filteredSubs.length} day pass entr{filteredSubs.length === 1 ? 'y' : 'ies'}</span>
                            </div>
                        </div>
                    </Card>

                    <div className=" bg-[#111113] border border-[#f2f0ea]/10 overflow-hidden">
                        <div className="md:hidden divide-y divide-white/[0.05]">
                            {subsLoading ? (
                                <div className="px-4 py-12 text-center text-[#f2f0ea]/40">Loading…</div>
                            ) : filteredSubs.length === 0 ? (
                                <div className="px-4 py-12 text-center text-[#f2f0ea]/40">No day pass entries found</div>
                            ) : filteredSubs.map((s) => {
                                const isRunning = activeTimers?.has(s.id) ?? false;
                                const elapsed = timerElapsed?.get(s.id) ?? 0;
                                const displayHours = Math.floor(elapsed / 3600);
                                const displayMins = Math.floor((elapsed % 3600) / 60);
                                const displaySecs = elapsed % 60;

                                return (
                                    <div key={s.id} className="space-y-2.5 px-3 py-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <div className="text-[15px] font-semibold text-[#f2f0ea]">{s.customer_name || '—'}</div>
                                                {s.customer_phone && <div className="mt-0.5 text-[11px] text-[#f2f0ea]/40">{s.customer_phone}</div>}
                                            </div>
                                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusColor[s.status] || statusColor.cancelled}`}>
                                                {s.status}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className=" border border-[#f2f0ea]/[0.07] bg-[#111113] px-2.5 py-2">
                                                <div className="text-[10px] uppercase tracking-[0.12em] text-[#f2f0ea]/40">Plan</div>
                                                <div className="mt-1 text-[13px] font-medium text-[#f2f0ea]">{s.membership_plans?.name || '—'}</div>
                                                <div className="mt-1 text-[11px] uppercase text-[#f2f0ea]/40">{s.membership_plans?.console_type || '—'}</div>
                                            </div>
                                            <div className=" border border-[#f2f0ea]/[0.07] bg-[#111113] px-2.5 py-2">
                                                <div className="text-[10px] uppercase tracking-[0.12em] text-[#f2f0ea]/40">Amount</div>
                                                <div className="mt-1 text-[13px] font-semibold text-[#d8ff3c]">₹{(s.amount_paid ?? 0).toLocaleString()}</div>
                                                <div className="mt-1 text-[11px] text-[#f2f0ea]/40">{s.purchase_date ? fmt(s.purchase_date) : '—'}</div>
                                            </div>
                                        </div>
                                        <div className=" border border-[#f2f0ea]/[0.07] bg-[#111113] px-2.5 py-2.5">
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <div className="text-[10px] uppercase tracking-[0.12em] text-[#f2f0ea]/40">Pass Time</div>
                                                    <div className="mt-1 text-[13px] text-[#f2f0ea]/70">
                                                        Ends at 10:00 PM
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-[10px] uppercase tracking-[0.12em] text-[#f2f0ea]/40">Expiry</div>
                                                    <div className="mt-1 text-xs text-[#f2f0ea]/50">{s.expiry_date ? fmt(s.expiry_date) : '—'}</div>
                                                </div>
                                            </div>
                                            {isRunning && (
                                                <div className="mt-2 text-xs font-mono text-[#d8ff3c]">
                                                    ● {String(displayHours).padStart(2, '0')}:{String(displayMins).padStart(2, '0')}:{String(displaySecs).padStart(2, '0')}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex justify-end">
                                            {isRunning ? (
                                                <button
                                                    onClick={async () => { await onStopTimer?.(s.id); fetchSubscriptions(); }}
                                                    className=" border border-[#ff5c2b]/30 bg-[#ff5c2b]/15 px-3 py-1.5 text-[11px] font-semibold text-[#ff5c2b] transition-colors hover:bg-[#ff5c2b]/25"
                                                >
                                                    Stop
                                                </button>
                                            ) : s.status === 'active' ? (
                                                <button
                                                    onClick={async () => { await onStartTimer?.(s.id); fetchSubscriptions(); }}
                                                    className=" border border-[#d8ff3c]/30 bg-[#d8ff3c]/15 px-3 py-1.5 text-[11px] font-semibold text-[#d8ff3c] transition-colors hover:bg-[#d8ff3c]/25"
                                                >
                                                    Start
                                                </button>
                                            ) : (
                                                <span className="text-[#f2f0ea]/30 text-xs">—</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-[#111113] border-b border-[#f2f0ea]/[0.07]">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-[#f2f0ea]/50 uppercase tracking-widest">Customer</th>
                                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-[#f2f0ea]/50 uppercase tracking-widest">Plan</th>
                                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-[#f2f0ea]/50 uppercase tracking-widest">Console</th>
                                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-[#f2f0ea]/50 uppercase tracking-widest">Pass Time</th>
                                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-[#f2f0ea]/50 uppercase tracking-widest">Amount</th>
                                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-[#f2f0ea]/50 uppercase tracking-widest">Purchased</th>
                                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-[#f2f0ea]/50 uppercase tracking-widest">Expiry</th>
                                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-[#f2f0ea]/50 uppercase tracking-widest">Status</th>
                                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-[#f2f0ea]/50 uppercase tracking-widest">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/[0.05]">
                                    {subsLoading ? (
                                        <tr><td colSpan={9} className="px-4 py-12 text-center text-[#f2f0ea]/40">Loading…</td></tr>
                                    ) : filteredSubs.length === 0 ? (
                                        <tr><td colSpan={9} className="px-4 py-12 text-center text-[#f2f0ea]/40">No day pass entries found</td></tr>
                                    ) : filteredSubs.map(s => {
                                        const isRunning = activeTimers?.has(s.id) ?? false;
                                        const elapsed = timerElapsed?.get(s.id) ?? 0;
                                        const displayHours = Math.floor(elapsed / 3600);
                                        const displayMins = Math.floor((elapsed % 3600) / 60);
                                        const displaySecs = elapsed % 60;
                                        return (
                                        <tr key={s.id} className="hover:bg-[#111113] transition-colors">
                                            <td className="px-4 py-3.5">
                                                <div className="font-semibold text-[#f2f0ea]">{s.customer_name || '—'}</div>
                                                {s.customer_phone && <div className="text-xs text-[#f2f0ea]/40 mt-0.5">{s.customer_phone}</div>}
                                            </td>
                                            <td className="px-4 py-3.5 text-[#f2f0ea]/70">{s.membership_plans?.name || '—'}</td>
                                            <td className="px-4 py-3.5 text-[#f2f0ea]/50 uppercase text-xs">{s.membership_plans?.console_type || '—'}</td>
                                            <td className="px-4 py-3.5">
                                                <div className="text-[#f2f0ea]/70">Ends at 10:00 PM</div>
                                                {isRunning && (
                                                    <div className="text-xs text-[#d8ff3c] mt-0.5 font-mono">
                                                        ● {String(displayHours).padStart(2, '0')}:{String(displayMins).padStart(2, '0')}:{String(displaySecs).padStart(2, '0')}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3.5 font-semibold text-[#d8ff3c]">₹{(s.amount_paid ?? 0).toLocaleString()}</td>
                                            <td className="px-4 py-3.5 text-[#f2f0ea]/50 text-xs">{s.purchase_date ? fmt(s.purchase_date) : '—'}</td>
                                            <td className="px-4 py-3.5 text-[#f2f0ea]/50 text-xs">{s.expiry_date ? fmt(s.expiry_date) : '—'}</td>
                                            <td className="px-4 py-3.5">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusColor[s.status] || statusColor.cancelled}`}>
                                                    {s.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                {isRunning ? (
                                                    <button
                                                        onClick={async () => { await onStopTimer?.(s.id); fetchSubscriptions(); }}
                                                        className="px-3 py-1 bg-[#ff5c2b]/15 text-[#ff5c2b] border border-[#ff5c2b]/30 text-xs font-semibold hover:bg-[#ff5c2b]/25 transition-colors"
                                                    >
                                                        Stop
                                                    </button>
                                                ) : s.status === 'active' ? (
                                                    <button
                                                        onClick={async () => { await onStartTimer?.(s.id); fetchSubscriptions(); }}
                                                        className="px-3 py-1 bg-[#d8ff3c]/15 text-[#d8ff3c] border border-[#d8ff3c]/30 text-xs font-semibold hover:bg-[#d8ff3c]/25 transition-colors"
                                                    >
                                                        Start
                                                    </button>
                                                ) : (
                                                    <span className="text-[#f2f0ea]/30 text-xs">—</span>
                                                )}
                                            </td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    {/* The design's filter row: one line for the search and the
                        range, the statuses under it with their counts. This was
                        three stacked rows inside a card. */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3 md:hidden">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] text-[#f2f0ea]/50">
                                    <SlidersHorizontal size={13} />
                                    FILTERS
                                </div>
                                <p className="mt-1 font-mono text-[10.5px] text-[#f2f0ea]/40">{mobileFilterSummary}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setMobileFiltersOpen((open) => !open)}
                                className="inline-flex items-center gap-1.5 border border-[#f2f0ea]/[0.14] px-3 py-1.5 font-mono text-[10.5px] tracking-[0.12em] text-[#f2f0ea]/70 transition-colors hover:text-[#f2f0ea]"
                            >
                                {mobileFiltersOpen ? 'HIDE' : 'SHOW'}
                                {mobileFiltersOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            </button>
                        </div>

                        <div className={`${mobileFiltersOpen ? 'space-y-2' : 'hidden'} md:block md:space-y-2`}>
                            <div className="flex flex-wrap items-center gap-2">
                                <input
                                    type="text"
                                    placeholder="Search name, phone or ID"
                                    value={searchTerm}
                                    onChange={(e) => handleSearchChange(e.target.value)}
                                    className="min-w-[190px] flex-1 border border-[#f2f0ea]/[0.14] bg-[#111113] px-[13px] py-[11px] font-mono text-[12px] text-[#f2f0ea] placeholder-[#f2f0ea]/30 transition-colors focus:border-[#d8ff3c] focus:outline-none"
                                />
                                <div className="flex gap-px border border-[#f2f0ea]/[0.12] bg-[#f2f0ea]/[0.12]">
                                    {([
                                        { v: 'today', l: 'TODAY' },
                                        { v: 'yesterday', l: 'YESTERDAY' },
                                        { v: 'week', l: 'THIS WEEK' },
                                        { v: 'all', l: 'ALL TIME' },
                                        { v: 'custom', l: 'CUSTOM' },
                                    ] as const).map(({ v, l }) => {
                                        const on = dateRange === v;
                                        return (
                                            <button
                                                key={v}
                                                type="button"
                                                onClick={() => setDateRange(v)}
                                                className="whitespace-nowrap px-[13px] py-2.5 font-mono text-[10.5px] tracking-[0.1em] transition-colors"
                                                style={
                                                    on
                                                        ? { background: 'rgba(216,255,60,.14)', color: '#d8ff3c' }
                                                        : { background: '#111113', color: 'rgba(242,240,234,.5)' }
                                                }
                                            >
                                                {l}
                                            </button>
                                        );
                                    })}
                                </div>
                                <button
                                    onClick={() => { fetchBookings(debouncedSearch, currentPage); onRefresh?.(); }}
                                    title="Refresh"
                                    className="flex h-[38px] w-[38px] shrink-0 items-center justify-center border border-[#f2f0ea]/[0.14] text-[#f2f0ea]/50 transition-colors hover:border-[#f2f0ea]/35 hover:text-[#f2f0ea]"
                                >
                                    <RefreshCw size={15} />
                                </button>
                            </div>

                            {/* Counts come from the server's summary for this range;
                                a status it does not count goes without one rather
                                than showing a number for the loaded page only. */}
                            <div className="flex flex-wrap gap-1.5">
                                {([
                                    { v: 'all', l: 'ALL', n: total },
                                    { v: 'in-progress', l: 'ACTIVE', n: summary.inProgress },
                                    { v: 'confirmed', l: 'CONFIRMED', n: null },
                                    { v: 'pending', l: 'PENDING', n: summary.pending },
                                    { v: 'completed', l: 'COMPLETED', n: summary.completed },
                                    { v: 'cancelled', l: 'CANCELLED', n: null },
                                ] as { v: string; l: string; n: number | null }[]).map(({ v, l, n }) => {
                                    const on = statusFilter === v;
                                    return (
                                        <button
                                            key={v}
                                            type="button"
                                            onClick={() => setStatusFilter(v)}
                                            className="whitespace-nowrap px-3 py-2.5 font-mono text-[10.5px] tracking-[0.1em] transition-colors"
                                            style={
                                                on
                                                    ? { border: '1px solid #d8ff3c', background: 'rgba(216,255,60,.10)', color: '#d8ff3c' }
                                                    : { border: '1px solid rgba(242,240,234,.14)', color: 'rgba(242,240,234,.5)' }
                                            }
                                        >
                                            {l}
                                            {n !== null && <span className="opacity-50"> {n}</span>}
                                        </button>
                                    );
                                })}
                            </div>

                            {dateRange === 'custom' && (
                                <div className="flex flex-wrap gap-4 border-t border-[#f2f0ea]/[0.07] pt-2">
                                    <div className="space-y-1">
                                        <label className="font-mono text-[9.5px] tracking-[0.16em] text-[#f2f0ea]/[0.38]">START DATE</label>
                                        <input type="date" value={customStart} onChange={(e) => { setCustomStart(e.target.value); }}
                                            className="block border border-[#f2f0ea]/[0.14] bg-[#111113] px-3 py-2 font-mono text-[12px] text-[#f2f0ea] focus:border-[#d8ff3c] focus:outline-none"
                                            style={{ colorScheme: 'dark' }} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="font-mono text-[9.5px] tracking-[0.16em] text-[#f2f0ea]/[0.38]">END DATE</label>
                                        <input type="date" value={customEnd} onChange={(e) => { setCustomEnd(e.target.value); }}
                                            className="block border border-[#f2f0ea]/[0.14] bg-[#111113] px-3 py-2 font-mono text-[12px] text-[#f2f0ea] focus:border-[#d8ff3c] focus:outline-none"
                                            style={{ colorScheme: 'dark' }} />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Bulk action bar */}
                    {selectedIds.size > 0 && (
                        <div className="flex flex-col gap-3 px-4 py-3 bg-[#d8ff3c]/10 border border-[#d8ff3c]/30 sm:flex-row sm:items-center">
                            <span className="text-sm font-medium text-[#d8ff3c]">{selectedIds.size} selected</span>
                            <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row">
                                <Button variant="secondary" size="sm" onClick={() => handleBulkStatus('completed')} disabled={bulkLoading} className="w-full text-[#d8ff3c] border-[#d8ff3c]/30 hover:bg-[#d8ff3c]/10 sm:w-auto">
                                    <Check size={14} className="mr-1" /> Mark Completed
                                </Button>
                                <Button variant="secondary" size="sm" onClick={() => handleBulkStatus('cancelled')} disabled={bulkLoading} className="w-full text-[#ff5c2b] border-[#ff5c2b]/30 hover:bg-[#ff5c2b]/10 sm:w-auto">
                                    <X size={14} className="mr-1" /> Mark Cancelled
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())} className="w-full text-[#f2f0ea]/50 sm:w-auto">Clear</Button>
                            </div>
                        </div>
                    )}

                    {/* Table */}
                    <BookingsTable
                        bookings={bookings}
                        limit={bookings.length}
                        showFilters={false}
                        onStatusChange={onUpdateStatus}
                        onEdit={onEdit}
                        onPaymentModeChange={handlePaymentModeUpdate}
                        onViewOrders={onViewOrders}
                        onViewCustomer={onViewCustomer}
                        loading={loading}
                        title=""
                        showActions={true}
                        selectedIds={selectedIds}
                        onSelectionChange={setSelectedIds}
                    />

                    {/* The design's footer strip: what is on screen, then the
                        ways out of it. Paging is ours — the design shows every
                        row and this table does not. */}
                    {total > 0 && (
                        <div className="flex flex-col gap-3 border border-t-0 border-[#f2f0ea]/10 bg-[#111113] px-4 py-3 font-mono text-[10.5px] text-[#f2f0ea]/40 md:flex-row md:items-center md:justify-between">
                            <p className="truncate">
                                Showing {showingEnd - showingStart + 1} of {total.toLocaleString()} bookings
                                {activeSessionCount > 0 && ` · ${activeSessionCount} active`}
                                {summary.cashTotal + summary.upiTotal > 0 &&
                                    ` · ₹${(summary.cashTotal + summary.upiTotal).toLocaleString('en-IN')} collected`}
                            </p>
                            <div className="flex flex-wrap items-center gap-3">
                                <button
                                    type="button"
                                    onClick={exportBookingsCsv}
                                    className="whitespace-nowrap tracking-[0.14em] transition-colors hover:text-[#d8ff3c]"
                                >
                                    EXPORT CSV →
                                </button>
                                <div className="flex items-center gap-1.5">
                                    <span className="mr-1 text-[#f2f0ea]/40">Show</span>
                                    {PAGE_SIZE_OPTIONS.map(size => (
                                        <button key={size} onClick={() => setLimit(size)}
                                            className={`px-2.5 py-1 text-xs font-medium transition-colors ${limit === size ? 'bg-[#d8ff3c] text-[#0b0b0c]' : 'text-[#f2f0ea]/50 hover:text-[#f2f0ea] hover:bg-[#f2f0ea]/[0.06]'}`}>
                                            {size}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                                        disabled={currentPage <= 1}
                                        className="inline-flex h-8 w-8 items-center justify-center border border-[#f2f0ea]/10 bg-[#f2f0ea]/[0.04] text-[#f2f0ea]/50 transition-colors hover:text-[#f2f0ea] hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                                        aria-label="Previous page"
                                    >
                                        <ChevronLeft size={14} />
                                    </button>
                                    <span className="text-xs font-medium text-[#f2f0ea]/50">
                                        Page {currentPage.toLocaleString()} of {totalPages.toLocaleString()}
                                    </span>
                                    <button
                                        onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                                        disabled={currentPage >= totalPages}
                                        className="inline-flex h-8 w-8 items-center justify-center border border-[#f2f0ea]/10 bg-[#f2f0ea]/[0.04] text-[#f2f0ea]/50 transition-colors hover:text-[#f2f0ea] hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                                        aria-label="Next page"
                                    >
                                        <ChevronRight size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Deleted Bookings */}
                    <DeletedBookingsPanel />
                </>
            )}
        </div>
    );
}
