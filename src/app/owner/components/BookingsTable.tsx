/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState } from 'react';
import { Card, StatusBadge, Button } from './ui';
import { Search, ChevronLeft, ChevronRight, X, CheckCircle, ShoppingBag, CalendarX } from 'lucide-react';
import { getBookingRevenueTotal } from '@/lib/ownerRevenue';
import { buildWhatsAppUrl, buildBookingTicketMessage, buildAdvanceBookingPaymentMessage, formatDurationLabel } from '../utils';

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
        if (booking.deleted_at) return false;

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

    const getCustomerContact = (booking: any) =>
        booking.customer_phone || booking.user_phone || booking.user_email || "-";

    const hasBookingItems = (booking: any) => Array.isArray(booking.booking_items) && booking.booking_items.length > 0;

    const isDigitalPaymentMode = (mode: string | null | undefined) => {
        const normalized = mode?.toLowerCase() || '';
        return ['online', 'upi', 'paytm', 'gpay', 'phonepe', 'card'].includes(normalized);
    };

    const WhatsAppIcon = () => (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
    );

    const getWhatsAppUrl = (booking: any) => {
        const phone = booking.customer_phone || booking.user_phone;
        if (!phone) return null;
        const itemsLabel = booking.booking_items?.map((it: any) => `${it.quantity}x ${it.console?.toUpperCase()}`).join(', ') || 'Gaming Session';
        const isAdvancePending = booking.source === 'advance' && (booking.status || '').toLowerCase() === 'pending';
        const paymentLink = typeof window === 'undefined'
            ? `/bookings/${booking.id}`
            : `${window.location.origin}/bookings/${booking.id}`;
        const message = isAdvancePending ? buildAdvanceBookingPaymentMessage({
            customerName: booking.customer_name || booking.user_name || 'Customer',
            cafeName: booking.cafe_name || null,
            date: booking.booking_date
                ? new Date(booking.booking_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                : '',
            startTime: booking.start_time || '',
            duration: booking.duration || 60,
            itemsLabel,
            totalAmount: getBookingRevenueTotal(booking),
            paymentLink,
        }) : buildBookingTicketMessage({
            customerName: booking.customer_name || booking.user_name || 'Customer',
            cafeName: booking.cafe_name || null,
            date: booking.booking_date
                ? new Date(booking.booking_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                : '',
            startTime: booking.start_time || '',
            duration: booking.duration || 60,
            itemsLabel,
            totalAmount: getBookingRevenueTotal(booking),
            paymentMode: booking.payment_mode || 'cash',
        });
        return buildWhatsAppUrl(phone, message);
    };

    return (
        <Card className="w-full overflow-hidden" padding="none">
            {(title || showFilters) && (
            <div className="p-4 md:p-6 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                {title && (
                <h2 className="text-lg font-semibold text-[#f2f0ea] flex items-center gap-2">
                    {title}
                </h2>
                )}

                {showFilters && (
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#f2f0ea]/50" />
                            <input
                                type="text"
                                placeholder="Search bookings..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 pr-4 py-2 bg-[#f2f0ea]/[0.04] border border-[#f2f0ea]/10 text-sm text-[#f2f0ea] placeholder-[#f2f0ea]/30 focus:outline-none focus:border-[#d8ff3c]/60 focus:ring-1 focus:ring-[#d8ff3c]/30 w-full sm:w-64"
                            />
                        </div>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-4 py-2 bg-[#f2f0ea]/[0.06] border border-[#f2f0ea]/10 text-sm text-[#f2f0ea] focus:outline-none focus:border-[#d8ff3c]"
                        >
                            <option value="all">All Status</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="pending">Pending</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                            <option value="in-progress">In Progress</option>
                        </select>
                    </div>
                )}
            </div>
            )}

            <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm text-left table-fixed">
                    <thead className="border-b border-[#f2f0ea]/10 bg-[#111113] font-mono text-[9px] uppercase tracking-[0.14em] text-[#f2f0ea]/35">
                        <tr>
                            {selectable && (
                                <th className="px-3 py-3 w-8">
                                    <input
                                        type="checkbox"
                                        className="accent-[#d8ff3c] cursor-pointer"
                                        checked={paginatedBookings.length > 0 && paginatedBookings.every(b => selectedIds?.has(b.id))}
                                        onChange={(e) => {
                                            const next = new Set(selectedIds);
                                            paginatedBookings.forEach(b => e.target.checked ? next.add(b.id) : next.delete(b.id));
                                            onSelectionChange!(next);
                                        }}
                                    />
                                </th>
                            )}
                            <th className="px-4 py-2.5 font-normal w-[18%]">Customer</th>
                            <th className="px-4 py-2.5 font-normal w-[18%]">Details</th>
                            <th className="px-4 py-2.5 font-normal w-[18%]">Date & Time</th>
                            <th className="px-4 py-2.5 font-normal w-[12%]">Amount</th>
                            <th className="px-4 py-2.5 font-normal w-[14%]">Status</th>
                            {showActions && <th className="px-4 py-2.5 font-normal text-right w-[20%]">Actions</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f2f0ea]/[0.05]">
                        {loading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <tr key={i} className="animate-pulse">
                                    {selectable && <td className="px-3 py-3"><div className="w-4 h-4 rounded bg-[#f2f0ea]/[0.06]" /></td>}
                                    <td className="px-4 py-2">
                                        <div className="h-3.5 w-28 rounded bg-[#f2f0ea]/[0.06] mb-2" />
                                        <div className="h-2.5 w-20 rounded bg-[#f2f0ea]/[0.04]" />
                                    </td>
                                    <td className="px-4 py-2"><div className="h-3.5 w-20 rounded bg-[#f2f0ea]/[0.06]" /></td>
                                    <td className="px-4 py-2">
                                        <div className="h-3.5 w-20 rounded bg-[#f2f0ea]/[0.06] mb-2" />
                                        <div className="h-2.5 w-14 rounded bg-[#f2f0ea]/[0.04]" />
                                    </td>
                                    <td className="px-4 py-2"><div className="h-3.5 w-14 rounded bg-[#f2f0ea]/[0.06]" /></td>
                                    <td className="px-4 py-2"><div className="h-5 w-20 rounded-full bg-[#f2f0ea]/[0.06]" /></td>
                                    {showActions && <td className="px-4 py-2"><div className="h-7 w-24 rounded bg-[#f2f0ea]/[0.06] ml-auto" /></td>}
                                </tr>
                            ))
                        ) : paginatedBookings.length === 0 ? (
                            <tr>
                                <td colSpan={(showActions ? 6 : 5) + (selectable ? 1 : 0)}>
                                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-[#f2f0ea]/40">
                                        <CalendarX size={36} strokeWidth={1.5} className="text-[#f2f0ea]/[0.14]" />
                                        <p className="text-sm font-medium text-[#f2f0ea]/50">No bookings found</p>
                                        <p className="text-xs text-[#f2f0ea]/30">Try adjusting your filters</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            paginatedBookings.map((booking) => {
                                const normalizedStatus = (booking.status || '').toLowerCase();
                                const rowAccent = normalizedStatus === 'in-progress' ? 'border-l-2 border-l-[#d8ff3c]' : normalizedStatus === 'pending' || normalizedStatus === 'confirmed' ? 'border-l-2 border-l-[#ff5c2b]' : normalizedStatus === 'cancelled' ? 'border-l-2 border-l-[#f2f0ea]/20 opacity-60' : normalizedStatus === 'completed' ? 'border-l-2 border-l-[#f2f0ea]/[0.14]' : '';
                                return (
                                <tr key={booking.id} className={`hover:bg-[#f2f0ea]/5 transition-colors ${rowAccent} ${selectedIds?.has(booking.id) ? 'bg-[#d8ff3c]/5' : ''}`}>
                                    {selectable && (
                                        <td className="px-3 py-1.5">
                                            <input
                                                type="checkbox"
                                                className="accent-[#d8ff3c] cursor-pointer"
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
                                            className={`font-medium text-[#f2f0ea] ${onViewCustomer ? 'cursor-pointer hover:text-[#d8ff3c] hover:underline' : ''}`}
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
                                        <div className="text-xs text-[#f2f0ea]/40 mt-0.5">
                                            {getCustomerContact(booking)}
                                        </div>
                                    </td>
                                    <td className="px-4 py-1.5">
                                        <div className="text-[#f2f0ea]/70">
                                            {booking.source === 'membership'
                                                ? <span className="inline-flex items-center gap-1 text-[#d8ff3c] font-medium">
                                                    ★ {booking.booking_items?.[0]?.console || 'Membership'}
                                                  </span>
                                                : hasBookingItems(booking) ? booking.booking_items.map((item: any, idx: number) => (
                                                    <span key={idx} className="block">
                                                        {item.quantity}x {item.console}
                                                    </span>
                                                )) : <span className="text-[#f2f0ea]/40">No items</span>
                                            }
                                        </div>
                                        <div className="text-xs mt-0.5 capitalize">
                                            {booking.source === 'membership'
                                                ? <span className="text-[#d8ff3c]">Membership</span>
                                                : <span className="text-[#f2f0ea]/40">{booking.source?.replace('_', ' ') || 'Online'}</span>
                                            }
                                        </div>
                                    </td>
                                    <td className="px-4 py-1.5">
                                        <div className="text-[#f2f0ea]">{formatDate(booking.booking_date)}</div>
                                        <div className="text-xs text-[#f2f0ea]/40 mt-0.5">
                                            {formatTime(booking.start_time)} ({formatDurationLabel(booking.duration)})
                                        </div>
                                    </td>
                                    <td className="px-4 py-1.5">
                                        <div className="font-semibold text-[#d8ff3c]">
                                            ₹{getBookingRevenueTotal(booking).toLocaleString('en-IN')}
                                        </div>
                                        <div className="text-xs text-[#f2f0ea]/40 mt-0.5 capitalize">
                                            {booking.payment_mode || 'Unpaid'}
                                        </div>
                                    </td>
                                    <td className="px-4 py-1.5">
                                        <StatusBadge status={booking.status || 'pending'} />
                                    </td>
                                    {showActions && (
                                        <td className="px-4 py-1.5 text-right">
                                            <div className="flex items-center justify-end gap-1">

                                                {onStatusChange && normalizedStatus === 'pending' && (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="text-[#d8ff3c] hover:text-[#d8ff3c] hover:bg-[#d8ff3c]/10"
                                                        onClick={(e) => { e.stopPropagation(); onStatusChange(booking.id, 'confirmed'); }}
                                                        title="Confirm Payment"
                                                    >
                                                        Confirm
                                                    </Button>
                                                )}

                                                {onStatusChange && (normalizedStatus === 'confirmed' || normalizedStatus === 'in-progress') && (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="text-[#d8ff3c] hover:text-[#d8ff3c] hover:bg-[#d8ff3c]/10"
                                                        onClick={(e) => { e.stopPropagation(); onStatusChange(booking.id, 'completed'); }}
                                                        title="Complete Booking"
                                                    >
                                                        <CheckCircle size={18} />
                                                    </Button>
                                                )}

                                                {onStatusChange && ['confirmed', 'in-progress', 'pending'].includes(normalizedStatus) && (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="text-[#ff5c2b] hover:text-[#ff5c2b] hover:bg-[#ff5c2b]/10"
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
                                                        className="text-[#d8ff3c] hover:text-[#d8ff3c] hover:bg-[#d8ff3c]/10"
                                                        onClick={(e) => { e.stopPropagation(); onViewOrders(booking.id, booking.customer_name || booking.user_name || 'Guest'); }}
                                                        title="View F&B Orders"
                                                    >
                                                        <ShoppingBag size={16} />
                                                    </Button>
                                                )}

                                                {onPaymentModeChange && !(booking.source === 'advance' && normalizedStatus === 'pending') && (
                                                    <div className="flex bg-[#f2f0ea]/[0.04] p-0.5 border border-white/5 mr-1">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onPaymentModeChange(booking.id, 'cash'); }}
                                                            className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition-all ${booking.payment_mode === 'cash' ? 'bg-[#d8ff3c] text-[#f2f0ea] shadow-lg shadow-[#d8ff3c]/20' : 'text-[#f2f0ea]/50 hover:text-[#f2f0ea] hover:bg-[#f2f0ea]/5'}`}
                                                            title="Set Cash"
                                                        >
                                                            Cash
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onPaymentModeChange(booking.id, 'upi'); }}
                                                            className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition-all ${isDigitalPaymentMode(booking.payment_mode) ? 'bg-[#d8ff3c] text-[#f2f0ea] shadow-lg shadow-[#d8ff3c]/20' : 'text-[#f2f0ea]/50 hover:text-[#f2f0ea] hover:bg-[#f2f0ea]/5'}`}
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
                                                        className="text-[#f2f0ea]/50 hover:text-[#f2f0ea]"
                                                        onClick={(e) => { e.stopPropagation(); onEdit(booking); }}
                                                    >
                                                        Edit
                                                    </Button>
                                                )}

                                                {(() => { const url = getWhatsAppUrl(booking); return url ? (
                                                    <a
                                                        href={url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        title="Send ticket on WhatsApp"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="inline-flex items-center justify-center w-7 h-7 bg-[#25D366]/15 hover:bg-[#25D366]/30 text-[#25D366] transition-colors"
                                                    >
                                                        <WhatsAppIcon />
                                                    </a>
                                                ) : null; })()}
                                            </div>
                                        </td>
                                    )}
                                </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Mobile View */}
            <div className="md:hidden">
                {loading ? (
                    <div className="divide-y divide-[#f2f0ea]/[0.05] border-t border-white/5 animate-pulse">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="p-3 space-y-2.5">
                                <div className="flex justify-between">
                                    <div>
                                        <div className="h-3.5 w-28 rounded bg-[#f2f0ea]/[0.06] mb-2" />
                                        <div className="h-2.5 w-20 rounded bg-[#f2f0ea]/[0.04]" />
                                    </div>
                                    <div className="h-5 w-20 rounded-full bg-[#f2f0ea]/[0.06]" />
                                </div>
                                <div className="h-10 bg-[#f2f0ea]/[0.04]" />
                                <div className="h-2.5 w-32 rounded bg-[#f2f0ea]/[0.06]/40" />
                            </div>
                        ))}
                    </div>
                ) : paginatedBookings.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-[#f2f0ea]/40">
                        <CalendarX size={36} strokeWidth={1.5} className="text-[#f2f0ea]/[0.14]" />
                        <p className="text-sm font-medium text-[#f2f0ea]/50">No bookings found</p>
                        <p className="text-xs text-[#f2f0ea]/30">Try adjusting your filters</p>
                    </div>
                ) : (
                    <div className="divide-y divide-[#f2f0ea]/[0.05] border-t border-white/5">
                        {paginatedBookings.map((booking) => (
                            <div key={booking.id} className="p-3 space-y-2.5">
                                {/* Header */}
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="text-[15px] font-medium text-[#f2f0ea]">
                                            {booking.customer_name || booking.user_name || "Guest"}
                                        </div>
                                        <div className="text-[11px] text-[#f2f0ea]/40">
                                            {getCustomerContact(booking)}
                                        </div>
                                    </div>
                                    <StatusBadge status={booking.status || 'pending'} />
                                </div>

                                {/* Info Row */}
                                <div className="flex items-center justify-between gap-3 bg-[#f2f0ea]/5 px-2.5 py-2 text-sm text-[#f2f0ea]/70">
                                    <div className="min-w-0 text-[11px]">
                                        {hasBookingItems(booking) ? booking.booking_items.map((item: any, idx: number) => (
                                            <span key={idx} className="block truncate">
                                                {item.quantity}x {item.console}
                                            </span>
                                        )) : "No items"}
                                    </div>
                                    <div className="shrink-0 text-[13px] font-semibold text-[#d8ff3c]">
                                        ₹{getBookingRevenueTotal(booking).toLocaleString('en-IN')}
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="flex items-center justify-between text-[11px] text-[#f2f0ea]/40">
                                    <div className="truncate pr-2">
                                        {formatDate(booking.booking_date)} • {formatTime(booking.start_time)}
                                    </div>
                                    <div className="capitalize">
                                        {booking.source?.replace('_', ' ') || 'Online'}
                                    </div>
                                </div>

                                {/* Actions */}
                                {showActions && (
                                    <div className="mt-1 space-y-1.5 border-t border-[#f2f0ea]/[0.07] pt-2">

                                        {/* Row 1: Cash / UPI toggle */}
                                        {onPaymentModeChange && !(booking.source === 'advance' && (booking.status || '').toLowerCase() === 'pending') && (
                                            <div className="flex border border-[#f2f0ea]/10 bg-[#f2f0ea]/[0.04] p-0.5">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onPaymentModeChange(booking.id, 'cash'); }}
                                                    className={`flex-1  py-1.5 text-[10px] font-bold uppercase transition-all ${booking.payment_mode === 'cash' ? 'bg-[#d8ff3c] text-[#f2f0ea] shadow-sm shadow-[#d8ff3c]/30' : 'text-[#f2f0ea]/50 hover:text-[#f2f0ea]'}`}
                                                >
                                                    Cash
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onPaymentModeChange(booking.id, 'upi'); }}
                                                    className={`flex-1  py-1.5 text-[10px] font-bold uppercase transition-all ${isDigitalPaymentMode(booking.payment_mode) ? 'bg-[#d8ff3c] text-[#f2f0ea] shadow-sm shadow-[#d8ff3c]/30' : 'text-[#f2f0ea]/50 hover:text-[#f2f0ea]'}`}
                                                >
                                                    UPI
                                                </button>
                                            </div>
                                        )}

                                        {/* Row 2: action buttons */}
                                        <div className="flex items-center gap-1.5">

                                            {onStatusChange && (booking.status || '').toLowerCase() === 'pending' && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onStatusChange(booking.id, 'confirmed'); }}
                                                    className="flex-1 flex items-center justify-center gap-1 bg-[#d8ff3c]/10 px-2 py-1.5 text-[10px] font-semibold text-[#d8ff3c] transition-colors hover:bg-[#d8ff3c]/20"
                                                >
                                                    <CheckCircle size={13} /> Confirm
                                                </button>
                                            )}

                                            {onStatusChange && (booking.status === 'confirmed' || booking.status === 'in-progress') && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onStatusChange(booking.id, 'completed'); }}
                                                    className="flex-1 flex items-center justify-center gap-1 bg-[#d8ff3c]/10 px-2 py-1.5 text-[10px] font-semibold text-[#d8ff3c] transition-colors hover:bg-[#d8ff3c]/20"
                                                >
                                                    <CheckCircle size={13} /> Done
                                                </button>
                                            )}

                                            {onEdit && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onEdit(booking); }}
                                                    className="flex-1 flex items-center justify-center gap-1 border border-[#f2f0ea]/10 bg-[#f2f0ea]/[0.04] px-2 py-1.5 text-[10px] font-semibold text-[#f2f0ea]/70 transition-colors hover:bg-[#f2f0ea]/[0.08]"
                                                >
                                                    Edit
                                                </button>
                                            )}

                                            {(() => { const url = getWhatsAppUrl(booking); return url ? (
                                                <a
                                                    href={url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="flex-1 flex items-center justify-center gap-1 bg-[#25D366]/10 px-2 py-1.5 text-[10px] font-semibold text-[#25D366] transition-colors hover:bg-[#25D366]/20"
                                                >
                                                    <WhatsAppIcon /> WA
                                                </a>
                                            ) : null; })()}

                                            {onViewOrders && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onViewOrders(booking.id, booking.customer_name || booking.user_name || 'Guest'); }}
                                                    className="flex h-7 w-7 shrink-0 items-center justify-center bg-[#d8ff3c]/10 text-[#d8ff3c] transition-colors hover:bg-[#d8ff3c]/20"
                                                    title="F&B Orders"
                                                >
                                                    <ShoppingBag size={14} />
                                                </button>
                                            )}

                                            {onStatusChange && ['confirmed', 'in-progress', 'pending'].includes((booking.status || '').toLowerCase()) && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onStatusChange(booking.id, 'cancelled'); }}
                                                    className="flex h-7 w-7 shrink-0 items-center justify-center bg-[#ff5c2b]/10 text-[#ff5c2b] transition-colors hover:bg-[#ff5c2b]/20"
                                                    title="Cancel"
                                                >
                                                    <X size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {!limit && totalPages > 1 && (
                <div className="p-4 border-t border-white/5 flex items-center justify-between">
                    <div className="text-sm text-[#f2f0ea]/40">
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
                        className="w-full justify-center text-[#d8ff3c] hover:text-[#d8ff3c]"
                        onClick={onViewAll}
                    >
                        View All Bookings →
                    </Button>
                </div>
            )}
        </Card>
    );
}
