'use client';

import { CalendarX, ArrowRight } from 'lucide-react';
import { CONSOLE_COLORS } from '@/lib/constants';

interface DashboardBookingsTableProps {
    bookings: any[];
    onViewAll?: () => void;
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

export function DashboardBookingsTable({ bookings, onViewAll }: DashboardBookingsTableProps) {
    const displayed = bookings
        .filter(b => !b.deleted_at && b.status !== 'cancelled')
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
        .slice(0, 10);

    return (
        <div className="glass rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.05]">
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(6,182,212,0.12)', color: '#06b6d4' }}>
                        <CalendarX size={14} />
                    </div>
                    <h2 className="text-[11px] font-semibold text-slate-300 uppercase tracking-widest">Today's Bookings</h2>
                    <span className="mono text-[11px] text-slate-500">({bookings.filter(b => !b.deleted_at && b.status !== 'cancelled').length})</span>
                </div>
                {onViewAll && (
                    <button onClick={onViewAll} className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors font-medium">
                        View all <ArrowRight size={11} />
                    </button>
                )}
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest border-b border-white/[0.04]" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.12em' }}>
                            <th className="px-5 py-2.5 font-normal text-left">Customer</th>
                            <th className="px-3 py-2.5 font-normal text-left">Station</th>
                            <th className="px-3 py-2.5 font-normal text-left">Start</th>
                            <th className="px-3 py-2.5 font-normal text-right">Amount</th>
                            <th className="px-3 py-2.5 font-normal text-left">Pay</th>
                            <th className="px-5 py-2.5 font-normal text-left">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayed.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-5 py-14 text-center">
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
                                    <td className="px-5 py-3">
                                        <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md"
                                            style={{ background: status.bg, color: status.fg }}>
                                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: status.dot }} />
                                            {status.label}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
