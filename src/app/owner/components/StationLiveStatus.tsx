'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertCircle, ArrowUpCircle, FlaskConical, Lock, RefreshCw, Unlock, WifiOff } from 'lucide-react';

type StationStatus = {
    station_name: string;
    status: string;
    session_id: string | null;
    last_seen_at: string;
    seconds_since_seen: number;
    online: boolean;
    agent_version?: string | null;
    update_available?: boolean;
};

interface StationLiveStatusProps {
    cafeId?: string;
}

const REFRESH_MS = 20000;
const MANUAL_UNLOCK_MINUTES = 60;

/**
 * A deliberately short unlock, for checking the machine rather than selling it.
 *
 * Twelve minutes because the time warnings fire at ten, five and two minutes
 * left: the first lands two minutes in and all three are done inside ten, so
 * the whole sequence can be watched over a coffee instead of an hour.
 */
const TEST_UNLOCK_MINUTES = 12;

/**
 * Shows what each station last reported about itself, with direct lock/unlock
 * buttons that do not require a booking.
 */
export function StationLiveStatus({ cafeId }: StationLiveStatusProps) {
    const [stations, setStations] = useState<StationStatus[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [commanding, setCommanding] = useState<string | null>(null);
    const [latestVersion, setLatestVersion] = useState<string | null>(null);
    const [updating, setUpdating] = useState<string | null>(null);
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
            setLatestVersion(typeof data.latestAgentVersion === 'string' ? data.latestAgentVersion : null);
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

    /**
     * Restarts one PC so it picks up the new version.
     *
     * A restart rather than an install, because the updater on every machine
     * refuses to replace an agent that is running - rightly, since that would
     * take the lock off a PC somebody may be sitting at. Restarting is what
     * gives it a moment when nothing is running: the update goes in before
     * anyone logs in, and the lock comes back up on top of it.
     */
    const updateStation = async (stationName: string) => {
        if (!cafeId) return;

        const sure = window.confirm(
            `Restart ${stationName.toUpperCase()} to install the update?\n\n` +
                'It will be off for about a minute and come back locked.\n' +
                'Nobody should be playing on it.'
        );
        if (!sure) return;

        setUpdating(stationName);
        setCommandError(null);

        try {
            const res = await fetch('/api/owner/stations/update', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cafeId, stationName }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || `Could not update ${stationName}`);
            }

            // Offline immediately, because it is about to be. A row still
            // showing "online" while the machine reboots invites a second press.
            setStations((prev) =>
                prev.map((row) =>
                    row.station_name === stationName ? { ...row, online: false } : row
                )
            );
        } catch (err) {
            setCommandError(err instanceof Error ? err.message : 'Could not send the update');
        } finally {
            setUpdating(null);
        }
    };

    const sendCommand = async (
        stationName: string,
        action: 'unlock' | 'lock',
        minutes: number = MANUAL_UNLOCK_MINUTES
    ) => {
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
                    durationMinutes: minutes,
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
        // "just now" rather than "3s ago": at a glance the number reads as
        // something to act on, when it only means the heartbeat is current.
        if (seconds < 15) return 'just now';
        if (seconds < 60) return `${seconds}s ago`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        return `${Math.floor(seconds / 3600)}h ago`;
    };

    const isPcStation = (name: string) => name.toLowerCase().startsWith('pc-');

    /**
     * Everything the look of a card depends on, decided once.
     *
     * The state was previously a line of grey text - the least visible thing on
     * a card whose entire purpose is to convey it. Someone glancing at a wall of
     * these should be able to pick out the one that needs attention without
     * reading any of them.
     */
    const describeState = (station: StationStatus) => {
        if (!station.online) {
            return {
                label: 'Offline',
                note: 'Not reporting in',
                bar: 'bg-[#ff5c2b]',
                pill: 'border-red-500/30 bg-[#ff5c2b]/10 text-red-300',
                dot: 'bg-[#ff5c2b]',
                card: 'border-red-500/20 bg-[#ff5c2b]/[0.04]',
            };
        }

        if (station.status === 'unlocked') {
            return {
                label: 'Unlocked',
                note: 'A customer can use this PC',
                bar: 'bg-emerald-400',
                pill: 'border-emerald-500/30 bg-[#d8ff3c]/10 text-emerald-300',
                dot: 'bg-emerald-400',
                card: 'border-emerald-500/20 bg-[#d8ff3c]/[0.03]',
            };
        }

        return {
            label: 'Locked',
            note: 'Waiting for payment',
            bar: 'bg-slate-500',
            pill: 'border-white/[0.10] bg-[#f2f0ea]/[0.04] text-[#f2f0ea]/70',
            dot: 'bg-emerald-400',
            card: 'border-[#f2f0ea]/10 bg-[#111113]',
        };
    };

    const online = stations.filter((s) => s.online);
    const unlocked = online.filter((s) => s.status === 'unlocked');
    const offline = stations.filter((s) => !s.online);
    const behind = stations.filter((s) => s.update_available);

    return (
        <section className=" border border-[#f2f0ea]/10 bg-[#111113] p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center bg-[#d8ff3c]/15">
                        <Activity size={15} className="text-[#d8ff3c]" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-[#f2f0ea]">Live machine status</h3>
                        <p className="text-[11px] text-[#f2f0ea]/40">
                            Lock or unlock any PC here — no booking needed ({MANUAL_UNLOCK_MINUTES}m unlock, or {TEST_UNLOCK_MINUTES}m to test warnings)
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

            {behind.length > 0 && (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border border-cyan-500/25 bg-[#d8ff3c]/[0.06] px-3.5 py-3">
                    <div className="flex items-start gap-2.5">
                        <ArrowUpCircle size={15} className="mt-0.5 shrink-0 text-[#d8ff3c]" />
                        <div>
                            <p className="text-[12px] font-bold text-cyan-100">
                                Update available{latestVersion ? ` — v${latestVersion}` : ''}
                            </p>
                            <p className="mt-0.5 text-[11px] text-[#f2f0ea]/50">
                                {behind.length === 1
                                    ? `${behind[0].station_name.toUpperCase()} is on an older version.`
                                    : `${behind.length} PCs are on an older version.`}{' '}
                                {/* Said here rather than only in the confirm box: an
                                    owner deciding whether to press anything wants to
                                    know the cost before they press it. */}
                                Each one restarts to install it, and comes back locked.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {error && (
                <div className="mb-3 flex items-start gap-2 border border-amber-500/25 bg-amber-500/[0.06] p-3 text-[12px] text-amber-300">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {commandError && (
                <div className="mb-3 flex items-start gap-2 border border-red-500/25 bg-[#ff5c2b]/[0.06] p-3 text-[12px] text-red-300">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <span>{commandError}</span>
                </div>
            )}

            {!error && stations.length === 0 && !loading && (
                <p className="py-6 text-center text-[12px] text-[#f2f0ea]/40">
                    No machine has reported in yet. Stations appear here once the lock agent is
                    running and configured to send heartbeats.
                </p>
            )}

            {stations.length > 0 && (
                <>
                    {/* A one-line answer to "is everything alright?", so the
                        grid below only has to be read when it is not. */}
                    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                        <span className="font-semibold text-[#f2f0ea]/70">
                            {online.length} of {stations.length} online
                        </span>
                        {unlocked.length > 0 && (
                            <span className="flex items-center gap-1.5 text-[#d8ff3c]">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                {unlocked.length} unlocked
                            </span>
                        )}
                        {offline.length > 0 && (
                            <span className="flex items-center gap-1.5 text-[#ff5c2b]">
                                <WifiOff size={11} />
                                {offline.length} not reporting
                            </span>
                        )}
                    </div>

                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                        {stations.map((station) => {
                            const isUnlocked = station.status === 'unlocked';
                            const showControls = isPcStation(station.station_name);
                            const lockBusy = commanding === `${station.station_name}:lock`;
                            const unlockBusy = commanding === `${station.station_name}:unlock`;
                            const busy = lockBusy || unlockBusy;
                            const state = describeState(station);

                            return (
                                <div
                                    key={station.station_name}
                                    className={`relative overflow-hidden  border pl-4 pr-3 py-3 transition-colors ${state.card}`}
                                >
                                    {/* Colour down the edge: the grid becomes
                                        scannable without reading any of it. */}
                                    <span className={`absolute inset-y-0 left-0 w-1 ${state.bar}`} />

                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="truncate text-[15px] font-bold uppercase tracking-wide text-slate-100">
                                                {station.station_name}
                                            </p>
                                            <p className="mt-0.5 text-[10px] text-[#f2f0ea]/40">
                                                Seen {describeLastSeen(station.seconds_since_seen)}
                                                {station.agent_version ? ` · v${station.agent_version}` : ''}
                                            </p>

                                            {/* Offered only where it can be
                                                taken up: a machine somebody is
                                                playing on must not be restarted,
                                                and one that is off will update
                                                by itself when it next starts. */}
                                            {station.update_available && station.online && !isUnlocked && (
                                                <button
                                                    type="button"
                                                    disabled={updating === station.station_name}
                                                    onClick={() => updateStation(station.station_name)}
                                                    className="mt-1.5 inline-flex items-center gap-1 bg-[#d8ff3c]/15 px-2 py-1 text-[10px] font-bold text-cyan-300 transition-colors hover:bg-[#d8ff3c]/25 disabled:opacity-40"
                                                    title={`Restart to install v${latestVersion ?? 'the update'}`}
                                                >
                                                    <ArrowUpCircle size={10} />
                                                    {updating === station.station_name
                                                        ? 'Restarting…'
                                                        : `Update to v${latestVersion ?? ''}`}
                                                </button>
                                            )}

                                            {station.update_available && station.online && isUnlocked && (
                                                <p className="mt-1.5 text-[10px] text-[#f2f0ea]/40">
                                                    Update waiting — in use right now
                                                </p>
                                            )}
                                        </div>

                                        <span
                                            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${state.pill}`}
                                        >
                                            <span className="relative flex h-1.5 w-1.5">
                                                {station.online && (
                                                    <span
                                                        className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${state.dot}`}
                                                    />
                                                )}
                                                <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${state.dot}`} />
                                            </span>
                                            {state.label}
                                        </span>
                                    </div>

                                    <p className="mt-1.5 text-[11px] text-[#f2f0ea]/40">{state.note}</p>

                                    {showControls && (
                                        <div className="mt-3 flex gap-2">
                                            {/* The action that changes something
                                                is filled; the other is quiet.
                                                Two buttons of equal weight make
                                                the reader work out which one
                                                they want.
                                                An offline machine has no useful
                                                action, so neither is filled -
                                                a bright disabled button reads as
                                                the thing to press. */}
                                            <button
                                                type="button"
                                                disabled={!station.online || busy}
                                                onClick={() => sendCommand(station.station_name, 'unlock')}
                                                className={`flex flex-1 items-center justify-center gap-1.5  px-2 py-2 text-[11px] font-bold transition-colors disabled:opacity-40 ${
                                                    !station.online || isUnlocked
                                                        ? 'border border-[#f2f0ea]/10 text-[#f2f0ea]/50 hover:bg-white/[0.05]'
                                                        : 'bg-[#d8ff3c] text-emerald-950 hover:bg-emerald-400'
                                                }`}
                                            >
                                                <Unlock size={12} />
                                                {unlockBusy ? 'Unlocking…' : 'Unlock'}
                                            </button>
                                            {/* Short on purpose, and labelled so nobody
                                                sells it by mistake. The warnings fire at
                                                ten, five and two minutes left, so twelve
                                                shows all three inside ten minutes. */}
                                            <button
                                                type="button"
                                                disabled={!station.online || busy}
                                                onClick={() =>
                                                    sendCommand(station.station_name, 'unlock', TEST_UNLOCK_MINUTES)
                                                }
                                                title={`Unlock for ${TEST_UNLOCK_MINUTES} minutes to check the time warnings`}
                                                className="flex items-center justify-center gap-1.5 border border-amber-500/30 px-2 py-2 text-[11px] font-bold text-amber-300/90 transition-colors hover:bg-amber-500/10 disabled:opacity-40"
                                            >
                                                <FlaskConical size={12} />
                                                {TEST_UNLOCK_MINUTES}m
                                            </button>
                                            <button
                                                type="button"
                                                disabled={!station.online || busy}
                                                onClick={() => sendCommand(station.station_name, 'lock')}
                                                className={`flex flex-1 items-center justify-center gap-1.5  px-2 py-2 text-[11px] font-bold transition-colors disabled:opacity-40 ${
                                                    isUnlocked && station.online
                                                        ? 'bg-slate-200 text-slate-900 hover:bg-white'
                                                        : 'border border-[#f2f0ea]/10 text-[#f2f0ea]/50 hover:bg-white/[0.05]'
                                                }`}
                                            >
                                                <Lock size={12} />
                                                {lockBusy ? 'Locking…' : 'Lock'}
                                            </button>
                                        </div>
                                    )}

                                    {!station.online && (
                                        <p className="mt-3 bg-black/20 px-2 py-1.5 text-[10px] text-red-300/80">
                                            Check the PC is on and the lock app is running.
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

        </section>
    );
}
