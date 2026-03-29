'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { BookingsTable } from './BookingsTable';
import { Card, Button, Select } from './ui';
import { RefreshCw, Search, ChevronLeft, ChevronRight, Check, X } from 'lucide-react';
import { DeletedBookingsPanel } from './DeletedBookingsPanel';

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

export function BookingsManagement({ cafeId, loading: externalLoading, onUpdateStatus, onEdit, onRefresh, isMobile, onViewOrders, onViewCustomer, onPaymentModeChange, refreshTrigger }: BookingsManagementProps) {
    const [bookings, setBookings] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(30);
    const [fetching, setFetching] = useState(false);

    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [dateRange, setDateRange] = useState('all');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkLoading, setBulkLoading] = useState(false);

    const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [debouncedSearch, setDebouncedSearch] = useState('');

    const fetchBookings = useCallback(async (pg: number, search: string) => {
        if (!cafeId) return;
        setFetching(true);
        try {
            const { dateFrom, dateTo } = getDateRange(dateRange, customStart, customEnd);
            const params = new URLSearchParams({
                cafeId,
                page: String(pg),
                pageSize: String(pageSize),
                ...(statusFilter !== 'all' && { status: statusFilter }),
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
    }, [cafeId, statusFilter, dateRange, customStart, customEnd, pageSize]);

    // Reset to page 1 when cafeId changes (fetchBookings is recreated, triggering this effect)
    const prevCafeIdRef = useRef(cafeId);
    useEffect(() => {
        if (prevCafeIdRef.current !== cafeId) {
            prevCafeIdRef.current = cafeId;
            setPage(1);
        }
    }, [cafeId]);

    // Re-fetch when filters or page change; clear selection
    useEffect(() => {
        fetchBookings(page, debouncedSearch);
        setSelectedIds(new Set());
    }, [fetchBookings, page, debouncedSearch]);

    // Re-fetch when parent signals an external change (e.g. status/payment update)
    useEffect(() => {
        if (refreshTrigger === undefined || refreshTrigger === 0) return;
        fetchBookings(page, debouncedSearch);
    }, [refreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

    // Debounce search input
    const handleSearchChange = (val: string) => {
        setSearchTerm(val);
        if (searchDebounce.current) clearTimeout(searchDebounce.current);
        searchDebounce.current = setTimeout(() => {
            setDebouncedSearch(val);
            setPage(1);
        }, 400);
    };

    // Reset page when filters change
    const handleFilterChange = (setter: (v: string) => void) => (val: string) => {
        setter(val);
        setPage(1);
    };

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const loading = fetching || externalLoading;

    async function handleBulkStatus(status: string) {
        if (!selectedIds.size || !onUpdateStatus) return;
        setBulkLoading(true);
        const ids = Array.from(selectedIds);
        try {
            await Promise.all(ids.map(id => onUpdateStatus(id, status)));
            setSelectedIds(new Set());
            fetchBookings(page, debouncedSearch);
        } finally {
            setBulkLoading(false);
        }
    }

    return (
        <div className="space-y-4">
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
                        <Button variant="secondary" onClick={() => { fetchBookings(page, debouncedSearch); onRefresh?.(); }} title="Refresh">
                            <RefreshCw size={18} />
                        </Button>
                    </div>
                </div>
                {dateRange === 'custom' && (
                    <div className="flex flex-wrap gap-4 pt-2 border-t border-slate-800">
                        <div className="space-y-1">
                            <label className="text-xs text-slate-400">Start Date</label>
                            <input type="date" value={customStart} onChange={(e) => { setCustomStart(e.target.value); setPage(1); }}
                                className="block px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-slate-400">End Date</label>
                            <input type="date" value={customEnd} onChange={(e) => { setCustomEnd(e.target.value); setPage(1); }}
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
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleBulkStatus('completed')}
                            disabled={bulkLoading}
                            className="text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                        >
                            <Check size={14} className="mr-1" /> Mark Completed
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleBulkStatus('cancelled')}
                            disabled={bulkLoading}
                            className="text-red-400 border-red-500/30 hover:bg-red-500/10"
                        >
                            <X size={14} className="mr-1" /> Mark Cancelled
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedIds(new Set())}
                            className="text-slate-400"
                        >
                            Clear
                        </Button>
                    </div>
                </div>
            )}

            {/* Table */}
            <BookingsTable
                bookings={bookings}
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

            {/* Pagination */}
            {(totalPages > 1 || total > 0) && (
                <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-3">
                        <p className="text-sm text-slate-400">
                            Page {page} of {totalPages} · {total.toLocaleString()} bookings
                        </p>
                        <div className="flex items-center gap-1">
                            {PAGE_SIZE_OPTIONS.map(size => (
                                <button
                                    key={size}
                                    onClick={() => { setPageSize(size); setPage(1); }}
                                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${pageSize === size ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                                >
                                    {size}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="secondary" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                            <ChevronLeft size={16} />
                        </Button>
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            const pg = page <= 3 ? i + 1 : page + i - 2;
                            if (pg < 1 || pg > totalPages) return null;
                            return (
                                <button key={pg} onClick={() => setPage(pg)}
                                    className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${pg === page ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
                                    {pg}
                                </button>
                            );
                        })}
                        <Button variant="secondary" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                            <ChevronRight size={16} />
                        </Button>
                    </div>
                </div>
            )}

            {/* Deleted Bookings */}
            <DeletedBookingsPanel />
        </div>
    );
}
