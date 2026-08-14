'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertCircle, Lock, RefreshCw, Unlock } from 'lucide-react';

type StationStatus = {
    station_name: string;
    status: string;
    session_id: string | null;
    last_seen_at: string;
    seconds_since_seen: number;
    online: boolean;
};

interface StationLiveStatusProps {
    cafeId?: string;
}

const REFRESH_MS = 20000;
const MANUAL_UNLOCK_MINUTES = 60;

/**
 * Shows what each station last reported about itself, with direct lock/unlock
 * buttons that do not require a booking.
 */
export function StationLiveStatus({ cafeId }: StationLiveStatusProps) {
    const [stations, setStations] = useState<StationStatus[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [commanding, setCommanding] = useState<string | null>(null);
    const [commandError, setCommandError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!cafeId) return;

        setLoading(true);
        try {
            const res = await fetch(`/api/owner/stations/status?cafeId=${encodeURIComponent(cafeId)}`, {
                credentials: 'include',
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) throw new Error(data.error || 'Failed to load station status');

            setStations(Array.isArray(data.stations) ? data.stations : []);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load station status');
        } finally {
            setLoading(false);
        }
    }, [cafeId]);

    useEffect(() => {
        load();
        const timer = setInterval(load, REFRESH_MS);
        return () => clearInterval(timer);
    }, [load]);

    const sendCommand = async (stationName: string, action: 'unlock' | 'lock') => {
        if (!cafeId) return;

        setCommanding(`${stationName}:${action}`);
        setCommandError(null);

        try {
            const res = await fetch('/api/owner/stations/control', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cafeId,
                    stationName,
                    action,
                    durationMinutes: MANUAL_UNLOCK_MINUTES,
                }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || `Could not ${action} ${stationName}`);
            }

            // Optimistic UI until the next heartbeat refresh.
            setStations((prev) =>
                prev.map((row) =>
                    row.station_name === stationName
                        ? {
                              ...row,
                              status: action === 'unlock' ? 'unlocked' : 'locked',
                              online: true,
                          }
                        : row
                )
            );

            window.setTimeout(load, 2000);
        } catch (err) {
            setCommandError(err instanceof Error ? err.message : 'Command failed');
        } finally {
            setCommanding(null);
        }
    };

    const describeLastSeen = (seconds: number) => {
        if (seconds < 60) return `${seconds}s ago`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        return `${Math.floor(seconds / 3600)}h ago`;
    };

    const isPcStation = (name: string) => name.toLowerCase().startsWith('pc-');

    return (
        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/15">
                        <Activity size={15} className="text-cyan-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-200">Live machine status</h3>
                        <p className="text-[11px] text-slate-500">
                            Lock or unlock any PC here — no booking needed ({MANUAL_UNLOCK_MINUTES}m unlock)
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={load}
                    disabled={loading}
                    className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 transition-colors hover:text-white disabled:opacity-40"
                >
                    <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            {error && (
                <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-[12px] text-amber-300">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {commandError && (
                <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/[0.06] p-3 text-[12px] text-red-300">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <span>{commandError}</span>
                </div>
            )}

            {!error && stations.length === 0 && !loading && (
                <p className="py-6 text-center text-[12px] text-slate-500">
                    No machine has reported in yet. Stations appear here once the lock agent is
                    running and configured to send heartbeats.
                </p>
            )}

            {stations.length > 0 && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {stations.map((station) => {
                        const isUnlocked = station.status === 'unlocked';
                        const showControls = isPcStation(station.station_name);
                        const lockBusy = commanding === `${station.station_name}:lock`;
                        const unlockBusy = commanding === `${station.station_name}:unlock`;

                        return (
                            <div
                                key={station.station_name}
                                className={`rounded-xl border p-3 ${
                                    station.online
                                        ? 'border-white/[0.08] bg-white/[0.03]'
                                        : 'border-red-500/25 bg-red-500/[0.05]'
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[13px] font-bold uppercase text-slate-200">
                                        {station.station_name}
                                    </span>
                                    <span
                                        className={`h-2 w-2 shrink-0 rounded-full ${
                                            station.online ? 'bg-emerald-400' : 'bg-red-500'
                                        }`}
                                        title={station.online ? 'Reporting in' : 'Not reporting'}
                                    />
                                </div>

                                <p
                                    className={`mt-1.5 text-[11px] font-semibold ${
                                        !station.online
                                            ? 'text-red-400'
                                            : isUnlocked
                                                ? 'text-emerald-400'
                                                : 'text-slate-400'
                                    }`}
                                >
                                    {!station.online ? 'Offline' : isUnlocked ? 'Unlocked' : 'Locked'}
                                </p>

                                <p className="mt-0.5 text-[10px] text-slate-500">
                                    Seen {describeLastSeen(station.seconds_since_seen)}
                                </p>

                                {showControls && (
                                    <div className="mt-2.5 flex gap-1.5">
                                        <button
                                            type="button"
                                            disabled={!station.online || lockBusy || unlockBusy}
                                            onClick={() => sendCommand(station.station_name, 'unlock')}
                                            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-[10px] font-bold text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:opacity-40"
                                        >
                                            <Unlock size={11} />
                                            {unlockBusy ? '…' : 'Unlock'}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={!station.online || lockBusy || unlockBusy}
                                            onClick={() => sendCommand(station.station_name, 'lock')}
                                            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-500/30 bg-white/[0.04] px-2 py-1.5 text-[10px] font-bold text-slate-300 transition-colors hover:bg-white/[0.08] disabled:opacity-40"
                                        >
                                            <Lock size={11} />
                                            {lockBusy ? '…' : 'Lock'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
