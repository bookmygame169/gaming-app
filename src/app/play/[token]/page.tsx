'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, Check, ChevronLeft, Clock, Loader2, Lock, ScanLine, Smartphone, Wallet } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { UpiAppGrid, UpiManualPay } from '@/components/UpiPayPanel';
import type { UpiAppOption } from '@/lib/upi';

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
        chooserUrl: string;
        apps: UpiAppOption[];
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
    // Choosing how long and choosing how to pay are two questions, asked one at
    // a time. Two buttons on every price row made the customer answer both at
    // once, off a grid of six.
    const [chosen, setChosen] = useState<PlayOption | null>(null);

    const [pending, setPending] = useState<PendingUpi | null>(null);
    const [claimed, setClaimed] = useState(false);
    const [handedOff, setHandedOff] = useState(false);

    // True when the session on screen was already waiting before this scan.
    // Worth saying out loud - otherwise resuming looks like the tap did nothing.
    const [resumed, setResumed] = useState(false);
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
                setResumed(Boolean(data.resumed));
                // A resumed session has already been told to the café, so it
                // goes straight to waiting rather than asking them to pay twice.
                setClaimed(Boolean(data.resumed));
                return;
            }

            setDone({ minutes: option.durationMinutes, station: data.station });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not start the session');
        } finally {
            setStarting(null);
        }
    };

    const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

    /**
     * Opens the UPI app the customer tapped.
     *
     * Never a generic upi:// link: that goes to whichever app they once set as
     * default, which on a lot of phones is WhatsApp, with no chance to pick
     * Paytm or FamPay. Each button uses that app's own address.
     */
    const openNamedApp = useCallback((app: UpiAppOption) => {
        setHandedOff(true);
        window.location.href = isAndroid ? app.androidHref : app.href;
    }, [isAndroid]);

    /**
     * Tells the café a payment is on its way.
     *
     * The reference is the short booking id, which the customer never has to
     * read or type: it is already in the note attached to the payment, so the
     * owner sees the same string in their bank app and on the claim. Asking
     * someone standing at a locked PC to copy a twelve digit UTR across from
     * another app was a step that could only go wrong.
     */
    const raiseClaim = useCallback(async (session: PendingUpi) => {
        setSubmitting(true);

        try {
            const bearer = await accessToken();
            if (!bearer) {
                setError('Please sign in again, then tap I have paid.');
                return;
            }

            const res = await fetch(`/api/bookings/${session.bookingId}/payment-claim`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${bearer}`,
                },
                body: JSON.stringify({
                    reference: session.bookingId.slice(0, 8).toUpperCase(),
                }),
            });

            const data = await res.json().catch(() => ({}));

            // Already claimed is not a failure. Coming back to the app twice is
            // an ordinary thing to do.
            if (res.ok || res.status === 409) {
                setClaimed(true);
                setError(null);
                return;
            }

            setError(typeof data.error === 'string' ? data.error : 'Could not tell the café you paid. Try again.');
        } catch {
            setError('Could not tell the café you paid. Check your connection and try again.');
        } finally {
            setSubmitting(false);
        }
    }, [accessToken]);

    const abandon = async () => {
        if (!pending || submitting) return;

        setSubmitting(true);

        try {
            const bearer = await accessToken();
            if (!bearer) return;

            await fetch(`/api/play/session/${pending.bookingId}/cancel`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${bearer}` },
            });

            setPending(null);
            setClaimed(false);
            setResumed(false);
            setChosen(null);
            load();
        } catch {
            setError('Could not cancel that. Please ask at the counter.');
        } finally {
            setSubmitting(false);
        }
    };

    /**
     * Notices the customer coming back from their payment app.
     *
     * Leaving for another app hides this page; returning shows it again. That
     * is the only signal available that they went to pay, and it is enough -
     * whether money actually arrived is the owner's call either way.
     */
    useEffect(() => {
        if (!pending || !handedOff || claimed) return;

        const onVisible = () => {
            if (document.visibilityState === 'visible') {
                raiseClaim(pending);
            }
        };

        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [pending, handedOff, claimed, raiseClaim]);

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
                <div className="flex flex-col items-center gap-3 py-20 text-slate-400">
                    <Loader2 className="h-7 w-7 animate-spin text-rose-400" />
                    <p className="text-sm">Reading the code…</p>
                </div>
            </Shell>
        );
    }

    if (done) {
        return (
            <Shell>
                <div className="relative overflow-hidden rounded-[28px] border border-emerald-400/20 bg-gradient-to-b from-emerald-500/15 to-white/[0.03] px-6 py-12 text-center">
                    <div className="pointer-events-none absolute -top-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-emerald-400/20 blur-3xl" />
                    <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-emerald-950 shadow-[0_0_40px_rgba(16,185,129,0.45)]">
                        <Check className="h-10 w-10" strokeWidth={3} />
                    </div>
                    <h1 className="relative mt-6 text-3xl font-black tracking-tight text-white">
                        {done.station.toUpperCase()} unlocked
                    </h1>
                    <p className="relative mt-2 text-sm text-emerald-100/70">
                        {done.minutes} minutes, starting now. Sit down and pick a game.
                    </p>
                </div>
            </Shell>
        );
    }

    if (rejected) {
        return (
            <Shell>
                <div className="rounded-[28px] border border-rose-500/20 bg-rose-500/[0.08] px-6 py-10 text-center">
                    <h1 className="text-2xl font-black text-white">Payment not confirmed</h1>
                    <p className="mt-2 text-sm text-rose-100/70">
                        {rejected || 'The café could not find that payment.'}
                    </p>
                    <p className="mt-5 text-sm text-slate-400">
                        Show the payment at the counter — they can start your session there.
                    </p>
                </div>
            </Shell>
        );
    }

    if (pending) {
        return (
            <Shell>
                <div className="relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-gradient-to-br from-white/[0.08] via-white/[0.03] to-transparent p-5">
                    <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-rose-500/20 blur-3xl" />
                    <div className="pointer-events-none absolute -bottom-12 -left-8 h-32 w-32 rounded-full bg-cyan-400/10 blur-3xl" />
                    <p className="relative text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-300">
                        {pending.station.toUpperCase()} · {pending.durationMinutes} min
                    </p>
                    <p className="relative mt-3 text-5xl font-black tracking-tight text-white">
                        ₹{pending.amount}
                    </p>
                    <p className="relative mt-2 text-sm font-semibold text-slate-200">
                        {pending.upi.payeeName}
                    </p>
                    <p className="relative mt-0.5 truncate text-xs text-slate-500">
                        {pending.upi.payeeUpiId}
                    </p>
                </div>

                {error && <div className="mt-4"><Problem message={error} /></div>}

                {!claimed ? (
                    <div className="mt-6">
                        <div className="mb-3 flex items-end justify-between">
                            <p className="text-sm font-bold text-white">Choose your UPI app</p>
                            <p className="text-[11px] text-slate-500">Opens that app only</p>
                        </div>

                        <UpiAppGrid apps={pending.upi.apps} isAndroid={isAndroid} onOpen={openNamedApp} />

                        <div className="mt-4">
                            <UpiManualPay
                                payeeUpiId={pending.upi.payeeUpiId}
                                amount={pending.amount}
                                paymentUrl={pending.upi.url}
                            />
                        </div>

                        <button
                            type="button"
                            onClick={() => raiseClaim(pending)}
                            disabled={submitting}
                            className="mt-5 w-full rounded-2xl bg-gradient-to-r from-rose-500 to-orange-500 px-5 py-4 text-sm font-black text-white shadow-[0_12px_30px_-12px_rgba(244,63,94,0.8)] disabled:opacity-40"
                        >
                            {submitting ? 'Telling the café…' : 'I have paid'}
                        </button>
                        <p className="mt-2 text-center text-[11px] text-slate-500">
                            Pay first, then tap this. The PC unlocks when the café confirms.
                        </p>
                    </div>
                ) : (
                    <div className="mt-8 text-center">
                        <div className="relative mx-auto h-20 w-20">
                            <span className="absolute inset-0 animate-ping rounded-full bg-amber-400/20" />
                            <span className="absolute inset-2 animate-pulse rounded-full bg-amber-400/10" />
                            <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-amber-400/30 bg-amber-500/15">
                                <Clock className="h-8 w-8 text-amber-300" />
                            </div>
                        </div>
                        <p className="mt-5 text-xl font-black text-white">Waiting for the café</p>
                        <p className="mt-2 text-sm leading-relaxed text-slate-400">
                            {pending.station.toUpperCase()} unlocks by itself the moment they confirm.
                            Keep this screen open.
                        </p>
                        <div className="mx-auto mt-5 h-1.5 w-40 overflow-hidden rounded-full bg-white/10">
                            <div className="h-full w-1/2 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-amber-400 to-rose-400" />
                        </div>

                        {resumed && (
                            <p className="mt-5 text-xs text-slate-500">
                                You already had a payment waiting for this PC — you have not been charged twice.
                            </p>
                        )}

                        <button
                            type="button"
                            onClick={abandon}
                            disabled={submitting}
                            className="mt-8 text-xs font-semibold text-slate-500 underline decoration-slate-700 underline-offset-4 hover:text-slate-300 disabled:opacity-40"
                        >
                            {submitting ? 'Cancelling…' : 'Cancel and start again'}
                        </button>

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
            <div className="relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-gradient-to-br from-white/[0.08] via-white/[0.03] to-transparent p-5">
                <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-rose-500/25 blur-3xl" />
                <p className="relative text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-300">
                    {info.cafeName}
                </p>
                <h1 className="relative mt-2 text-4xl font-black tracking-tight text-white">
                    {info.station.toUpperCase()}
                </h1>
                <div className="relative mt-4 flex flex-wrap gap-2">
                    {info.planHours > 0 && (
                        <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-300">
                            <Clock size={13} />
                            {info.planHours}h on plan
                        </span>
                    )}
                    <span className="flex items-center gap-1.5 rounded-full border border-white/[0.10] bg-black/30 px-3 py-1.5 text-xs font-bold text-slate-200">
                        <Wallet size={13} />
                        ₹{info.walletBalance} wallet
                    </span>
                </div>
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

            {canPlay && !chosen && (
                <>
                    <p className="mt-7 text-sm font-bold text-white">How long?</p>
                    <div className="mt-3 grid grid-cols-2 gap-2.5">
                        {info.options.map((option) => {
                            const hoursWanted = option.durationMinutes / 60;
                            const fromPlan = Math.min(info.planHours, hoursWanted);
                            const cash = Math.round(option.price * ((hoursWanted - fromPlan) / hoursWanted));
                            const coveredByPlan = cash === 0;

                            return (
                                <button
                                    key={option.durationMinutes}
                                    type="button"
                                    onClick={() => setChosen(option)}
                                    className="rounded-[22px] border border-white/[0.08] bg-white/[0.04] p-4 text-left transition hover:border-rose-400/40 hover:bg-white/[0.07] active:scale-[0.98]"
                                >
                                    <span className="block text-2xl font-black text-white">
                                        {option.durationMinutes}
                                        <span className="ml-1 text-sm font-semibold text-slate-500">min</span>
                                    </span>
                                    {coveredByPlan ? (
                                        <span className="mt-2 inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                                            On your plan
                                        </span>
                                    ) : (
                                        <span className="mt-2 block text-base font-bold text-rose-300">₹{option.price}</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}

            {canPlay && chosen && (() => {
                const hoursWanted = chosen.durationMinutes / 60;
                const fromPlan = Math.min(info.planHours, hoursWanted);
                const cash = Math.round(chosen.price * ((hoursWanted - fromPlan) / hoursWanted));
                const coveredByPlan = cash === 0;
                const affordable = cash <= info.walletBalance;
                const busy = starting !== null;

                return (
                    <>
                        <button
                            type="button"
                            onClick={() => setChosen(null)}
                            className="mt-6 flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-300"
                        >
                            <ChevronLeft size={14} />
                            {chosen.durationMinutes} min · change
                        </button>

                        <p className="mt-4 text-sm font-bold text-white">Pay and start</p>

                        <div className="mt-3 space-y-2.5">
                            <button
                                type="button"
                                onClick={() => start(chosen, 'wallet')}
                                disabled={busy || !affordable}
                                className={`flex w-full items-center justify-between gap-3 rounded-[22px] px-5 py-4 text-left transition disabled:opacity-50 ${
                                    affordable
                                        ? 'bg-emerald-500 text-emerald-950 shadow-[0_12px_30px_-12px_rgba(16,185,129,0.85)]'
                                        : 'border border-white/[0.10] text-slate-400'
                                }`}
                            >
                                <span>
                                    <span className="flex items-center gap-2 text-base font-black">
                                        <Wallet size={16} />
                                        {coveredByPlan ? 'Start on my plan' : 'Wallet'}
                                    </span>
                                    <span className="mt-0.5 block text-xs font-semibold opacity-80">
                                        {coveredByPlan
                                            ? 'Unlocks immediately'
                                            : affordable
                                                ? `₹${cash} of ₹${info.walletBalance} · unlocks immediately`
                                                : `Need ₹${cash} · you have ₹${info.walletBalance}`}
                                    </span>
                                </span>
                                <span className="text-xl font-black">
                                    {coveredByPlan ? '' : `₹${cash}`}
                                </span>
                            </button>

                            {!coveredByPlan && (
                                <button
                                    type="button"
                                    onClick={() => start(chosen, 'upi')}
                                    disabled={busy}
                                    className={`flex w-full items-center justify-between gap-3 rounded-[22px] px-5 py-4 text-left transition disabled:opacity-40 ${
                                        affordable
                                            ? 'border border-white/[0.12] bg-white/[0.04] hover:bg-white/[0.07]'
                                            : 'bg-gradient-to-r from-rose-500 to-orange-500 text-white shadow-[0_12px_30px_-12px_rgba(244,63,94,0.8)]'
                                    }`}
                                >
                                    <span>
                                        <span className={`flex items-center gap-2 text-base font-black ${affordable ? 'text-white' : ''}`}>
                                            <Smartphone size={16} />
                                            UPI
                                        </span>
                                        <span className={`mt-0.5 block text-xs ${affordable ? 'text-slate-500' : 'font-semibold opacity-90'}`}>
                                            Pick Paytm, GPay, FamPay and more
                                        </span>
                                    </span>
                                    <span className={`text-xl font-black ${affordable ? 'text-white' : ''}`}>₹{chosen.price}</span>
                                </button>
                            )}
                        </div>

                        {busy && (
                            <p className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Setting up…
                            </p>
                        )}
                    </>
                );
            })()}

        </Shell>
    );
}

function Shell({ children }: { children: React.ReactNode }) {
    return (
        <main className="relative min-h-screen overflow-hidden bg-[#08080c] px-5 py-10">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,7,58,0.18),transparent_42%),radial-gradient(circle_at_80%_20%,rgba(0,240,255,0.08),transparent_30%)]" />
            <div className="relative mx-auto w-full max-w-md">
                <div className="mb-6 flex items-center gap-2 text-slate-500">
                    <Lock size={14} />
                    <span className="text-xs font-semibold uppercase tracking-[0.18em]">Start a session</span>
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
