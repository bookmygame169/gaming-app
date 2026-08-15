'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, Check, Clock, Loader2, Lock, Wallet } from 'lucide-react';

type PlayOption = { durationMinutes: number; price: number };

type PlayInfo = {
    station: string;
    cafeName: string;
    online: boolean;
    alreadyUnlocked: boolean;
    walletBalance: number;
    planHours: number;
    options: PlayOption[];
};

/**
 * What a customer sees after scanning the code on a locked PC.
 *
 * Written for someone standing up, holding a phone, wanting to sit down. The
 * whole screen is which machine, what it costs, and one tap — anything else
 * belongs on a page they visit deliberately rather than one they arrive at by
 * pointing a camera at a monitor.
 */
export default function PlayPage() {
    const params = useParams<{ token: string }>();
    const router = useRouter();
    const token = params?.token;

    const [info, setInfo] = useState<PlayInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [starting, setStarting] = useState<number | null>(null);
    const [done, setDone] = useState<{ minutes: number; station: string } | null>(null);

    const load = useCallback(async () => {
        if (!token) return;

        try {
            const res = await fetch(`/api/play/${encodeURIComponent(token)}`, {
                credentials: 'include',
            });

            if (res.status === 401) {
                // Sent back here afterwards, because arriving at a sign-in page
                // with no way back to the machine you are standing at is where
                // most people would give up and find staff.
                router.replace(`/login?redirect=${encodeURIComponent(`/play/${token}`)}`);
                return;
            }

            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Could not read that code');

            setInfo(data as PlayInfo);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not read that code');
        } finally {
            setLoading(false);
        }
    }, [token, router]);

    useEffect(() => {
        load();
    }, [load]);

    const start = async (option: PlayOption) => {
        if (!token || starting !== null) return;

        setStarting(option.durationMinutes);
        setError(null);

        try {
            const res = await fetch(`/api/play/${encodeURIComponent(token)}`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ durationMinutes: option.durationMinutes }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Could not start the session');

            setDone({ minutes: option.durationMinutes, station: data.station });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not start the session');
        } finally {
            setStarting(null);
        }
    };

    if (loading) {
        return (
            <Shell>
                <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <p className="text-sm">Reading the code…</p>
                </div>
            </Shell>
        );
    }

    if (done) {
        return (
            <Shell>
                <div className="flex flex-col items-center gap-4 py-12 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
                        <Check className="h-8 w-8 text-emerald-400" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">
                        {done.station.toUpperCase()} is unlocked
                    </h1>
                    <p className="text-sm text-slate-400">
                        {done.minutes} minutes, starting now. Pick a game on the screen.
                    </p>
                </div>
            </Shell>
        );
    }

    if (!info) {
        return (
            <Shell>
                <Problem message={error || 'Could not read that code'} />
                <p className="mt-4 text-center text-xs text-slate-500">
                    Codes last a couple of minutes. Scan the screen again.
                </p>
            </Shell>
        );
    }

    const canPlay = info.online && !info.alreadyUnlocked;

    return (
        <Shell>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-400">
                {info.cafeName}
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-wide text-white">
                {info.station.toUpperCase()}
            </h1>

            {/* What they have to spend, before what it costs. Someone who cannot
                afford any of it should find that out without reading a price
                list first. */}
            <div className="mt-4 flex flex-wrap gap-2">
                {info.planHours > 0 && (
                    <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300">
                        <Clock size={13} />
                        {info.planHours}h on your plan
                    </span>
                )}
                <span className="flex items-center gap-1.5 rounded-full border border-white/[0.10] bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-slate-300">
                    <Wallet size={13} />
                    ₹{info.walletBalance} in wallet
                </span>
            </div>

            {error && <div className="mt-4"><Problem message={error} /></div>}

            {!info.online && (
                <div className="mt-4">
                    <Problem message="That PC is not responding. Please ask at the counter." />
                </div>
            )}

            {info.online && info.alreadyUnlocked && (
                <div className="mt-4">
                    <Problem message="That PC is already unlocked and in use." />
                </div>
            )}

            {canPlay && (
                <>
                    <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        How long do you want to play?
                    </p>

                    <div className="mt-3 space-y-2.5">
                        {info.options.map((option) => {
                            // Mirrors what the server charges, so the number on
                            // the button is the number that leaves the wallet.
                            // Plan hours are spent first and can cover a session
                            // only partly - half an hour of plan against an hour
                            // of play is half price, and showing the full price
                            // there would put people off a session they can
                            // mostly already afford.
                            const hoursWanted = option.durationMinutes / 60;
                            const fromPlan = Math.min(info.planHours, hoursWanted);
                            const cash = Math.round(option.price * ((hoursWanted - fromPlan) / hoursWanted));
                            const coveredByPlan = cash === 0;
                            const partlyCovered = !coveredByPlan && fromPlan > 0;
                            const affordable = cash <= info.walletBalance;
                            const busy = starting === option.durationMinutes;

                            return (
                                <button
                                    key={option.durationMinutes}
                                    type="button"
                                    onClick={() => start(option)}
                                    disabled={starting !== null || !affordable}
                                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/[0.10] bg-white/[0.03] px-5 py-4 text-left transition-colors hover:bg-white/[0.06] disabled:opacity-50"
                                >
                                    <span>
                                        <span className="block text-lg font-bold text-white">
                                            {option.durationMinutes} minutes
                                        </span>
                                        {partlyCovered && (
                                            <span className="mt-0.5 block text-[11px] text-emerald-400">
                                                {fromPlan}h from your plan, rest from wallet
                                            </span>
                                        )}
                                        {!affordable && (
                                            <span className="mt-0.5 block text-[11px] text-amber-400">
                                                ₹{cash - info.walletBalance} short — top up at the counter
                                            </span>
                                        )}
                                    </span>
                                    <span className="flex shrink-0 items-center gap-2">
                                        {coveredByPlan ? (
                                            <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-300">
                                                On your plan
                                            </span>
                                        ) : (
                                            <span className="text-lg font-bold text-slate-200">₹{cash}</span>
                                        )}
                                        {busy && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    <p className="mt-5 text-center text-[11px] text-slate-500">
                        Paid from your plan first, then your wallet. Nothing is charged
                        if the PC does not unlock.
                    </p>
                </>
            )}
        </Shell>
    );
}

function Shell({ children }: { children: React.ReactNode }) {
    return (
        <main className="min-h-screen bg-[#0a0a0f] px-5 py-10">
            <div className="mx-auto w-full max-w-md">
                <div className="mb-6 flex items-center gap-2 text-slate-500">
                    <Lock size={14} />
                    <span className="text-xs font-semibold uppercase tracking-wide">Start a session</span>
                </div>
                {children}
            </div>
        </main>
    );
}

function Problem({ message }: { message: string }) {
    return (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-sm text-amber-300">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{message}</span>
        </div>
    );
}
