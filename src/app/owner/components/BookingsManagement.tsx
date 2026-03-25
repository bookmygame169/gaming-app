import { useState, useMemo } from 'react';
import { BookingsTable } from './BookingsTable';
import { Card, Button, Input, Select, StatusBadge } from './ui';
import { Download, Filter, RefreshCw, Calendar, Search } from 'lucide-react';
import { BookingRow } from '@/types/database';
import { DeletedBookingsPanel } from './DeletedBookingsPanel';

interface BookingsManagementProps {
    bookings: any[]; // Using any[] to be safe with Supabase types, ideally BookingRow
    loading?: boolean;
    onUpdateStatus: (bookingId: string, status: string) => Promise<void>;
    onEdit?: (booking: any) => void;
    onRefresh?: () => void;
    isMobile?: boolean;
    onViewOrders?: (bookingId: string, customerName: string) => void;
    onViewCustomer?: (customer: { name: string; phone?: string; email?: string }) => void;
    onPaymentModeChange?: (bookingId: string, mode: string) => Promise<void>;
}

export function BookingsManagement({ bookings, loading, onUpdateStatus, onEdit, onRefresh, isMobile, onViewOrders, onViewCustomer, onPaymentModeChange }: BookingsManagementProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [dateRange, setDateRange] = useState('all');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');

    // Filter Logic
    const filteredBookings = useMemo(() => {
        return bookings.filter(b => {
            // Search
            const searchLower = searchTerm.toLowerCase();
            const matchesSearch = !searchTerm ||
                (b.customer_name?.toLowerCase().includes(searchLower)) ||
                (b.customer_phone?.includes(searchTerm)) ||
                (b.id?.toLowerCase().includes(searchLower));

            // Status
            const matchesStatus = statusFilter === 'all' || b.status === statusFilter;

            // Date Range
            let matchesDate = true;
            if (dateRange !== 'all') {
                const bookingDate = new Date(b.booking_date);
                bookingDate.setHours(0, 0, 0, 0);
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                if (dateRange === 'today') {
                    matchesDate = bookingDate.getTime() === today.getTime();
                } else if (dateRange === 'tomorrow') {
                    const tomorrow = new Date(today);
                    tomorrow.setDate(today.getDate() + 1);
                    matchesDate = bookingDate.getTime() === tomorrow.getTime();
                } else if (dateRange === 'week') {
                    const weekEnd = new Date(today);
                    weekEnd.setDate(today.getDate() + 7);
                    matchesDate = bookingDate >= today && bookingDate <= weekEnd;
                } else if (dateRange === 'custom' && customStart && customEnd) {
                    const start = new Date(customStart);
                    start.setHours(0, 0, 0, 0);
                    const end = new Date(customEnd);
                    end.setHours(23, 59, 59, 999);
                    matchesDate = bookingDate >= start && bookingDate <= end;
                }
            }

            return matchesSearch && matchesStatus && matchesDate;
        }).sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime());
    }, [bookings, searchTerm, statusFilter, dateRange, customStart, customEnd]);



    return (
        <div className="space-y-4">


            {/* Filters Section */}
            <Card padding="md" className="space-y-4">
                <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center">
                    <div className="flex-1 w-full lg:w-auto">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                type="text"
                                placeholder="Search by name, phone, or ID..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full lg:max-w-md pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-xl focus:outline-none focus:border-blue-500 text-white"
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 w-full lg:w-auto">
                        <Select
                            value={statusFilter}
                            onChange={(val) => setStatusFilter(val)}
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
                            onChange={(val) => setDateRange(val)}
                            options={[
                                { value: 'all', label: 'All Time' },
                                { value: 'today', label: 'Today' },
                                { value: 'tomorrow', label: 'Tomorrow' },
                                { value: 'week', label: 'This Week' },
                                { value: 'custom', label: 'Custom' },
                            ]}
                        />
                        {onRefresh && (
                            <Button variant="secondary" onClick={onRefresh} title="Refresh Data">
                                <RefreshCw size={18} />
                            </Button>
                        )}
                    </div>
                </div>

                {dateRange === 'custom' && (
                    <div className="flex flex-wrap gap-4 pt-2 border-t border-slate-800">
                        <div className="space-y-1">
                            <label className="text-xs text-slate-400">Start Date</label>
                            <input
                                type="date"
                                value={customStart}
                                onChange={(e) => setCustomStart(e.target.value)}
                                className="block px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-slate-400">End Date</label>
                            <input
                                type="date"
                                value={customEnd}
                                onChange={(e) => setCustomEnd(e.target.value)}
                                className="block px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                            />
                        </div>
                    </div>
                )}
            </Card>

            {/* Table */}
            <BookingsTable
                bookings={filteredBookings}
                showFilters={false}
                onStatusChange={onUpdateStatus}
                onEdit={onEdit}
                onPaymentModeChange={onPaymentModeChange}
                onViewOrders={onViewOrders}
                onViewCustomer={onViewCustomer}
                loading={loading}
                title={`Booking List (${filteredBookings.length})`}
                showActions={true}
            />

            {/* Deleted Bookings */}
            <DeletedBookingsPanel />
        </div>
    );
}
