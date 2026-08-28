'use client';

import { useCallback, useEffect, useState } from 'react';
import { History, Lock, Unlock, RefreshCw, AlertCircle } from 'lucide-react';

type UnlockLogEntry = {
    id: string;
    station_name: string;
    action: 'unlock' | 'lock';
    booking_id: string | null;
    trigger_source: string;
    staff_id: string | null;
    staff_name: string | null;
    booking_amount: number | null;
    payment_mode: string | null;
    booking_status: string | null;
    duration_seconds: number | null;
    created_at: string;
};

interface UnlockHistoryProps {
    cafeId?: string;
}

/**
 * Read-only list of every unlock and lock sent to a station.
 *
 * The amounts shown are copies taken at the moment of unlock, not live values —
 * so a row still reads correctly after the booking behind it was edited or
 * deleted. That is the point of the log: spotting unlocks that no longer have a
 * payment to match.
 */
export function UnlockHistory({ cafeId }: UnlockHistoryProps) {
    const [entries, setEntries] = useState<UnlockLogEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!cafeId) return;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch(`/api/owner/stations/log?cafeId=${encodeURIComponent(cafeId)}`, {
                credentials: 'include',
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) throw new Error(data.error || 'Failed to load unlock history');

            setEntries(Array.isArray(data.entries) ? data.entries : []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load unlock history');
        } finally {
            setLoading(false);
        }
    }, [cafeId]);

    useEffect(() => {
        load();
    }, [load]);

    const formatTime = (iso: string) => {
        const date = new Date(iso);
        return date.toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
        });
    };

    return (
        <section className=" border border-[#f2f0ea]/10 bg-[#111113] p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center bg-[#d8ff3c]/15">
                        <History size={15} className="text-[#d8ff3c]" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-[#f2f0ea]">Unlock history</h3>
                        <p className="text-[11px] text-[#f2f0ea]/40">
                            Every time a station was started or stopped, and by whom
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={load}
                    disabled={loading}
                    className="flex items-center gap-1.5 border border-[#f2f0ea]/10 px-2.5 py-1.5 text-[11px] font-semibold text-[#f2f0ea]/70 transition-colors hover:text-[#f2f0ea] disabled:opacity-40"
                >
                    <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            {error && (
                <div className="flex items-start gap-2 border border-[#ff5c2b]/25 bg-[#ff5c2b]/[0.06] p-3 text-[12px] text-[#ff5c2b]">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {!error && entries.length === 0 && !loading && (
                <p className="py-6 text-center text-[12px] text-[#f2f0ea]/40">
                    No unlocks recorded yet.
                </p>
            )}

            {entries.length > 0 && (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-[12px]">
                        <thead>
                            <tr className="text-[10px] uppercase tracking-wide text-[#f2f0ea]/40">
                                <th className="pb-2 pr-3 font-semibold">When</th>
                                <th className="pb-2 pr-3 font-semibold">Station</th>
                                <th className="pb-2 pr-3 font-semibold">Action</th>
                                <th className="pb-2 pr-3 font-semibold">By</th>
                                <th className="pb-2 pr-3 font-semibold">Amount</th>
                                <th className="pb-2 pr-3 font-semibold">Paid by</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map((entry) => (
                                <tr key={entry.id} className="border-t border-white/[0.05]">
                                    <td className="py-2 pr-3 text-[#f2f0ea]/50 whitespace-nowrap">
                                        {formatTime(entry.created_at)}
                                    </td>
                                    <td className="py-2 pr-3 font-semibold text-[#f2f0ea] uppercase">
                                        {entry.station_name}
                                    </td>
                                    <td className="py-2 pr-3">
                                        <span
                                            className={`inline-flex items-center gap-1  px-1.5 py-0.5 text-[10px] font-bold ${
                                                entry.action === 'unlock'
                                                    ? 'bg-[#d8ff3c]/12 text-[#d8ff3c]'
                                                    : 'bg-[#f2f0ea]/[0.07] text-[#f2f0ea]/50'
                                            }`}
                                        >
                                            {entry.action === 'unlock' ? <Unlock size={9} /> : <Lock size={9} />}
                                            {entry.action === 'unlock' ? 'Unlocked' : 'Locked'}
                                        </span>
                                    </td>
                                    <td className="py-2 pr-3 text-[#f2f0ea]/50">
                                        {entry.staff_name || (entry.staff_id ? entry.staff_id.slice(0, 8) : '—')}
                                    </td>
                                    <td className="py-2 pr-3 text-[#f2f0ea]/70">
                                        {entry.action === 'unlock' && entry.booking_amount != null
                                            ? `₹${Number(entry.booking_amount).toLocaleString('en-IN')}`
                                            : '—'}
                                    </td>
                                    <td className="py-2 pr-3 uppercase text-[#f2f0ea]/50">
                                        {entry.action === 'unlock' ? entry.payment_mode || '—' : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
