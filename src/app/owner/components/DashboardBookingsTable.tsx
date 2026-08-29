'use client';

import { Pencil, CheckCircle } from 'lucide-react';
import { CONSOLE_COLORS, type ConsoleId } from '@/lib/constants';
import { getBookingGamingTotal, getBookingRevenueTotal, getBookingSnackTotal } from '@/lib/ownerRevenue';
import { buildBookingTicketMessage, buildWhatsAppUrl, buildAdvanceBookingPaymentMessage, formatDurationLabel, getLocalDateString } from '../utils';
import type { BookingRow } from '../types';

interface DashboardBookingsTableProps {
    bookings: BookingRow[];
    onViewAll?: () => void;
    /** The design's feed labels above the table: which one is lit, and the counts. */
    feeds?: { id: string; label: string; count: number }[];
    activeFeed?: string;
    onFeedChange?: (feed: string) => void;
    onEdit?: (booking: BookingRow) => void;
    onPaymentModeChange?: (bookingId: string, mode: string) => void | Promise<boolean>;
    onStatusChange?: (bookingId: string, status: string) => void | Promise<void>;
}

const STATUS_MAP: Record<string, { bg: string; fg: string; dot: string; label: string }> = {
    'in-progress': { bg: 'rgba(216,255,60,0.12)',  fg: '#d8ff3c', dot: '#d8ff3c', label: 'IN PROGRESS' },
    'completed':   { bg: 'rgba(242,240,234,0.07)', fg: 'rgba(242,240,234,.6)', dot: 'rgba(242,240,234,.4)', label: 'DONE' },
    'confirmed':   { bg: 'rgba(216,255,60,0.10)',  fg: '#d8ff3c', dot: '#d8ff3c', label: 'CONFIRMED' },
    'pending':     { bg: 'rgba(255,92,43,0.12)',   fg: '#ff5c2b', dot: '#ff5c2b', label: 'UNPAID' },
    'cancelled':   { bg: 'rgba(242,240,234,0.05)', fg: 'rgba(242,240,234,.35)', dot: 'rgba(242,240,234,.3)', label: 'CANCELLED' },
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
}

/** The design's six columns, shared by the head row and every row under it. */
const ACTIVITY_COLUMNS = '1.05fr 1.2fr .9fr .62fr .7fr 150px';

/** "2× ps5 · 1× racing_sim", the way the design writes a booking's contents. */
function describeItems(booking: BookingRow): string {
    const items = booking.booking_items || [];
    if (items.length > 0) {
        const counts = new Map<string, number>();
        for (const item of items) {
            const key = (item.console || 'station').toLowerCase();
            counts.set(key, (counts.get(key) || 0) + 1);
        }
        return Array.from(counts.entries())
            .map(([label, count]) => `${count}× ${label}`)
            .join(' · ');
    }
    const orders = booking.booking_orders || [];
    if (orders.length > 0) {
        const units = orders.reduce((sum, order) => sum + (order.quantity || 1), 0);
        return `${units} item${units === 1 ? '' : 's'}`;
    }
    return '—';
}

/** "Walk-in · 1h" — where the booking came from, and how long it runs. */
function describeSource(booking: BookingRow): string {
    const source = booking.source === 'walk-in' ? 'Walk-in'
        : booking.source === 'membership' ? 'Membership'
        : booking.source === 'advance' ? 'Advance'
        : 'Booked';
    const items = booking.booking_items || [];
    if (items.length === 0 && (booking.booking_orders || []).length > 0) return source;
    const duration = items[0]?.title ? parseInt(items[0].title) || booking.duration : booking.duration;
    return duration ? `${source} · ${formatDurationLabel(duration)}` : source;
}

/** Today's rows say "today" rather than repeating the date on every line. */
function describeDate(booking: BookingRow): string {
    if (!booking.booking_date) return '—';
    if (booking.booking_date === getLocalDateString()) return 'today';
    return new Date(booking.booking_date).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
    });
}

export function DashboardBookingsTable({ bookings, onViewAll, feeds, activeFeed, onFeedChange, onEdit, onPaymentModeChange, onStatusChange }: DashboardBookingsTableProps) {
    const displayed = bookings
        .filter(b => !b.deleted_at && b.status !== 'cancelled')
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
        .slice(0, 10);

    // The second column and the footer read differently per feed, as the
    // design's {{ colB }} and {{ footNote }} do.
    const onSnackFeed = activeFeed === 'snacks';
    const columnB = onSnackFeed ? 'ITEMS' : 'STATION';
    const totalForFeed = bookings.filter(b => !b.deleted_at && b.status !== 'cancelled').length;
    const feedLabel = (feeds?.find(f => f.id === activeFeed)?.label || 'ROWS').toLowerCase();
    const footNote = totalForFeed === 0
        ? `No ${feedLabel} today`
        : `Showing ${displayed.length} of ${totalForFeed} ${feedLabel} today`;
    const emptyMessage = onSnackFeed
        ? 'No snack sales recorded today.'
        : 'Nothing on this feed today.';

    const exportCsv = () => {
        const header = ['Customer', 'Phone', columnB === 'ITEMS' ? 'Items' : 'Station', 'Source', 'Start', 'Date', 'Amount', 'Payment', 'Status'];
        const rows = displayed.map((b) => {
            const isWalkIn = b.source === 'walk-in';
            return [
                (isWalkIn ? b.customer_name : b.user_name) || 'Guest',
                (isWalkIn ? b.customer_phone : b.user_phone) || '',
                describeItems(b),
                describeSource(b),
                b.start_time || '',
                b.booking_date || '',
                String(getBookingRevenueTotal(b)),
                isDigitalPaymentMode(b.payment_mode) ? 'UPI' : 'Cash',
                (b.status || 'confirmed').toUpperCase(),
            ];
        });
        const escape = (cell: string) => `"${cell.replace(/"/g, '""')}"`;
        const csv = [header, ...rows].map(cols => cols.map(escape).join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${activeFeed || 'activity'}-${getLocalDateString()}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <>
        {feeds && feeds.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-3">
                {feeds.map((feed) => {
                    const on = feed.id === activeFeed;
                    return (
                        <button
                            key={feed.id}
                            type="button"
                            onClick={() => onFeedChange?.(feed.id)}
                            className="flex items-center gap-2 border px-3 py-[7px] font-mono text-[10.5px] tracking-[0.14em] transition-colors"
                            style={
                                on
                                    ? { borderColor: '#d8ff3c', background: 'rgba(216,255,60,.10)', color: '#d8ff3c' }
                                    : { borderColor: 'rgba(242,240,234,.14)', color: 'rgba(242,240,234,.5)' }
                            }
                        >
                            {feed.label}
                            <span className="opacity-50">{feed.count}</span>
                        </button>
                    );
                })}
                <span className="h-px flex-1 bg-[#f2f0ea]/10" />
                <button
                    type="button"
                    onClick={exportCsv}
                    className="font-mono text-[10.5px] tracking-[0.14em] text-[#f2f0ea]/50 transition-colors hover:text-[#d8ff3c]"
                >
                    EXPORT CSV →
                </button>
            </div>
        )}

        <div className="overflow-hidden border border-[#f2f0ea]/10 bg-[#111113]">
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-white/[0.05]">
                {displayed.length === 0 ? (
                    <div className="px-5 py-12 text-center">
                        <p className="text-sm text-[#f2f0ea]/40">No bookings today</p>
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
                    const statusKey = (b.status || 'confirmed').toLowerCase();
                    const status = STATUS_MAP[statusKey] || STATUS_MAP.confirmed;
                    const whatsappUrl = getWhatsAppUrl(b);
                    const snackTotal = getBookingSnackTotal(b);
                    const sessionAmount = getBookingGamingTotal(b);

                    return (
                        <div key={b.id} className="space-y-2.5 px-3 py-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="truncate text-[15px] font-semibold text-[#f2f0ea]">{name || '—'}</p>
                                    {phone && <p className="mono mt-0.5 text-[10px] text-[#f2f0ea]/40">+91 {phone.replace(/^\+?91/, '')}</p>}
                                </div>
                                <span className="inline-flex items-center gap-1.5 px-2 py-1 font-mono text-[9.5px] tracking-[0.12em]"
                                    style={{ background: status.bg, color: status.fg }}>
                                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: status.dot }} />
                                    {status.label}
                                </span>
                            </div>

                            <div className="flex items-center justify-between gap-3 border border-[#f2f0ea]/[0.07] bg-[#111113] px-3 py-2.5">
                                <div className="min-w-0 flex-1">
                                    <div className="text-[9px] uppercase tracking-[0.12em] text-[#f2f0ea]/40">Station</div>
                                    <div className="mt-1 flex items-center gap-2">
                                        <span className="flex h-5 w-5 items-center justify-center text-[10px]"
                                            style={{ background: `${consoleColor}22`, color: consoleColor }}>
                                            {consoleIcon}
                                        </span>
                                        <span className="mono truncate text-[11px] font-semibold text-[#f2f0ea]">{stationLabel}</span>
                                    </div>
                                    {duration && <p className="mono mt-0.5 text-[10px] text-[#f2f0ea]/40">{formatDurationLabel(duration)}</p>}
                                </div>
                                <div className="shrink-0 text-right">
                                    <div className="text-[9px] uppercase tracking-[0.12em] text-[#f2f0ea]/40">Session</div>
                                    <div className="mono mt-1 text-[14px] font-semibold text-[#f2f0ea]">₹{sessionAmount.toLocaleString('en-IN')}</div>
                                    {snackTotal > 0 && (
                                        <p className="mt-0.5 text-[10px] font-medium text-[#ff5c2b]">+₹{snackTotal.toLocaleString('en-IN')} snacks</p>
                                    )}
                                    <p className="mt-0.5 text-[10px] text-[#f2f0ea]/40">{b.start_time || '—'}</p>
                                </div>
                            </div>

                            {(onEdit || onPaymentModeChange || onStatusChange || whatsappUrl) && (
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {onStatusChange && statusKey === 'pending' && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onStatusChange(b.id, 'confirmed'); }}
                                            className="inline-flex items-center gap-1 bg-[#d8ff3c]/10 px-2.5 py-1.5 text-[10px] font-semibold text-[#d8ff3c] transition-colors hover:bg-[#d8ff3c]/20"
                                        >
                                            <CheckCircle size={11} />
                                            Confirm
                                        </button>
                                    )}
                                    {onPaymentModeChange && !(b.source === 'advance' && statusKey === 'pending') && (
                                        <div className="flex items-center border border-[#f2f0ea]/[0.14] p-0.5">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onPaymentModeChange(b.id, 'cash'); }}
                                                className={`px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors ${!isDigital ? 'bg-[#d8ff3c] text-[#0b0b0c]' : 'text-[#0b0b0c] hover:text-[#0b0b0c]'}`}
                                            >
                                                Cash
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onPaymentModeChange(b.id, 'upi'); }}
                                                className={`px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors ${isDigital ? 'bg-[#d8ff3c] text-[#0b0b0c]' : 'text-[#0b0b0c] hover:text-[#0b0b0c]'}`}
                                            >
                                                UPI
                                            </button>
                                        </div>
                                    )}
                                    {onEdit && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onEdit(b); }}
                                            className="inline-flex items-center gap-1 border border-white/[0.07] bg-[#f2f0ea]/[0.04] px-2.5 py-1.5 text-[10px] font-semibold text-[#f2f0ea]/70 transition-colors hover:bg-[#f2f0ea]/[0.06] hover:text-[#f2f0ea]"
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
                                            className="inline-flex h-8 w-8 items-center justify-center bg-[#25D366]/15 text-[#25D366] transition-colors hover:bg-[#25D366]/25"
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
            {/* ── the design's activity table: six columns, no chrome ── */}
            <div className="hidden md:block">
                <div
                    className="grid gap-3.5 border-b border-[#f2f0ea]/10 px-[18px] py-[11px] font-mono text-[9.5px] tracking-[0.18em] text-[#f2f0ea]/[0.38]"
                    style={{ gridTemplateColumns: ACTIVITY_COLUMNS }}
                >
                    <span>CUSTOMER</span>
                    <span>{columnB}</span>
                    <span>WHEN</span>
                    <span className="text-right">AMOUNT</span>
                    <span className="text-right">STATUS</span>
                    <span className="text-right">ACTIONS</span>
                </div>

                {displayed.map((b) => {
                    const isWalkIn = b.source === 'walk-in';
                    const name = isWalkIn ? b.customer_name : (b.user_name || 'Guest');
                    const phone = isWalkIn ? b.customer_phone : b.user_phone;
                    const statusKey = (b.status || 'confirmed').toLowerCase();
                    const status = STATUS_MAP[statusKey] || STATUS_MAP.confirmed;
                    const whatsappUrl = getWhatsAppUrl(b);
                    const isDigital = isDigitalPaymentMode(b.payment_mode);
                    const amount = getBookingRevenueTotal(b);
                    const canSwitchPayment =
                        !!onPaymentModeChange && !(b.source === 'advance' && statusKey === 'pending');

                    return (
                        <div
                            key={b.id}
                            className="grid items-center gap-3.5 border-b border-[#f2f0ea]/[0.05] px-[18px] py-3 transition-colors hover:bg-[#17171a]"
                            style={{ gridTemplateColumns: ACTIVITY_COLUMNS }}
                        >
                            <div className="flex min-w-0 flex-col gap-[3px]">
                                <span className="truncate text-[13.5px] font-bold tracking-[-0.005em] text-[#f2f0ea]">
                                    {name || '—'}
                                </span>
                                {phone && (
                                    <span className="truncate font-mono text-[10.5px] text-[#f2f0ea]/[0.38]">
                                        {phone}
                                    </span>
                                )}
                            </div>

                            <div className="flex min-w-0 flex-col gap-[3px]">
                                <span className="truncate font-mono text-[12px] text-[#f2f0ea]/[0.86]">
                                    {describeItems(b)}
                                </span>
                                <span className="truncate font-mono text-[10.5px] text-[#f2f0ea]/[0.38]">
                                    {describeSource(b)}
                                </span>
                            </div>

                            <div className="flex min-w-0 flex-col gap-[3px]">
                                <span className="truncate font-mono text-[12px] text-[#f2f0ea]/[0.86]">
                                    {b.start_time || '—'}
                                </span>
                                <span className="truncate font-mono text-[10.5px] text-[#f2f0ea]/[0.38]">
                                    {describeDate(b)}
                                </span>
                            </div>

                            {/* The payment mode doubles as the control that changes it,
                                so the row keeps the design's shape and still switches
                                cash to UPI in one click. */}
                            <div className="flex flex-col items-end gap-[3px]">
                                <span className="text-[13.5px] font-extrabold text-[#f2f0ea]">
                                    ₹{amount.toLocaleString('en-IN')}
                                </span>
                                {canSwitchPayment ? (
                                    <button
                                        type="button"
                                        title="Switch between cash and UPI"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onPaymentModeChange?.(b.id, isDigital ? 'cash' : 'upi');
                                        }}
                                        className="font-mono text-[10.5px] text-[#f2f0ea]/[0.38] transition-colors hover:text-[#d8ff3c]"
                                    >
                                        {isDigital ? 'UPI' : 'Cash'}
                                    </button>
                                ) : (
                                    <span className="font-mono text-[10.5px] text-[#f2f0ea]/[0.38]">
                                        {isDigital ? 'UPI' : 'Cash'}
                                    </span>
                                )}
                            </div>

                            <div className="flex justify-end">
                                <span
                                    className="whitespace-nowrap px-[9px] py-[5px] font-mono text-[9.5px] tracking-[0.14em]"
                                    style={{ background: status.bg, color: status.fg }}
                                >
                                    {status.label}
                                </span>
                            </div>

                            <div className="flex justify-end gap-1.5">
                                {onEdit && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onEdit(b); }}
                                        title="Edit booking"
                                        className="border border-[#f2f0ea]/[0.16] px-2.5 py-1.5 font-mono text-[10px] tracking-[0.12em] text-[#f2f0ea]/75 transition-colors hover:border-[#d8ff3c] hover:text-[#d8ff3c]"
                                    >
                                        ✎ EDIT
                                    </button>
                                )}
                                {onStatusChange && statusKey === 'pending' ? (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onStatusChange(b.id, 'confirmed'); }}
                                        title="Mark this booking paid"
                                        className="border border-[#f2f0ea]/[0.16] px-2.5 py-1.5 font-mono text-[10px] tracking-[0.12em] text-[#f2f0ea]/50 transition-colors hover:border-[#d8ff3c] hover:text-[#d8ff3c]"
                                    >
                                        ✓ PAID
                                    </button>
                                ) : whatsappUrl ? (
                                    <a
                                        href={whatsappUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        title="Send ticket on WhatsApp"
                                        className="border border-[#f2f0ea]/[0.16] px-2.5 py-1.5 font-mono text-[10px] tracking-[0.12em] text-[#f2f0ea]/50 transition-colors hover:border-[#f2f0ea]/40 hover:text-[#f2f0ea]"
                                    >
                                        ↗ TICKET
                                    </a>
                                ) : null}
                            </div>
                        </div>
                    );
                })}

                {displayed.length === 0 && (
                    <div className="flex items-center gap-3.5 px-[18px] py-5">
                        <span className="font-mono text-[11.5px] text-[#f2f0ea]/45">{emptyMessage}</span>
                        <span className="flex-1" />
                    </div>
                )}
            </div>

            {/* ── the design's footer strip ── */}
            <div className="flex items-center gap-3.5 border-t border-[#f2f0ea]/10 px-[18px] py-3 font-mono text-[10.5px] text-[#f2f0ea]/40">
                <span className="truncate">{footNote}</span>
                <span className="flex-1" />
                {onViewAll && (
                    <button
                        onClick={onViewAll}
                        className="whitespace-nowrap transition-colors hover:text-[#d8ff3c]"
                    >
                        VIEW ALL →
                    </button>
                )}
            </div>
        </div>
        </>
    );
}
