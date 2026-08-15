'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, Check, Clock, Loader2, Lock, ScanLine, Smartphone, Wallet } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

type PlayOption = { durationMinutes: number; price: number };

type PendingUpi = {
    bookingId: string;
    station: string;
    durationMinutes: number;
    amount: number;
    upi: {
        payeeName: string;
        payeeUpiId: string;
        url: string;
        apps: { label: string; url: string }[];
    };
};

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

    // The UPI half. Once a session is pending the page stops being a price list
    // and becomes one thing: get this payment confirmed.
    const [pending, setPending] = useState<PendingUpi | null>(null);
    const [reference, setReference] = useState('');
    const [claimed, setClaimed] = useState(false);
    const [rejected, setRejected] = useState<string | null>(null);
    const [givenUp, setGivenUp] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    /**
     * The signed-in customer's access token.
     *
     * Sent as a bearer header, not as a cookie. The browser client keeps its
     * session in localStorage, so `credentials: "include"` sends nothing the
     * server can identify anyone by - which is why every scan came back
     * unauthorised and bounced to the login page. It is stated at the top of
     * lib/userAuth.ts; I did not read it.
     */
    const accessToken = useCallback(async () => {
        const { data } = await supabase.auth.getSession();
        return data?.session?.access_token ?? null;
    }, []);

    /**
     * Sends the customer to sign in, and arranges for them to come back here.
     *
     * Through sessionStorage rather than a query parameter: the login page
     * ignores ?redirect and the auth callback reads "redirectAfterLogin", which
     * until now nothing ever wrote - so every sign-in landed on the home page.
     * Someone standing at a machine would have had to find their own way back.
     */
    const signIn = useCallback(() => {
        try {
            sessionStorage.setItem('redirectAfterLogin', `/play/${token}`);
        } catch {
            // Private mode, or storage full. Losing the return trip is worth
            // less than blocking the sign-in.
        }

        router.replace('/login');
    }, [router, token]);

    const load = useCallback(async () => {
        if (!token) return;

        try {
            const bearer = await accessToken();

            if (!bearer) {
                signIn();
                return;
            }

            const res = await fetch(`/api/play/${encodeURIComponent(token)}`, {
                headers: { Authorization: `Bearer ${bearer}` },
            });

            if (res.status === 401) {
                signIn();
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
    }, [token, accessToken, signIn]);

    useEffect(() => {
        load();
    }, [load]);

    const start = async (option: PlayOption, method: 'wallet' | 'upi') => {
        if (!token || starting !== null) return;

        setStarting(option.durationMinutes);
        setError(null);

        try {
            const bearer = await accessToken();

            if (!bearer) {
                signIn();
                return;
            }

            const res = await fetch(`/api/play/${encodeURIComponent(token)}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${bearer}`,
                },
                body: JSON.stringify({ durationMinutes: option.durationMinutes, method }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Could not start the session');

            if (data.pending) {
                setPending(data as PendingUpi);
                return;
            }

            setDone({ minutes: option.durationMinutes, station: data.station });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not start the session');
        } finally {
            setStarting(null);
        }
    };

    const submitReference = async () => {
        if (!pending || submitting) return;

        setSubmitting(true);
        setError(null);

        try {
            const bearer = await accessToken();
            if (!bearer) {
                signIn();
                return;
            }

            const res = await fetch(`/api/bookings/${pending.bookingId}/payment-claim`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${bearer}`,
                },
                body: JSON.stringify({ reference: reference.trim() }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Could not send that reference');

            setClaimed(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not send that reference');
        } finally {
            setSubmitting(false);
        }
    };

    /**
     * Watches for the café confirming the payment.
     *
     * Polled rather than pushed: this runs for a few minutes at most, on one
     * phone at a time, and a socket held open for that would be more moving
     * parts than the problem deserves.
     */
    useEffect(() => {
        if (!pending || done || rejected) return;

        let cancelled = false;

        const check = async () => {
            const bearer = await accessToken();
            if (!bearer || cancelled) return;

            try {
                const res = await fetch(`/api/play/session/${pending.bookingId}`, {
                    headers: { Authorization: `Bearer ${bearer}` },
                });
                const data = await res.json().catch(() => ({}));
                if (cancelled || !res.ok) return;

                if (data.state === 'started') {
                    setDone({ minutes: pending.durationMinutes, station: pending.station });
                } else if (data.state === 'rejected') {
                    setRejected(data.note || null);
                } else {
                    setGivenUp(Boolean(data.givenUp));
                }
            } catch {
                // A dropped poll is not worth showing anyone. The next one is
                // four seconds away.
            }
        };

        check();
        const timer = setInterval(check, 4000);

        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [pending, done, rejected, accessToken]);

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

    if (rejected) {
        return (
            <Shell>
                <div className="py-10 text-center">
                    <h1 className="text-xl font-bold text-white">Payment not confirmed</h1>
                    <p className="mt-2 text-sm text-slate-400">
                        {rejected || 'The café could not find that payment.'}
                    </p>
                    <p className="mt-4 text-sm text-slate-400">
                        Please show your payment at the counter — they can start your session there.
                    </p>
                </div>
            </Shell>
        );
    }

    if (pending) {
        return (
            <Shell>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-400">
                    {pending.station.toUpperCase()} · {pending.durationMinutes} min
                </p>
                <h1 className="mt-1 text-3xl font-black text-white">₹{pending.amount}</h1>

                {!claimed ? (
                    <>
                        <p className="mt-4 text-sm text-slate-400">
                            Pay <span className="font-bold text-slate-200">{pending.upi.payeeName}</span>,
                            then enter the reference number your app shows.
                        </p>

                        {/* One button per app rather than a single upi:// link.
                            Android hands that to a chooser, but iOS silently does
                            nothing when no app claims the scheme, and a customer
                            tapping a dead button concludes the whole thing is
                            broken. */}
                        <div className="mt-4 grid grid-cols-2 gap-2">
                            {pending.upi.apps.map((app) => (
                                <a
                                    key={app.label}
                                    href={app.url}
                                    className="flex items-center justify-center gap-2 rounded-xl border border-white/[0.10] bg-white/[0.04] px-3 py-3 text-sm font-bold text-slate-200"
                                >
                                    <Smartphone size={14} />
                                    {app.label}
                                </a>
                            ))}
                        </div>

                        <p className="mt-3 text-center text-[11px] text-slate-500">
                            or pay to {pending.upi.payeeUpiId}
                        </p>

                        <div className="mt-6">
                            <label htmlFor="ref" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Reference / UTR number
                            </label>
                            <input
                                id="ref"
                                value={reference}
                                onChange={(event) => setReference(event.target.value)}
                                inputMode="numeric"
                                autoComplete="off"
                                placeholder="e.g. 412345678901"
                                className="mt-2 w-full rounded-xl border border-white/[0.10] bg-white/[0.04] px-4 py-3 text-base text-white placeholder:text-slate-600"
                            />
                            <p className="mt-2 text-[11px] text-slate-500">
                                This is how the café finds your payment. It is in your
                                payment app next to the amount.
                            </p>
                        </div>

                        {error && <div className="mt-4"><Problem message={error} /></div>}

                        <button
                            type="button"
                            onClick={submitReference}
                            disabled={reference.trim().length < 6 || submitting}
                            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 py-4 text-sm font-bold text-emerald-950 disabled:opacity-40"
                        >
                            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                            I have paid
                        </button>
                    </>
                ) : (
                    <div className="mt-8 text-center">
                        <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-500" />
                        <p className="mt-4 text-base font-bold text-white">
                            Waiting for the café to confirm
                        </p>
                        <p className="mt-2 text-sm text-slate-400">
                            {pending.station.toUpperCase()} unlocks by itself the moment they do.
                            You can keep this screen open.
                        </p>

                        {givenUp && (
                            <div className="mt-6 text-left">
                                <Problem message="This is taking longer than usual. Please ask at the counter — your payment is safe and they can start your session." />
                            </div>
                        )}
                    </div>
                )}
            </Shell>
        );
    }

    if (!info) {
        return (
            <Shell>
                <Problem message={error || 'Could not read that code'} />
                <p className="mt-4 text-center text-xs text-slate-500">
                    Codes last a couple of minutes.
                </p>
                <button
                    type="button"
                    onClick={() => router.replace('/scan')}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-500 px-5 py-4 text-sm font-bold text-white transition-colors hover:bg-rose-400"
                >
                    <ScanLine size={16} />
                    Scan again
                </button>
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
                                <div
                                    key={option.durationMinutes}
                                    className="rounded-2xl border border-white/[0.10] bg-white/[0.03] px-5 py-4"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <span>
                                            <span className="block text-lg font-bold text-white">
                                                {option.durationMinutes} minutes
                                            </span>
                                            {partlyCovered && (
                                                <span className="mt-0.5 block text-[11px] text-emerald-400">
                                                    {fromPlan}h from your plan, rest from wallet
                                                </span>
                                            )}
                                        </span>
                                        <span className="flex shrink-0 items-center gap-2">
                                            {coveredByPlan ? (
                                                <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-300">
                                                    On your plan
                                                </span>
                                            ) : (
                                                <span className="text-lg font-bold text-slate-200">₹{option.price}</span>
                                            )}
                                            {busy && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                                        </span>
                                    </div>

                                    {/* Wallet first and filled, because it is the
                                        one that starts the session immediately.
                                        UPI means paying the bank and then waiting
                                        for someone at the café to confirm it, so
                                        it is offered rather than encouraged. */}
                                    <div className="mt-3 flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => start(option, 'wallet')}
                                            disabled={starting !== null || !affordable}
                                            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2.5 text-[13px] font-bold text-emerald-950 transition-colors hover:bg-emerald-400 disabled:opacity-40"
                                        >
                                            <Wallet size={14} />
                                            {coveredByPlan ? 'Start now' : `Wallet ₹${cash}`}
                                        </button>

                                        {!coveredByPlan && (
                                            <button
                                                type="button"
                                                onClick={() => start(option, 'upi')}
                                                disabled={starting !== null}
                                                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/[0.12] px-3 py-2.5 text-[13px] font-bold text-slate-200 transition-colors hover:bg-white/[0.06] disabled:opacity-40"
                                            >
                                                <Smartphone size={14} />
                                                UPI ₹{option.price}
                                            </button>
                                        )}
                                    </div>

                                    {!affordable && (
                                        <p className="mt-2 text-[11px] text-amber-400">
                                            ₹{cash - info.walletBalance} short in your wallet — pay by UPI instead.
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <p className="mt-5 text-center text-[11px] text-slate-500">
                        Wallet starts straight away. UPI needs the café to confirm your
                        payment first. Nothing is charged if the PC does not unlock.
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
