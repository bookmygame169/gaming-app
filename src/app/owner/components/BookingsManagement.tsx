'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { BookingsTable } from './BookingsTable';
import { Card, Button, Select } from './ui';
import { RefreshCw, Search, Check, X } from 'lucide-react';
import { DeletedBookingsPanel } from './DeletedBookingsPanel';
import { supabase } from '@/lib/supabaseClient';

const PAGE_SIZE_OPTIONS = [10, 30, 50, 100];

interface BookingsManagementProps {
    cafeId?: string;
    loading?: boolean;
    onUpdateStatus: (bookingId: string, status: string) => Promise<void>;
    onEdit?: (booking: any) => void;
    onRefresh?: () => void;
    isMobile?: boolean;
    onViewOrders?: (bookingId: string, customerName: string) => void;
    onViewCustomer?: (customer: { name: string; phone?: string; email?: string }) => void;
    onPaymentModeChange?: (bookingId: string, mode: string) => Promise<void>;
    refreshTrigger?: number;
    // Timer props for membership sub-tab
    activeTimers?: Map<string, number>;
    timerElapsed?: Map<string, number>;
    onStartTimer?: (subscriptionId: string) => Promise<void>;
    onStopTimer?: (subscriptionId: string) => Promise<void>;
}

function getDateRange(range: string, customStart: string, customEnd: string): { dateFrom: string; dateTo: string } {
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    if (range === 'today') return { dateFrom: fmt(today), dateTo: fmt(today) };
    if (range === 'tomorrow') {
        const t = new Date(today); t.setDate(t.getDate() + 1);
        return { dateFrom: fmt(t), dateTo: fmt(t) };
    }
    if (range === 'week') {
        const end = new Date(today); end.setDate(today.getDate() + 7);
        return { dateFrom: fmt(today), dateTo: fmt(end) };
    }
    if (range === 'custom' && customStart && customEnd) {
        return { dateFrom: customStart, dateTo: customEnd };
    }
    return { dateFrom: '', dateTo: '' };
}

export function BookingsManagement({ cafeId, loading: externalLoading, onUpdateStatus, onEdit, onRefresh, onViewOrders, onViewCustomer, onPaymentModeChange, refreshTrigger, activeTimers, timerElapsed, onStartTimer, onStopTimer }: BookingsManagementProps) {
    const [bookings, setBookings] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [limit, setLimit] = useState(30);
    const [fetching, setFetching] = useState(false);

    const [bookingSubTab, setBookingSubTab] = useState<'all' | 'normal' | 'membership'>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [dateRange, setDateRange] = useState('all');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkLoading, setBulkLoading] = useState(false);

    // Membership sub-tab state
    const [subscriptions, setSubscriptions] = useState<any[]>([]);
    const [subsLoading, setSubsLoading] = useState(false);
    const [subSearch, setSubSearch] = useState('');

    const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [debouncedSearch, setDebouncedSearch] = useState('');

    const fetchBookings = useCallback(async (search: string) => {
        if (!cafeId) return;
        setFetching(true);
        try {
            const { dateFrom, dateTo } = getDateRange(dateRange, customStart, customEnd);
            const params = new URLSearchParams({
                cafeId,
                page: '1',
                pageSize: String(limit),
                ...(statusFilter !== 'all' && { status: statusFilter }),
                ...(bookingSubTab !== 'all' && { source: bookingSubTab }),
                ...(search && { search }),
                ...(dateFrom && { dateFrom }),
                ...(dateTo && { dateTo }),
            });
            const res = await fetch(`/api/owner/bookings?${params}`, { credentials: 'include', cache: 'no-store' });
            const data = await res.json();
            if (res.ok) {
                setBookings(data.bookings || []);
                setTotal(data.total || 0);
            }
        } finally {
            setFetching(false);
        }
    }, [cafeId, statusFilter, bookingSubTab, dateRange, customStart, customEnd, limit]);

    // Re-fetch when filters change — don't clear selection so user can act across searches
    useEffect(() => {
        fetchBookings(debouncedSearch);
    }, [fetchBookings, debouncedSearch]);

    // Keep a ref to the latest fetch fn + search so refreshTrigger never uses a stale closure
    const latestFetchRef = useRef({ fn: fetchBookings, search: debouncedSearch });
    useEffect(() => { latestFetchRef.current = { fn: fetchBookings, search: debouncedSearch }; }, [fetchBookings, debouncedSearch]);

    useEffect(() => {
        if (!refreshTrigger) return;
        latestFetchRef.current.fn(latestFetchRef.current.search);
    }, [refreshTrigger]);

    // Debounce search input
    const handleSearchChange = (val: string) => {
        setSearchTerm(val);
        if (searchDebounce.current) clearTimeout(searchDebounce.current);
        searchDebounce.current = setTimeout(() => {
            setDebouncedSearch(val);
        }, 400);
    };

    const handleFilterChange = (setter: (v: string) => void) => (val: string) => {
        setter(val);
    };

    const loading = fetching || externalLoading;

    // Fetch subscriptions when Membership tab is active
    const fetchSubscriptions = useCallback(async () => {
        if (!cafeId) return;
        setSubsLoading(true);
        try {
            const { data } = await supabase
                .from('subscriptions')
                .select('*, membership_plans(name, console_type, plan_type, hours, validity_days)')
                .eq('cafe_id', cafeId)
                .order('purchase_date', { ascending: false });
            setSubscriptions(data || []);
        } finally {
            setSubsLoading(false);
        }
    }, [cafeId]);

    useEffect(() => {
        if (bookingSubTab === 'membership') fetchSubscriptions();
    }, [bookingSubTab, fetchSubscriptions]);

    const filteredSubs = subscriptions.filter(s => {
        if (!subSearch) return true;
        const q = subSearch.toLowerCase();
        return (
            (s.customer_name || '').toLowerCase().includes(q) ||
            (s.customer_phone || '').toLowerCase().includes(q)
        );
    });

    const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const statusColor: Record<string, string> = {
        active: 'bg-emerald-500/15 text-emerald-400',
        expired: 'bg-red-500/15 text-red-400',
        cancelled: 'bg-slate-700/50 text-slate-400',
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
            fetchBookings(debouncedSearch);
            if (failedCount > 0) {
                console.warn(`Bulk update: ${ids.length - failedCount}/${ids.length} succeeded, ${failedCount} failed`);
            }
        } finally {
            setBulkLoading(false);
        }
    }

    return (
        <div className="space-y-4">
            {/* Sub-tabs */}
            <div className="flex gap-1 p-1 rounded-2xl bg-slate-900 border border-slate-800 w-fit">
                {([
                    { id: 'all', label: '📋 All Bookings' },
                    { id: 'normal', label: '🎮 Normal' },
                    { id: 'membership', label: '👑 Membership' },
                ] as const).map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setBookingSubTab(tab.id)}
                        className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${bookingSubTab === tab.id ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ── MEMBERSHIP SUB-TAB ── */}
            {bookingSubTab === 'membership' ? (
                <div className="space-y-4">
                    {/* Search + refresh */}
                    <Card padding="md">
                        <div className="flex gap-3 items-center">
                            <div className="relative flex-1 max-w-sm">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="text"
                                    placeholder="Search by name or phone…"
                                    value={subSearch}
                                    onChange={e => setSubSearch(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
                                />
                            </div>
                            <Button variant="secondary" onClick={fetchSubscriptions} title="Refresh">
                                <RefreshCw size={16} />
                            </Button>
                            <span className="text-xs text-slate-500">{filteredSubs.length} subscription{filteredSubs.length !== 1 ? 's' : ''}</span>
                        </div>
                    </Card>

                    <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-800/60 border-b border-slate-800">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Customer</th>
                                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Plan</th>
                                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Console</th>
                                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Hours</th>
                                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Amount</th>
                                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Purchased</th>
                                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Expiry</th>
                                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Status</th>
                                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/50">
                                    {subsLoading ? (
                                        <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-500">Loading…</td></tr>
                                    ) : filteredSubs.length === 0 ? (
                                        <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-500">No membership subscriptions found</td></tr>
                                    ) : filteredSubs.map(s => {
                                        const isRunning = activeTimers?.has(s.id) ?? false;
                                        const elapsed = timerElapsed?.get(s.id) ?? 0;
                                        const elapsedMins = Math.floor(elapsed / 60);
                                        const elapsedSecs = elapsed % 60;
                                        return (
                                        <tr key={s.id} className="hover:bg-slate-800/30 transition-colors">
                                            <td className="px-4 py-3.5">
                                                <div className="font-semibold text-white">{s.customer_name || '—'}</div>
                                                {s.customer_phone && <div className="text-xs text-slate-500 mt-0.5">{s.customer_phone}</div>}
                                            </td>
                                            <td className="px-4 py-3.5 text-slate-300">{s.membership_plans?.name || '—'}</td>
                                            <td className="px-4 py-3.5 text-slate-400 uppercase text-xs">{s.membership_plans?.console_type || '—'}</td>
                                            <td className="px-4 py-3.5">
                                                <div className="text-slate-300">{s.hours_remaining != null ? Number(s.hours_remaining).toFixed(2) : '—'} / {s.hours_purchased ?? '—'} hrs</div>
                                                {isRunning && (
                                                    <div className="text-xs text-emerald-400 mt-0.5 font-mono">
                                                        ● {String(Math.floor(elapsed / 3600)).padStart(2, '0')}:{String(elapsedMins % 60).padStart(2, '0')}:{String(elapsedSecs).padStart(2, '0')}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3.5 font-semibold text-emerald-400">₹{(s.amount_paid ?? 0).toLocaleString()}</td>
                                            <td className="px-4 py-3.5 text-slate-400 text-xs">{s.purchase_date ? fmt(s.purchase_date) : '—'}</td>
                                            <td className="px-4 py-3.5 text-slate-400 text-xs">{s.expiry_date ? fmt(s.expiry_date) : '—'}</td>
                                            <td className="px-4 py-3.5">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusColor[s.status] || statusColor.cancelled}`}>
                                                    {s.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                {isRunning ? (
                                                    <button
                                                        onClick={async () => { await onStopTimer?.(s.id); fetchSubscriptions(); }}
                                                        className="px-3 py-1 rounded-lg bg-red-500/15 text-red-400 border border-red-500/30 text-xs font-semibold hover:bg-red-500/25 transition-colors"
                                                    >
                                                        Stop
                                                    </button>
                                                ) : s.status === 'active' ? (
                                                    <button
                                                        onClick={async () => { await onStartTimer?.(s.id); fetchSubscriptions(); }}
                                                        className="px-3 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-semibold hover:bg-emerald-500/25 transition-colors"
                                                    >
                                                        Start
                                                    </button>
                                                ) : (
                                                    <span className="text-slate-600 text-xs">—</span>
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
                    {/* Filters */}
                    <Card padding="md" className="space-y-4">
                        <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center">
                            <div className="flex-1 w-full lg:w-auto">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                    <input
                                        type="text"
                                        placeholder="Search by name, phone, or ID..."
                                        value={searchTerm}
                                        onChange={(e) => handleSearchChange(e.target.value)}
                                        className="w-full lg:max-w-md pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-xl focus:outline-none focus:border-blue-500 text-white"
                                    />
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2 w-full lg:w-auto">
                                <Select
                                    value={statusFilter}
                                    onChange={handleFilterChange(setStatusFilter)}
                                    options={[
                                        { value: 'all', label: 'All Status' },
                                        { value: 'pending', label: 'Pending' },
                                        { value: 'confirmed', label: 'Confirmed' },
                                        { value: 'in-progress', label: 'In Progress' },
                                        { value: 'completed', label: 'Completed' },
                                        { value: 'cancelled', label: 'Cancelled' },
                                    ]}
                                />
                                <Select
                                    value={dateRange}
                                    onChange={handleFilterChange(setDateRange)}
                                    options={[
                                        { value: 'all', label: 'All Time' },
                                        { value: 'today', label: 'Today' },
                                        { value: 'tomorrow', label: 'Tomorrow' },
                                        { value: 'week', label: 'This Week' },
                                        { value: 'custom', label: 'Custom' },
                                    ]}
                                />
                                <Button variant="secondary" onClick={() => { fetchBookings(debouncedSearch); onRefresh?.(); }} title="Refresh">
                                    <RefreshCw size={18} />
                                </Button>
                            </div>
                        </div>
                        {dateRange === 'custom' && (
                            <div className="flex flex-wrap gap-4 pt-2 border-t border-slate-800">
                                <div className="space-y-1">
                                    <label className="text-xs text-slate-400">Start Date</label>
                                    <input type="date" value={customStart} onChange={(e) => { setCustomStart(e.target.value); }}
                                        className="block px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-slate-400">End Date</label>
                                    <input type="date" value={customEnd} onChange={(e) => { setCustomEnd(e.target.value); }}
                                        className="block px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm" />
                                </div>
                            </div>
                        )}
                    </Card>

                    {/* Bulk action bar */}
                    {selectedIds.size > 0 && (
                        <div className="flex items-center gap-3 px-4 py-3 bg-indigo-600/10 border border-indigo-500/30 rounded-xl">
                            <span className="text-sm font-medium text-indigo-300">{selectedIds.size} selected</span>
                            <div className="flex gap-2 ml-auto">
                                <Button variant="secondary" size="sm" onClick={() => handleBulkStatus('completed')} disabled={bulkLoading} className="text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10">
                                    <Check size={14} className="mr-1" /> Mark Completed
                                </Button>
                                <Button variant="secondary" size="sm" onClick={() => handleBulkStatus('cancelled')} disabled={bulkLoading} className="text-red-400 border-red-500/30 hover:bg-red-500/10">
                                    <X size={14} className="mr-1" /> Mark Cancelled
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())} className="text-slate-400">Clear</Button>
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
                        onPaymentModeChange={onPaymentModeChange}
                        onViewOrders={onViewOrders}
                        onViewCustomer={onViewCustomer}
                        loading={loading}
                        title={`Bookings (${total.toLocaleString()} total)`}
                        showActions={true}
                        selectedIds={selectedIds}
                        onSelectionChange={setSelectedIds}
                    />

                    {/* Show count + limit selector */}
                    {total > 0 && (
                        <div className="flex items-center justify-between px-2">
                            <p className="text-sm text-slate-400">
                                Showing {bookings.length.toLocaleString()} of {total.toLocaleString()} bookings
                            </p>
                            <div className="flex items-center gap-1.5">
                                <span className="text-xs text-slate-500 mr-1">Show</span>
                                {PAGE_SIZE_OPTIONS.map(size => (
                                    <button key={size} onClick={() => setLimit(size)}
                                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${limit === size ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
                                        {size}
                                    </button>
                                ))}
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
