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
        chooserUrl: string;
        apps: { label: string; helper: string; href: string; className: string }[];
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

    // Set when asking the phone to show its own app chooser produced nothing.
    // Only then is a list of named apps worth showing - it can never be
    // complete, and a customer who banks with something not on it would
    // reasonably conclude they cannot pay.
    const [chooserFailed, setChooserFailed] = useState(false);
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

    /**
     * Hands the payment to the phone.
     *
     * Android is given an intent rather than a upi:// link, which is what makes
     * it show its own "open with" sheet listing every UPI app installed -
     * FamPay, Cred, a bank's own app, whatever this customer actually uses. A
     * plain upi:// link skips that and goes to the default handler, which is how
     * tapping Pay ended up opening WhatsApp.
     *
     * iOS has no equivalent. Nothing happens there, so the named list appears
     * instead once it is clear nothing opened.
     */
    const openPaymentApp = useCallback((session: PendingUpi) => {
        setHandedOff(true);
        setChooserFailed(false);

        const isAndroid = /android/i.test(navigator.userAgent);

        if (!isAndroid) {
            setChooserFailed(true);
            return;
        }

        // If the sheet opens, this page is hidden by it and the timer below
        // never gets to run. Still being visible means nothing took the intent.
        const check = window.setTimeout(() => {
            if (document.visibilityState === 'visible') {
                setChooserFailed(true);
            }
        }, 2000);

        window.location.href = session.upi.chooserUrl;

        return () => window.clearTimeout(check);
    }, []);

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
            if (!bearer) return;

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

            // Already claimed is not a failure. Coming back to the app twice is
            // an ordinary thing to do.
            if (res.ok || res.status === 409) {
                setClaimed(true);
            }
        } catch {
            // The poll below carries on regardless, and the owner can still
            // confirm from the payment itself.
        } finally {
            setSubmitting(false);
        }
    }, [accessToken]);

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
                    <div className="mt-6">
                        <p className="text-sm text-slate-400">
                            Paying <span className="font-bold text-slate-200">{pending.upi.payeeName}</span>.
                            The amount is already filled in.
                        </p>

                        {!chooserFailed ? (
                            <button
                                type="button"
                                onClick={() => openPaymentApp(pending)}
                                className="mt-5 flex w-full items-center justify-between gap-3 rounded-2xl bg-emerald-500 px-5 py-4 text-left text-emerald-950 transition-colors hover:bg-emerald-400"
                            >
                                <span>
                                    <span className="flex items-center gap-2 text-base font-bold">
                                        <Smartphone size={17} />
                                        Pay now
                                    </span>
                                    <span className="mt-0.5 block text-xs font-semibold opacity-80">
                                        Choose your app on the next screen
                                    </span>
                                </span>
                                <span className="text-lg font-black">₹{pending.amount}</span>
                            </button>
                        ) : (
                            <>
                                {/* Only after the phone's own sheet failed to
                                    appear. This list cannot be complete - there
                                    are more UPI apps than anyone can name - so it
                                    is a fallback rather than the offer. */}
                                <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Open your payment app
                                </p>

                                <div className="mt-3 space-y-2.5">
                                    {pending.upi.apps.map((app) => (
                                        <a
                                            key={app.label}
                                            href={app.href}
                                            onClick={() => setHandedOff(true)}
                                            className={`flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-r px-5 py-4 ${app.className}`}
                                        >
                                            <span className="flex items-center gap-2.5 text-base font-bold">
                                                <Smartphone size={17} />
                                                {app.label}
                                            </span>
                                            <span className="text-lg font-black">₹{pending.amount}</span>
                                        </a>
                                    ))}

                                    <a
                                        href={pending.upi.url}
                                        onClick={() => setHandedOff(true)}
                                        className="flex items-center justify-center gap-2 rounded-2xl border border-white/[0.12] px-5 py-3.5 text-sm font-bold text-slate-300"
                                    >
                                        Another UPI app
                                    </a>
                                </div>
                            </>
                        )}

                        <p className="mt-4 text-center text-[11px] text-slate-500">
                            or pay {pending.upi.payeeUpiId} yourself
                        </p>

                        <button
                            type="button"
                            onClick={() => raiseClaim(pending)}
                            disabled={submitting}
                            className="mt-6 w-full rounded-2xl border border-white/[0.12] px-5 py-4 text-sm font-bold text-slate-200 disabled:opacity-40"
                        >
                            {submitting ? 'Sending…' : 'I have paid'}
                        </button>
                    </div>
                ) : (
                    <div className="mt-8 text-center">
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/15">
                            <Clock className="h-8 w-8 text-amber-400" />
                        </div>
                        <p className="mt-4 text-base font-bold text-white">
                            Waiting for the café to confirm
                        </p>
                        <p className="mt-2 text-sm text-slate-400">
                            {pending.station.toUpperCase()} unlocks by itself the moment they do.
                            Keep this screen open.
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

            {canPlay && !chosen && (
                <>
                    <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        How long do you want to play?
                    </p>

                    <div className="mt-3 space-y-2.5">
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
                                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/[0.10] bg-white/[0.03] px-5 py-4 text-left transition-colors hover:bg-white/[0.06]"
                                >
                                    <span className="text-lg font-bold text-white">
                                        {option.durationMinutes} minutes
                                    </span>
                                    {coveredByPlan ? (
                                        <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-300">
                                            On your plan
                                        </span>
                                    ) : (
                                        <span className="text-lg font-bold text-slate-200">₹{option.price}</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}

            {canPlay && chosen && (() => {
                // Recomputed here so the second screen shows the same numbers the
                // server will charge, rather than the list price from the first.
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
                            className="mt-6 text-xs font-semibold text-slate-500 hover:text-slate-300"
                        >
                            ← {chosen.durationMinutes} minutes · change
                        </button>

                        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            How do you want to pay?
                        </p>

                        <div className="mt-3 space-y-2.5">
                            {/* Wallet leads while it can pay, because it starts
                                the session there and then. The moment it cannot,
                                the emphasis moves to UPI: a big green button that
                                refuses to be pressed is worse than no button, and
                                the eye goes to it before it reads why. */}
                            <button
                                type="button"
                                onClick={() => start(chosen, 'wallet')}
                                disabled={busy || !affordable}
                                className={`flex w-full items-center justify-between gap-3 rounded-2xl px-5 py-4 text-left transition-colors disabled:opacity-50 ${
                                    affordable
                                        ? 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400'
                                        : 'border border-white/[0.10] text-slate-400'
                                }`}
                            >
                                <span>
                                    <span className="flex items-center gap-2 text-base font-bold">
                                        <Wallet size={16} />
                                        {coveredByPlan ? 'Start on my plan' : 'Pay from wallet'}
                                    </span>
                                    <span className="mt-0.5 block text-xs font-semibold opacity-80">
                                        {coveredByPlan
                                            ? 'Starts straight away'
                                            : affordable
                                                ? `₹${cash} of ₹${info.walletBalance} · starts straight away`
                                                : `Not enough — ₹${info.walletBalance} of ₹${cash}`}
                                    </span>
                                </span>
                                <span className="text-lg font-black">
                                    {coveredByPlan ? '' : `₹${cash}`}
                                </span>
                            </button>

                            {!coveredByPlan && (
                                <button
                                    type="button"
                                    onClick={() => start(chosen, 'upi')}
                                    disabled={busy}
                                    className={`flex w-full items-center justify-between gap-3 rounded-2xl px-5 py-4 text-left transition-colors disabled:opacity-40 ${
                                        affordable
                                            ? 'border border-white/[0.12] hover:bg-white/[0.06]'
                                            : 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400'
                                    }`}
                                >
                                    <span>
                                        <span className={`flex items-center gap-2 text-base font-bold ${affordable ? 'text-white' : ''}`}>
                                            <Smartphone size={16} />
                                            Pay by UPI
                                        </span>
                                        <span className={`mt-0.5 block text-xs ${affordable ? 'text-slate-500' : 'font-semibold opacity-80'}`}>
                                            Opens your payment app · café confirms before you start
                                        </span>
                                    </span>
                                    <span className={`text-lg font-black ${affordable ? 'text-slate-200' : ''}`}>₹{chosen.price}</span>
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
