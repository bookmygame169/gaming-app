/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState } from 'react';
import { Card, StatusBadge, Button } from './ui';
import { Search, ChevronLeft, ChevronRight, X, CheckCircle, ShoppingBag } from 'lucide-react';

interface BookingsTableProps {
    bookings: any[];
    onStatusChange?: (id: string, status: string) => void;
    onEdit?: (booking: any) => void;
    onViewOrders?: (bookingId: string, customerName: string) => void;
    onViewCustomer?: (customer: { name: string; phone?: string; email?: string }) => void;
    showFilters?: boolean;
    limit?: number;
    loading?: boolean;
    theme?: any;
    title?: string;
    onViewAll?: () => void;
    showActions?: boolean;
    onPaymentModeChange?: (id: string, mode: string) => void;
    selectedIds?: Set<string>;
    onSelectionChange?: (ids: Set<string>) => void;
}

export function BookingsTable({
    bookings,
    onStatusChange,
    onEdit,
    onViewOrders,
    onViewCustomer,
    showFilters = false,
    limit,
    loading = false,
    title = "Bookings",
    onViewAll,
    showActions = true,
    onPaymentModeChange,
    selectedIds,
    onSelectionChange,
}: BookingsTableProps) {
  const selectable = !!onSelectionChange;
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    // Filter logic
    const filteredBookings = bookings.filter((booking) => {
        const matchesSearch =
            (booking.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false) ||
            (booking.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false) ||
            (booking.id?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false) ||
            (booking.customer_phone?.includes(searchTerm) ?? false);

        const matchesStatus =
            statusFilter === 'all' || booking.status?.toLowerCase() === statusFilter.toLowerCase();

        return matchesSearch && matchesStatus;
    });

    // Sort by date desc
    filteredBookings.sort((a, b) => {
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });

    // Apply limit if provided (for dashboard view)
    const displayBookings = limit ? filteredBookings.slice(0, limit) : filteredBookings;

    // Pagination (only if no limit)
    const totalPages = Math.ceil(filteredBookings.length / itemsPerPage);
    const paginatedBookings = limit
        ? displayBookings
        : displayBookings.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const formatDate = (dateString: string | null) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    };

    const formatTime = (timeString: string | null) => {
        if (!timeString) return '-';
        // If it's a full ISO string
        if (timeString.includes('T')) {
            return new Date(timeString).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "numeric",
                hour12: true
            });
        }
        // If it's already HH:MM format, try to format nicely
        return timeString;
    };

    const isDigitalPaymentMode = (mode: string | null | undefined) => {
        const normalized = mode?.toLowerCase() || '';
        return ['online', 'upi', 'paytm', 'gpay', 'phonepe', 'card'].includes(normalized);
    };

    return (
        <Card className="w-full overflow-hidden" padding="none">
            <div className="p-4 md:p-6 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    {title}
                </h2>

                {showFilters && (
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search bookings..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-full sm:w-64"
                            />
                        </div>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                        >
                            <option value="all">All Status</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                            <option value="in-progress">In Progress</option>
                        </select>
                    </div>
                )}
            </div>

            <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm text-left table-fixed">
                    <thead className="text-xs text-slate-400 uppercase bg-slate-900/50 border-b border-white/5">
                        <tr>
                            {selectable && (
                                <th className="px-3 py-3 w-8">
                                    <input
                                        type="checkbox"
                                        className="accent-indigo-500 cursor-pointer"
                                        checked={paginatedBookings.length > 0 && paginatedBookings.every(b => selectedIds?.has(b.id))}
                                        onChange={(e) => {
                                            const next = new Set(selectedIds);
                                            paginatedBookings.forEach(b => e.target.checked ? next.add(b.id) : next.delete(b.id));
                                            onSelectionChange!(next);
                                        }}
                                    />
                                </th>
                            )}
                            <th className="px-4 py-3 font-semibold w-[18%]">Customer</th>
                            <th className="px-4 py-3 font-semibold w-[18%]">Details</th>
                            <th className="px-4 py-3 font-semibold w-[18%]">Date & Time</th>
                            <th className="px-4 py-3 font-semibold w-[12%]">Amount</th>
                            <th className="px-4 py-3 font-semibold w-[14%]">Status</th>
                            {showActions && <th className="px-4 py-3 font-semibold text-right w-[20%]">Actions</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {loading ? (
                            <tr>
                                <td colSpan={(showActions ? 6 : 5) + (selectable ? 1 : 0)} className="px-6 py-8 text-center text-slate-500">
                                    Loading bookings...
                                </td>
                            </tr>
                        ) : paginatedBookings.length === 0 ? (
                            <tr>
                                <td colSpan={(showActions ? 6 : 5) + (selectable ? 1 : 0)} className="px-6 py-8 text-center text-slate-500">
                                    No bookings found
                                </td>
                            </tr>
                        ) : (
                            paginatedBookings.map((booking) => (
                                <tr key={booking.id} className={`hover:bg-white/5 transition-colors ${selectedIds?.has(booking.id) ? 'bg-indigo-500/5' : ''}`}>
                                    {selectable && (
                                        <td className="px-3 py-1.5">
                                            <input
                                                type="checkbox"
                                                className="accent-indigo-500 cursor-pointer"
                                                checked={selectedIds?.has(booking.id) ?? false}
                                                onChange={(e) => {
                                                    e.stopPropagation();
                                                    const next = new Set(selectedIds);
                                                    if (e.target.checked) next.add(booking.id);
                                                    else next.delete(booking.id);
                                                    onSelectionChange!(next);
                                                }}
                                            />
                                        </td>
                                    )}
                                    <td className="px-4 py-1.5">
                                        <div
                                            className={`font-medium text-white ${onViewCustomer ? 'cursor-pointer hover:text-blue-400 hover:underline' : ''}`}
                                            onClick={(e) => {
                                                if (onViewCustomer) {
                                                    e.stopPropagation();
                                                    onViewCustomer({
                                                        name: booking.customer_name || booking.user_name || "Guest",
                                                        phone: booking.customer_phone || booking.user_phone,
                                                        email: booking.user_email
                                                    });
                                                }
                                            }}
                                        >
                                            {booking.customer_name || booking.user_name || "Guest"}
                                        </div>
                                        <div className="text-xs text-slate-500 mt-0.5">
                                            {booking.customer_phone || booking.user_email || "-"}
                                        </div>
                                    </td>
                                    <td className="px-4 py-1.5">
                                        <div className="text-slate-300">
                                            {booking.source === 'membership'
                                                ? <span className="inline-flex items-center gap-1 text-purple-400 font-medium">
                                                    ★ {booking.booking_items?.[0]?.console || 'Membership'}
                                                  </span>
                                                : booking.booking_items?.map((item: any, idx: number) => (
                                                    <span key={idx} className="block">
                                                        {item.quantity}x {item.console}
                                                    </span>
                                                )) || <span className="text-slate-500">No items</span>
                                            }
                                        </div>
                                        <div className="text-xs mt-0.5 capitalize">
                                            {booking.source === 'membership'
                                                ? <span className="text-purple-500">Membership</span>
                                                : <span className="text-slate-500">{booking.source?.replace('_', ' ') || 'Online'}</span>
                                            }
                                        </div>
                                    </td>
                                    <td className="px-4 py-1.5">
                                        <div className="text-white">{formatDate(booking.booking_date)}</div>
                                        <div className="text-xs text-slate-500 mt-0.5">
                                            {formatTime(booking.start_time)} ({booking.duration}m)
                                        </div>
                                    </td>
                                    <td className="px-4 py-1.5">
                                        <div className="font-semibold text-emerald-400">
                                            ₹{booking.total_amount}
                                        </div>
                                        <div className="text-xs text-slate-500 mt-0.5 capitalize">
                                            {booking.payment_mode || 'Unpaid'}
                                        </div>
                                    </td>
                                    <td className="px-4 py-1.5">
                                        <StatusBadge status={booking.status || 'pending'} />
                                    </td>
                                    {showActions && (
                                        <td className="px-4 py-1.5 text-right">
                                            <div className="flex items-center justify-end gap-1">

                                                {onStatusChange && (booking.status === 'confirmed' || booking.status === 'in-progress') && (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="text-blue-500 hover:text-blue-400 hover:bg-blue-500/10"
                                                        onClick={(e) => { e.stopPropagation(); onStatusChange(booking.id, 'completed'); }}
                                                        title="Complete Booking"
                                                    >
                                                        <CheckCircle size={18} />
                                                    </Button>
                                                )}

                                                {onStatusChange && ['confirmed', 'in-progress'].includes(booking.status) && (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                                                        onClick={(e) => { e.stopPropagation(); onStatusChange(booking.id, 'cancelled'); }}
                                                        title="Cancel Booking"
                                                    >
                                                        <X size={18} />
                                                    </Button>
                                                )}

                                                {onViewOrders && (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
                                                        onClick={(e) => { e.stopPropagation(); onViewOrders(booking.id, booking.customer_name || booking.user_name || 'Guest'); }}
                                                        title="View F&B Orders"
                                                    >
                                                        <ShoppingBag size={16} />
                                                    </Button>
                                                )}

                                                {onPaymentModeChange && (
                                                    <div className="flex bg-slate-800/50 rounded-lg p-0.5 border border-white/5 mr-1">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onPaymentModeChange(booking.id, 'cash'); }}
                                                            className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition-all ${booking.payment_mode === 'cash' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                                                            title="Set Cash"
                                                        >
                                                            Cash
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onPaymentModeChange(booking.id, 'upi'); }}
                                                            className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition-all ${isDigitalPaymentMode(booking.payment_mode) ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                                                            title="Set UPI/Digital"
                                                        >
                                                            UPI
                                                        </button>
                                                    </div>
                                                )}

                                                {onEdit && (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="text-slate-400 hover:text-white"
                                                        onClick={(e) => { e.stopPropagation(); onEdit(booking); }}
                                                    >
                                                        Edit
                                                    </Button>
                                                )}
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Mobile View */}
            <div className="md:hidden">
                {loading ? (
                    <div className="p-8 text-center text-slate-500">Loading bookings...</div>
                ) : paginatedBookings.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">No bookings found</div>
                ) : (
                    <div className="divide-y divide-white/5 border-t border-white/5">
                        {paginatedBookings.map((booking) => (
                            <div key={booking.id} className="p-4 space-y-3">
                                {/* Header */}
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="font-medium text-white">
                                            {booking.customer_name || booking.user_name || "Guest"}
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            {booking.customer_phone || booking.user_email || "-"}
                                        </div>
                                    </div>
                                    <StatusBadge status={booking.status || 'pending'} />
                                </div>

                                {/* Info Row */}
                                <div className="flex justify-between items-center py-2 text-sm text-slate-300 bg-white/5 rounded-lg px-3">
                                    <div className="text-xs">
                                        {booking.booking_items?.map((item: any, idx: number) => (
                                            <span key={idx} className="block">
                                                {item.quantity}x {item.console}
                                            </span>
                                        )) || "No items"}
                                    </div>
                                    <div className="font-semibold text-emerald-400">
                                        ₹{booking.total_amount}
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="flex justify-between items-center text-xs text-slate-500">
                                    <div>
                                        {formatDate(booking.booking_date)} • {formatTime(booking.start_time)}
                                    </div>
                                    <div className="capitalize">
                                        {booking.source?.replace('_', ' ') || 'Online'}
                                    </div>
                                </div>

                                {/* Actions */}
                                {showActions && (
                                    <div className="flex justify-end gap-2 pt-2 border-t border-white/5 mt-2">

                                        {onStatusChange && (booking.status === 'confirmed' || booking.status === 'in-progress') && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="text-blue-500 bg-blue-500/10 hover:bg-blue-500/20 w-full justify-center"
                                                onClick={(e) => { e.stopPropagation(); onStatusChange(booking.id, 'completed'); }}
                                            >
                                                <CheckCircle size={16} className="mr-1" /> Complete
                                            </Button>
                                        )}

                                        {onViewOrders && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 px-3"
                                                onClick={(e) => { e.stopPropagation(); onViewOrders(booking.id, booking.customer_name || booking.user_name || 'Guest'); }}
                                                title="View F&B Orders"
                                            >
                                                <ShoppingBag size={16} />
                                            </Button>
                                        )}

                                        {onPaymentModeChange && (
                                            <div className="flex bg-slate-800/50 rounded-lg p-0.5 border border-white/5 flex-1">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onPaymentModeChange(booking.id, 'cash'); }}
                                                    className={`flex-1 py-1.5 rounded text-[10px] font-bold uppercase transition-all ${booking.payment_mode === 'cash' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400'}`}
                                                >
                                                    Cash
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onPaymentModeChange(booking.id, 'upi'); }}
                                                    className={`flex-1 py-1.5 rounded text-[10px] font-bold uppercase transition-all ${isDigitalPaymentMode(booking.payment_mode) ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400'}`}
                                                >
                                                    UPI
                                                </button>
                                            </div>
                                        )}

                                        {onEdit && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="text-slate-400 hover:text-white border border-slate-700 w-full justify-center"
                                                onClick={(e) => { e.stopPropagation(); onEdit(booking); }}
                                            >
                                                Edit
                                            </Button>
                                        )}

                                        {onStatusChange && ['confirmed', 'in-progress'].includes(booking.status) && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="text-red-500 hover:text-red-400 bg-red-500/5 hover:bg-red-500/10 px-3"
                                                onClick={(e) => { e.stopPropagation(); onStatusChange(booking.id, 'cancelled'); }}
                                                title="Cancel"
                                            >
                                                <X size={16} />
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {!limit && totalPages > 1 && (
                <div className="p-4 border-t border-white/5 flex items-center justify-between">
                    <div className="text-sm text-slate-500">
                        Page {currentPage} of {totalPages}
                    </div>
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            variant="secondary"
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(prev => prev - 1)}
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <Button
                            size="sm"
                            variant="secondary"
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage(prev => prev + 1)}
                        >
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            )}

            {limit && onViewAll && (
                <div className="p-4 border-t border-white/5">
                    <Button
                        variant="ghost"
                        className="w-full justify-center text-blue-400 hover:text-blue-300"
                        onClick={onViewAll}
                    >
                        View All Bookings →
                    </Button>
                </div>
            )}
        </Card>
    );
}
