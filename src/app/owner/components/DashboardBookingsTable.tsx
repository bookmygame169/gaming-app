'use client';

import { CalendarX, ArrowRight, Pencil } from 'lucide-react';
import { CONSOLE_COLORS, type ConsoleId } from '@/lib/constants';
import { isSessionBooking } from '@/lib/bookingFilters';
import { getBookingGamingTotal, getBookingRevenueTotal, getBookingSnackTotal } from '@/lib/ownerRevenue';
import { buildBookingTicketMessage, buildWhatsAppUrl } from '../utils';
import type { BookingRow } from '../types';

interface DashboardBookingsTableProps {
    bookings: BookingRow[];
    onViewAll?: () => void;
    onEdit?: (booking: BookingRow) => void;
    onPaymentModeChange?: (bookingId: string, mode: string) => void | Promise<boolean>;
}

const STATUS_MAP: Record<string, { bg: string; fg: string; dot: string; label: string }> = {
    'in-progress': { bg: 'rgba(6,182,212,0.12)',  fg: '#67e8f9', dot: '#06b6d4',  label: 'In progress' },
    'completed':   { bg: 'rgba(16,185,129,0.10)', fg: '#6ee7b7', dot: '#10b981',  label: 'Completed' },
    'confirmed':   { bg: 'rgba(245,158,11,0.12)', fg: '#fbbf24', dot: '#f59e0b',  label: 'Confirmed' },
    'cancelled':   { bg: 'rgba(239,68,68,0.10)',  fg: '#fca5a5', dot: '#ef4444',  label: 'Cancelled' },
};

const CONSOLE_ICON: Record<string, string> = {
    ps5: '🎮', ps4: '🎮', xbox: '🎮', pc: '💻',
    pool: '🎱', snooker: '🎱', vr: '🥽', arcade: '🕹️',
    steering: '🏎️', racing_sim: '🏁',
};

function isConsoleId(value: string): value is ConsoleId {
    return value in CONSOLE_COLORS;
}

function isDigitalPaymentMode(mode: string | null | undefined): boolean {
    const normalized = mode?.toLowerCase() || '';
    return ['online', 'upi', 'paytm', 'gpay', 'phonepe', 'card'].includes(normalized);
}

const WhatsAppIcon = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
);

function getWhatsAppUrl(booking: BookingRow): string | null {
    const phone = booking.customer_phone || booking.user_phone;
    if (!phone) return null;

    const itemsLabel = booking.booking_items?.map((item) => `${item.quantity}x ${item.console?.toUpperCase()}`).join(', ') || 'Gaming Session';
    const message = buildBookingTicketMessage({
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
}

export function DashboardBookingsTable({ bookings, onViewAll, onEdit, onPaymentModeChange }: DashboardBookingsTableProps) {
    const displayed = bookings
        .filter(b => !b.deleted_at && b.status !== 'cancelled' && isSessionBooking(b))
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
        .slice(0, 10);

    return (
        <div className="glass rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.05] px-4 py-3 sm:px-5 sm:py-4">
                <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg sm:h-7 sm:w-7" style={{ background: 'rgba(6,182,212,0.12)', color: '#06b6d4' }}>
                        <CalendarX size={13} />
                    </div>
                    <h2 className="text-[13px] text-slate-300 sm:text-sm" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.12em', fontWeight: 600 }}>Today&apos;s Bookings</h2>
                    <span className="mono text-[11px] text-slate-500">({bookings.filter(b => !b.deleted_at && b.status !== 'cancelled' && isSessionBooking(b)).length})</span>
                </div>
                {onViewAll && (
                    <button onClick={onViewAll} className="flex items-center gap-1 text-[11px] transition-colors hover:opacity-80" style={{ color: '#06b6d4' }}>
                        View all <ArrowRight size={11} />
                    </button>
                )}
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-white/[0.05]">
                {displayed.length === 0 ? (
                    <div className="px-5 py-12 text-center">
                        <p className="text-sm text-slate-500">No bookings today</p>
                    </div>
                ) : displayed.map((b) => {
                    const isWalkIn = b.source === 'walk-in';
                    const name = isWalkIn ? b.customer_name : (b.user_name || 'Guest');
                    const phone = isWalkIn ? b.customer_phone : b.user_phone;
                    const items = b.booking_items || [];
                    const consoleKey = items[0]?.console?.toLowerCase() || '';
                    const consoleColor = isConsoleId(consoleKey) ? CONSOLE_COLORS[consoleKey] : '#6b7280';
                    const consoleIcon = CONSOLE_ICON[consoleKey] || '🎮';
                    const stationLabel = items.map((it) => {
                        const titleParts = it.title?.split('|');
                        return titleParts && titleParts.length > 1 ? titleParts[1].trim().toUpperCase() : `${it.console?.toUpperCase()}-?`;
                    }).join(', ') || '—';
                    const duration = items[0]?.title ? parseInt(items[0].title) || b.duration : b.duration;
                    const isDigital = isDigitalPaymentMode(b.payment_mode);
                    const statusKey = b.status || 'confirmed';
                    const status = STATUS_MAP[statusKey] || STATUS_MAP.confirmed;
                    const whatsappUrl = getWhatsAppUrl(b);
                    const snackTotal = getBookingSnackTotal(b);
                    const sessionAmount = getBookingGamingTotal(b);

                    return (
                        <div key={b.id} className="space-y-2.5 px-3 py-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="truncate text-[15px] font-semibold text-white">{name || '—'}</p>
                                    {phone && <p className="mono mt-0.5 text-[10px] text-slate-500">+91 {phone.replace(/^\+?91/, '')}</p>}
                                </div>
                                <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px]"
                                    style={{ background: status.bg, color: status.fg }}>
                                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: status.dot }} />
                                    {status.label}
                                </span>
                            </div>

                            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                                <div className="min-w-0 flex-1">
                                    <div className="text-[9px] uppercase tracking-[0.12em] text-slate-500">Station</div>
                                    <div className="mt-1 flex items-center gap-2">
                                        <span className="flex h-5 w-5 items-center justify-center rounded-md text-[10px]"
                                            style={{ background: `${consoleColor}22`, color: consoleColor }}>
                                            {consoleIcon}
                                        </span>
                                        <span className="mono truncate text-[11px] font-semibold text-white">{stationLabel}</span>
                                    </div>
                                    {duration && <p className="mono mt-0.5 text-[10px] text-slate-500">{duration}m</p>}
                                </div>
                                <div className="shrink-0 text-right">
                                    <div className="text-[9px] uppercase tracking-[0.12em] text-slate-500">Session</div>
                                    <div className="mono mt-1 text-[14px] font-semibold text-white">₹{sessionAmount.toLocaleString('en-IN')}</div>
                                    {snackTotal > 0 && (
                                        <p className="mt-0.5 text-[10px] font-medium text-amber-400">+₹{snackTotal.toLocaleString('en-IN')} snacks</p>
                                    )}
                                    <p className="mt-0.5 text-[10px] text-slate-500">{b.start_time || '—'}</p>
                                </div>
                            </div>

                            {(onEdit || onPaymentModeChange || whatsappUrl) && (
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {onPaymentModeChange && (
                                        <div className="flex items-center rounded-lg border border-white/[0.07] bg-white/[0.04] p-1">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onPaymentModeChange(b.id, 'cash'); }}
                                                className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase transition-all ${!isDigital ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'}`}
                                            >
                                                Cash
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onPaymentModeChange(b.id, 'upi'); }}
                                                className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase transition-all ${isDigital ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20' : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'}`}
                                            >
                                                UPI
                                            </button>
                                        </div>
                                    )}
                                    {onEdit && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onEdit(b); }}
                                            className="inline-flex items-center gap-1 rounded-lg border border-white/[0.07] bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-semibold text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-white"
                                        >
                                            <Pencil size={11} />
                                            Edit
                                        </button>
                                    )}
                                    {whatsappUrl && (
                                        <a
                                            href={whatsappUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#25D366]/15 text-[#25D366] transition-colors hover:bg-[#25D366]/25"
                                            title="Send ticket on WhatsApp"
                                        >
                                            <WhatsAppIcon />
                                        </a>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left" style={{ color: '#5b6170' }}>
                            <th className="px-5 py-2.5 font-normal text-[10px]" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.12em' }}>Customer</th>
                            <th className="px-3 py-2.5 font-normal text-[10px]" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.12em' }}>Station</th>
                            <th className="px-3 py-2.5 font-normal text-[10px]" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.12em' }}>Start</th>
                            <th className="px-3 py-2.5 font-normal text-[10px] text-right" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.12em' }}>Session</th>
                            <th className="px-3 py-2.5 font-normal text-[10px]" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.12em' }}>Status</th>
                            {(onEdit || onPaymentModeChange) && (
                                <th className="px-5 py-2.5 font-normal text-[10px] text-right" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.12em' }}>
                                    Actions
                                </th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {displayed.length === 0 ? (
                            <tr>
                                <td colSpan={(onEdit || onPaymentModeChange) ? 6 : 5} className="px-5 py-14 text-center">
                                    <p className="text-sm text-slate-500">No bookings today</p>
                                </td>
                            </tr>
                        ) : displayed.map((b, i) => {
                            const isWalkIn = b.source === 'walk-in';
                            const name = isWalkIn ? b.customer_name : (b.user_name || 'Guest');
                            const phone = isWalkIn ? b.customer_phone : b.user_phone;
                            const items = b.booking_items || [];
                            const consoleKey = items[0]?.console?.toLowerCase() || '';
                            const consoleColor = isConsoleId(consoleKey) ? CONSOLE_COLORS[consoleKey] : '#6b7280';
                            const consoleIcon = CONSOLE_ICON[consoleKey] || '🎮';
                            const stationLabel = items.map((it) => {
                                const titleParts = it.title?.split('|');
                                const station = titleParts && titleParts.length > 1 ? titleParts[1].trim().toUpperCase() : `${it.console?.toUpperCase()}-?`;
                                return station;
                            }).join(', ') || '—';
                            const duration = items[0]?.title ? parseInt(items[0].title) || b.duration : b.duration;
                            const isDigital = isDigitalPaymentMode(b.payment_mode);
                            const statusKey = b.status || 'confirmed';
                            const status = STATUS_MAP[statusKey] || STATUS_MAP.confirmed;
                            const whatsappUrl = getWhatsAppUrl(b);
                            const snackTotal = getBookingSnackTotal(b);
                            const sessionAmount = getBookingGamingTotal(b);

                            return (
                                <tr key={b.id} className={`border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors ${i === displayed.length - 1 ? '' : ''}`}>
                                    {/* Customer */}
                                    <td className="px-5 py-3">
                                        <p className="text-[13px] font-medium text-white">{name || '—'}</p>
                                        {phone && <p className="mono text-[11px] text-slate-500 mt-0.5">+91 {phone.replace(/^\+?91/, '')}</p>}
                                    </td>

                                    {/* Station */}
                                    <td className="px-3 py-3">
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-5 h-5 rounded flex items-center justify-center text-[11px]"
                                                style={{ background: `${consoleColor}22`, color: consoleColor }}>
                                                {consoleIcon}
                                            </span>
                                            <span className="mono text-[12px] font-semibold text-white">{stationLabel}</span>
                                        </div>
                                        {duration && <p className="mono text-[10px] text-slate-500 mt-0.5 ml-6.5">{duration}m</p>}
                                    </td>

                                    {/* Start time */}
                                    <td className="px-3 py-3 mono text-[12px] text-slate-400">
                                        {b.start_time || '—'}
                                    </td>

                                    {/* Amount */}
                                    <td className="px-3 py-3 text-right">
                                        <span className="mono text-[13px] font-semibold text-white">₹{sessionAmount.toLocaleString('en-IN')}</span>
                                        {snackTotal > 0 && (
                                            <p className="mt-0.5 text-[10px] font-medium text-amber-400">+₹{snackTotal.toLocaleString('en-IN')} snacks</p>
                                        )}
                                    </td>

                                    {/* Status */}
                                    <td className="px-3 py-3">
                                        <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md"
                                            style={{ background: status.bg, color: status.fg }}>
                                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: status.dot }} />
                                            {status.label}
                                        </span>
                                    </td>

                                    {/* Actions */}
                                    {(onEdit || onPaymentModeChange) && (
                                        <td className="px-5 py-3">
                                            <div className="flex items-center justify-end gap-2">
                                                {onPaymentModeChange && (
                                                    <div className="flex items-center rounded-xl border border-white/[0.07] bg-white/[0.04] p-1">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onPaymentModeChange(b.id, 'cash'); }}
                                                            className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase transition-all ${!isDigital ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'}`}
                                                            title="Set cash payment"
                                                        >
                                                            Cash
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onPaymentModeChange(b.id, 'upi'); }}
                                                            className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase transition-all ${isDigital ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20' : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'}`}
                                                            title="Set UPI payment"
                                                        >
                                                            UPI
                                                        </button>
                                                    </div>
                                                )}

                                                {onEdit && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onEdit(b); }}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors hover:bg-white/[0.06]"
                                                        style={{ color: '#94a3b8' }}
                                                        title="Edit booking"
                                                    >
                                                        <Pencil size={11} />
                                                        Edit
                                                    </button>
                                                )}

                                                {whatsappUrl && (
                                                    <a
                                                        href={whatsappUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#25D366]/15 text-[#25D366] transition-colors hover:bg-[#25D366]/25"
                                                        title="Send ticket on WhatsApp"
                                                    >
                                                        <WhatsAppIcon />
                                                    </a>
                                                )}
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
