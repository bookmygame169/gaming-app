'use client';

import { CalendarX, ArrowRight, Pencil } from 'lucide-react';
import { CONSOLE_COLORS } from '@/lib/constants';

interface DashboardBookingsTableProps {
    bookings: any[];
    onViewAll?: () => void;
    onEdit?: (booking: any) => void;
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

export function DashboardBookingsTable({ bookings, onViewAll, onEdit }: DashboardBookingsTableProps) {
    const displayed = bookings
        .filter(b => !b.deleted_at && b.status !== 'cancelled')
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
        .slice(0, 10);

    return (
        <div className="glass rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="flex flex-col gap-3 px-5 py-4 border-b border-white/[0.05] sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(6,182,212,0.12)', color: '#06b6d4' }}>
                        <CalendarX size={14} />
                    </div>
                    <h2 className="text-sm text-slate-300" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.12em', fontWeight: 600 }}>Today's Bookings</h2>
                    <span className="mono text-[11px] text-slate-500">({bookings.filter(b => !b.deleted_at && b.status !== 'cancelled').length})</span>
                </div>
                {onViewAll && (
                    <button onClick={onViewAll} className="text-[11px] flex items-center gap-1 transition-colors hover:opacity-80" style={{ color: '#06b6d4' }}>
                        View all <ArrowRight size={11} />
                    </button>
                )}
            </div>

            {/* Table */}
            <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left" style={{ color: '#5b6170' }}>
                            <th className="px-5 py-2.5 font-normal text-[10px]" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.12em' }}>Customer</th>
                            <th className="px-3 py-2.5 font-normal text-[10px]" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.12em' }}>Station</th>
                            <th className="px-3 py-2.5 font-normal text-[10px]" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.12em' }}>Start</th>
                            <th className="px-3 py-2.5 font-normal text-[10px] text-right" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.12em' }}>Amount</th>
                            <th className="px-3 py-2.5 font-normal text-[10px]" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.12em' }}>Pay</th>
                            <th className="px-3 py-2.5 font-normal text-[10px]" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.12em' }}>Status</th>
                            {onEdit && <th className="px-5 py-2.5 font-normal text-[10px]" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.12em' }}></th>}
                        </tr>
                    </thead>
                    <tbody>
                        {displayed.length === 0 ? (
                            <tr>
                                <td colSpan={onEdit ? 7 : 6} className="px-5 py-14 text-center">
                                    <p className="text-sm text-slate-500">No bookings today</p>
                                </td>
                            </tr>
                        ) : displayed.map((b, i) => {
                            const isWalkIn = b.source === 'walk-in';
                            const name = isWalkIn ? b.customer_name : (b.user_name || 'Guest');
                            const phone = isWalkIn ? b.customer_phone : b.user_phone;
                            const items = b.booking_items || [];
                            const consoleKey = items[0]?.console?.toLowerCase() || '';
                            const consoleColor = (CONSOLE_COLORS as any)[consoleKey] || '#6b7280';
                            const consoleIcon = CONSOLE_ICON[consoleKey] || '🎮';
                            const stationLabel = items.map((it: any) => {
                                const titleParts = it.title?.split('|');
                                const station = titleParts && titleParts.length > 1 ? titleParts[1].trim().toUpperCase() : `${it.console?.toUpperCase()}-?`;
                                return station;
                            }).join(', ') || '—';
                            const duration = items[0]?.title ? parseInt(items[0].title) || b.duration : b.duration;
                            const isDigital = ['online','upi','paytm','gpay','phonepe','card'].includes((b.payment_mode || '').toLowerCase());
                            const status = STATUS_MAP[b.status] || STATUS_MAP['confirmed'];

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
                                        <span className="mono text-[13px] font-semibold text-white">₹{(b.total_amount || 0).toLocaleString('en-IN')}</span>
                                    </td>

                                    {/* Pay mode */}
                                    <td className="px-3 py-3">
                                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase"
                                            style={isDigital
                                                ? { background: 'rgba(6,182,212,0.12)', color: '#67e8f9' }
                                                : { background: 'rgba(16,185,129,0.12)', color: '#6ee7b7' }
                                            }>
                                            {isDigital ? 'UPI' : 'Cash'}
                                        </span>
                                    </td>

                                    {/* Status */}
                                    <td className="px-3 py-3">
                                        <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md"
                                            style={{ background: status.bg, color: status.fg }}>
                                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: status.dot }} />
                                            {status.label}
                                        </span>
                                    </td>

                                    {/* Edit */}
                                    {onEdit && (
                                        <td className="px-5 py-3">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onEdit(b); }}
                                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors hover:bg-white/[0.06]"
                                                style={{ color: '#94a3b8' }}
                                                title="Edit booking"
                                            >
                                                <Pencil size={11} />
                                                Edit
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="divide-y divide-white/[0.05] md:hidden">
                {displayed.length === 0 ? (
                    <div className="px-5 py-14 text-center">
                        <p className="text-sm text-slate-500">No bookings today</p>
                    </div>
                ) : displayed.map((b) => {
                    const isWalkIn = b.source === 'walk-in';
                    const name = isWalkIn ? b.customer_name : (b.user_name || 'Guest');
                    const phone = isWalkIn ? b.customer_phone : b.user_phone;
                    const items = b.booking_items || [];
                    const consoleKey = items[0]?.console?.toLowerCase() || '';
                    const consoleColor = (CONSOLE_COLORS as any)[consoleKey] || '#6b7280';
                    const consoleIcon = CONSOLE_ICON[consoleKey] || 'ðŸŽ®';
                    const stationLabel = items.map((it: any) => {
                        const titleParts = it.title?.split('|');
                        return titleParts && titleParts.length > 1 ? titleParts[1].trim().toUpperCase() : `${it.console?.toUpperCase()}-?`;
                    }).join(', ') || 'â€”';
                    const duration = items[0]?.title ? parseInt(items[0].title) || b.duration : b.duration;
                    const isDigital = ['online', 'upi', 'paytm', 'gpay', 'phonepe', 'card'].includes((b.payment_mode || '').toLowerCase());
                    const status = STATUS_MAP[b.status] || STATUS_MAP.confirmed;

                    return (
                        <div key={b.id} className="space-y-3 px-5 py-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-white">{name || 'â€”'}</p>
                                    {phone && <p className="mono mt-1 text-[11px] text-slate-500">+91 {phone.replace(/^\+?91/, '')}</p>}
                                </div>
                                <span
                                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px]"
                                    style={{ background: status.bg, color: status.fg }}
                                >
                                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: status.dot }} />
                                    {status.label}
                                </span>
                            </div>

                            <div className="rounded-xl border border-white/[0.05] bg-white/[0.03] p-3">
                                <div className="flex items-center gap-2">
                                    <span
                                        className="flex h-8 w-8 items-center justify-center rounded-lg text-sm"
                                        style={{ background: `${consoleColor}22`, color: consoleColor }}
                                    >
                                        {consoleIcon}
                                    </span>
                                    <div className="min-w-0">
                                        <p className="mono truncate text-[12px] font-semibold text-white">{stationLabel}</p>
                                        <p className="mt-1 text-[11px] text-slate-500">{b.start_time || 'â€”'} · {duration}m</p>
                                    </div>
                                </div>
                                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                    <span
                                        className="inline-flex rounded-md px-2 py-1 font-semibold uppercase"
                                        style={isDigital
                                            ? { background: 'rgba(6,182,212,0.12)', color: '#67e8f9' }
                                            : { background: 'rgba(16,185,129,0.12)', color: '#6ee7b7' }}
                                    >
                                        {isDigital ? 'UPI' : 'Cash'}
                                    </span>
                                    <span className="mono text-sm font-semibold text-white">â‚¹{(b.total_amount || 0).toLocaleString('en-IN')}</span>
                                </div>
                            </div>

                            {onEdit && (
                                <div className="flex justify-end">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onEdit(b); }}
                                        className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors hover:bg-white/[0.06]"
                                        style={{ color: '#94a3b8' }}
                                        title="Edit booking"
                                    >
                                        <Pencil size={11} />
                                        Edit
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
