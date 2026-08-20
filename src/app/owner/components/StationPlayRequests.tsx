'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MonitorPlay, Check, X, Clock, Phone, IndianRupee, AlertTriangle } from 'lucide-react';

type PlayRequest = {
    id: string;
    stationName: string;
    customerName: string;
    customerPhone: string;
    requestType: 'hourly' | 'membership' | 'day_pass';
    durationMinutes: number | null;
    amount: number;
    paymentMethod: 'online' | 'counter';
    createdAt: string;
    planName: string | null;
    planHours: number | null;
};

type Props = {
    cafeId: string;
    onApproved?: () => void;
};

/**
 * How often the queue refreshes.
 *
 * Faster than the dashboard summary's twenty seconds, because this is the
 * screen an owner sits on once they know somebody is waiting, and a request
 * that has already been answered on another device should stop being offered.
 */
const POLL_MS = 8000;

const TYPE_LABEL: Record<PlayRequest['requestType'], string> = {
    hourly: 'By the hour',
    membership: 'Membership',
    day_pass: 'Day pass',
};

function waitedFor(iso: string): string {
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (seconds < 60) return `${seconds}s`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function whatTheyAskedFor(request: PlayRequest): string {
    if (request.requestType === 'hourly') {
        const minutes = request.durationMinutes || 0;
        return minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? '' : 's'}` : `${minutes} minutes`;
    }

    return request.planName || TYPE_LABEL[request.requestType];
}

/**
 * The queue of customers sitting at a locked PC asking to be let on.
 *
 * Nothing here is a payment and nothing here has unlocked anything. Each row is
 * a person who typed their name into a lock screen; approving is what creates
 * the booking, starts their clock and opens the machine — which is why the row
 * shows what they will be charged and how they say they are paying, rather than
 * just their name and a tick.
 */
export function StationPlayRequests({ cafeId, onApproved }: Props) {
    const [requests, setRequests] = useState<PlayRequest[]>([]);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [migrationMissing, setMigrationMissing] = useState(false);

    // So the "waited 3 min" labels move on their own rather than only when the
    // list happens to reload.
    const [, forceTick] = useState(0);

    const inFlight = useRef(false);

    const load = useCallback(async () => {
        if (!cafeId || inFlight.current) return;
        inFlight.current = true;

        try {
            const res = await fetch(`/api/owner/play-requests?cafeId=${encodeURIComponent(cafeId)}`, {
                credentials: 'include',
            });
            const data = await res.json().catch(() => ({}));

            if (res.ok) {
                setRequests(data.requests || []);
                setMigrationMissing(Boolean(data.migrationMissing));
            }
        } catch {
            // Leaves the last known queue on screen. An owner acting on a stale
            // list is told so by the server when they tap.
        } finally {
            inFlight.current = false;
        }
    }, [cafeId]);

    useEffect(() => {
        if (!cafeId) return;

        void load();
        const timer = setInterval(load, POLL_MS);
        return () => clearInterval(timer);
    }, [cafeId, load]);

    useEffect(() => {
        const timer = setInterval(() => forceTick((n) => n + 1), 15000);
        return () => clearInterval(timer);
    }, []);

    const answer = async (request: PlayRequest, action: 'approve' | 'decline') => {
        if (action === 'decline') {
            const sure = window.confirm(
                `Turn down ${request.customerName} at ${request.stationName.toUpperCase()}?\n\n` +
                    'Their screen will say the request was not approved.'
            );
            if (!sure) return;
        }

        setBusyId(request.id);
        setError(null);

        try {
            const res = await fetch('/api/owner/play-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ cafeId, requestId: request.id, action }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                setError(data.error || 'Could not answer that request.');
                await load();
                return;
            }

            // Taken off the list immediately. Approving takes a moment to reach
            // the PC, and a row that stays put reads as a tap that did nothing.
            setRequests((current) => current.filter((row) => row.id !== request.id));

            if (action === 'approve') onApproved?.();
        } catch {
            setError('Could not reach the server. Try again.');
        } finally {
            setBusyId(null);
        }
    };

    // A café with nobody waiting sees nothing at all. A permanent empty panel
    // above the station grid would be in the way every hour of every day for
    // the sake of the few minutes a month it has something in it.
    if (!migrationMissing && requests.length === 0) return null;

    if (migrationMissing) {
        return (
            <div className="flex items-start gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-400" />
                <p className="text-[11px] leading-relaxed text-amber-300/90">
                    Customers cannot pay from a locked PC yet — run migration{' '}
                    <span className="font-mono">20260820000000_station_play_requests.sql</span> in Supabase.
                </p>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-rose-500/25 bg-rose-500/[0.05] p-5">
            <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/15">
                    <MonitorPlay size={15} className="text-rose-400" />
                </div>
                <div>
                    <h3 className="text-sm font-bold text-slate-100">
                        {requests.length} waiting at a PC
                    </h3>
                    <p className="text-[11px] text-slate-500">
                        Approving unlocks the machine and starts their time from now.
                    </p>
                </div>
            </div>

            {error && (
                <p className="mt-3 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-[11px] font-semibold text-rose-300">
                    {error}
                </p>
            )}

            <div className="mt-4 space-y-2.5">
                {requests.map((request) => (
                    <div
                        key={request.id}
                        className="rounded-xl border border-white/[0.08] bg-[#0d0d14] p-4"
                    >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-md bg-rose-500/15 px-2 py-0.5 font-mono text-[11px] font-bold uppercase text-rose-300">
                                        {request.stationName}
                                    </span>
                                    <span className="text-sm font-bold text-slate-100">
                                        {request.customerName}
                                    </span>
                                </div>

                                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
                                    <span className="inline-flex items-center gap-1">
                                        <Phone size={11} className="text-slate-500" />
                                        {request.customerPhone}
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                        <IndianRupee size={11} className="text-slate-500" />
                                        {request.amount.toLocaleString('en-IN')}
                                        <span className="text-slate-600">
                                            · {request.paymentMethod === 'online' ? 'paying online' : 'paying at counter'}
                                        </span>
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                        <Clock size={11} className="text-slate-500" />
                                        waited {waitedFor(request.createdAt)}
                                    </span>
                                </div>

                                <p className="mt-1.5 text-[11px] font-semibold text-slate-300">
                                    {TYPE_LABEL[request.requestType]} — {whatTheyAskedFor(request)}
                                    {request.requestType !== 'hourly' && (
                                        <span className="font-normal text-slate-500">
                                            {' '}· plays until they end the session
                                        </span>
                                    )}
                                </p>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => answer(request, 'decline')}
                                    disabled={busyId === request.id}
                                    className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.06] px-3 py-2 text-xs font-bold text-slate-400 transition-colors hover:bg-white/[0.09] disabled:opacity-40"
                                >
                                    <X size={13} />
                                    Turn down
                                </button>
                                <button
                                    type="button"
                                    onClick={() => answer(request, 'approve')}
                                    disabled={busyId === request.id}
                                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/15 px-4 py-2 text-xs font-bold text-emerald-300 transition-colors hover:bg-emerald-500/25 disabled:opacity-40"
                                >
                                    <Check size={13} />
                                    {busyId === request.id ? 'Unlocking…' : 'Approve & unlock'}
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
