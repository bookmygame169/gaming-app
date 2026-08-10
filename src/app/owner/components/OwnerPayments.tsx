'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    IndianRupee,
    Loader2,
    AlertCircle,
    Check,
    X,
    Save,
    ShieldAlert,
} from 'lucide-react';

type Claim = {
    id: string;
    bookingId: string;
    shortId: string;
    amount: number;
    expectedAmount: number;
    amountMatches: boolean;
    reference: string | null;
    status: string;
    createdAt: string;
    customerName: string | null;
    customerPhone: string | null;
    bookingDate: string | null;
    startTime: string | null;
};

interface OwnerPaymentsProps {
    cafeId?: string;
    upiId?: string | null;
    upiDisplayName?: string | null;
    cafeName?: string;
}

const UPI_PATTERN = /^[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z][a-zA-Z0-9.\-_]{1,64}$/;

const formatWhen = (iso: string) =>
    new Date(iso).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
    });

/**
 * Where the café's money goes, and the queue of payments waiting to be checked.
 *
 * Nothing here can see the café's bank account, so nothing here decides that a
 * payment arrived. The customer's claim and its reference number are put in
 * front of the owner; confirming is a human action, and it is what releases the
 * booking and unlocks the machine.
 */
export function OwnerPayments({ cafeId, upiId, upiDisplayName, cafeName }: OwnerPaymentsProps) {
    const [claims, setClaims] = useState<Claim[]>([]);
    const [pendingCount, setPendingCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [actioningId, setActioningId] = useState<string | null>(null);

    const [upi, setUpi] = useState(upiId || '');
    const [payeeName, setPayeeName] = useState(upiDisplayName || '');
    const [savingUpi, setSavingUpi] = useState(false);

    useEffect(() => {
        setUpi(upiId || '');
        setPayeeName(upiDisplayName || '');
    }, [upiId, upiDisplayName]);

    const load = useCallback(async () => {
        if (!cafeId) return;

        setLoading(true);
        try {
            const res = await fetch(`/api/owner/payments?cafeId=${encodeURIComponent(cafeId)}`, {
                credentials: 'include',
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Could not load payments');

            setClaims(Array.isArray(data.claims) ? data.claims : []);
            setPendingCount(Number(data.pendingCount) || 0);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not load payments');
        } finally {
            setLoading(false);
        }
    }, [cafeId]);

    useEffect(() => {
        load();
    }, [load]);

    const saveUpi = async () => {
        if (!cafeId) return;

        const trimmed = upi.trim();
        if (trimmed && !UPI_PATTERN.test(trimmed)) {
            setError('That does not look like a UPI id. It should look like name@bank.');
            return;
        }

        setSavingUpi(true);
        setNotice(null);
        try {
            const res = await fetch('/api/owner/cafes', {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cafeId,
                    updates: {
                        upi_id: trimmed || null,
                        upi_display_name: payeeName.trim() || null,
                    },
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Could not save');

            setNotice(
                trimmed
                    ? 'Saved. Customers can now pay this café online.'
                    : 'Saved. Online payment is off — customers will be told to pay at the counter.'
            );
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save');
        } finally {
            setSavingUpi(false);
        }
    };

    const act = async (claimId: string, action: 'verify' | 'reject') => {
        if (!cafeId) return;

        setActioningId(claimId);
        setNotice(null);
        try {
            const res = await fetch('/api/owner/payments', {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cafeId, claimId, action }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Could not save');

            setNotice(
                action === 'verify'
                    ? 'Payment confirmed. The booking is live and the machine will unlock at its start time.'
                    : 'Marked as not received.'
            );
            setError(null);
            load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save');
        } finally {
            setActioningId(null);
        }
    };

    const waiting = claims.filter((claim) => claim.status === 'claimed');
    const settled = claims.filter((claim) => claim.status !== 'claimed');

    return (
        <div className="flex flex-col gap-4">
            <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
                <div className="mb-4 flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15">
                        <IndianRupee size={15} className="text-emerald-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-200">Where your money goes</h3>
                        <p className="text-[11px] text-slate-500">
                            Your own UPI id. Advance payments go straight to you.
                        </p>
                    </div>
                </div>

                {error && (
                    <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-[12px] text-amber-300">
                        <AlertCircle size={14} className="mt-0.5 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {notice && (
                    <div className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3 text-[12px] text-emerald-300">
                        {notice}
                    </div>
                )}

                {!upiId && (
                    <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-[12px] text-amber-200">
                        <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                        <span>
                            No UPI id set, so customers cannot pay online — they are told to pay at
                            the counter. Add yours below to take advance payments.
                        </span>
                    </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            Your UPI id
                        </label>
                        <input
                            value={upi}
                            onChange={(e) => setUpi(e.target.value)}
                            placeholder="yourname@okhdfcbank"
                            className="w-full rounded-lg border border-white/[0.08] bg-[#0b1018] px-2.5 py-2 text-[13px] text-slate-200 focus:border-emerald-500/50 focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            Name customers will see
                        </label>
                        <input
                            value={payeeName}
                            onChange={(e) => setPayeeName(e.target.value)}
                            placeholder={cafeName || 'Your café name'}
                            className="w-full rounded-lg border border-white/[0.08] bg-[#0b1018] px-2.5 py-2 text-[13px] text-slate-200 focus:border-emerald-500/50 focus:outline-none"
                        />
                    </div>
                </div>

                <button
                    type="button"
                    onClick={saveUpi}
                    disabled={!cafeId || savingUpi}
                    className="mt-4 flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-[12px] font-bold text-black transition-colors hover:bg-emerald-400 disabled:opacity-40"
                >
                    {savingUpi ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    Save
                </button>
            </section>

            <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
                <div className="mb-4">
                    <h3 className="text-sm font-bold text-slate-200">
                        Payments to check
                        {pendingCount > 0 && (
                            <span className="ml-2 rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-400">
                                {pendingCount}
                            </span>
                        )}
                    </h3>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                        Match the reference against your UPI app, then confirm. Confirming is what
                        releases the booking and unlocks the machine.
                    </p>
                </div>

                {loading && (
                    <div className="flex items-center gap-2 py-6 text-[12px] text-slate-500">
                        <Loader2 size={14} className="animate-spin" /> Loading…
                    </div>
                )}

                {!loading && waiting.length === 0 && (
                    <p className="py-6 text-center text-[12px] text-slate-500">
                        Nothing waiting. Customers who pay online show up here.
                    </p>
                )}

                <div className="flex flex-col gap-2">
                    {waiting.map((claim) => (
                        <div
                            key={claim.id}
                            className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-3"
                        >
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="min-w-[140px] flex-1">
                                    <p className="text-[13px] font-bold text-slate-200">
                                        {claim.customerName || claim.customerPhone || 'Customer'}
                                    </p>
                                    <p className="text-[11px] text-slate-500">
                                        #{claim.shortId}
                                        {claim.bookingDate ? ` · ${claim.bookingDate}` : ''}
                                        {claim.startTime ? ` ${claim.startTime}` : ''}
                                    </p>
                                </div>

                                <div>
                                    <p className="text-[15px] font-bold text-slate-100">
                                        ₹{claim.amount.toLocaleString('en-IN')}
                                    </p>
                                    {/* The one thing most worth catching: a claim
                                        that does not match what is owed. */}
                                    {!claim.amountMatches && (
                                        <p className="text-[10px] font-semibold text-amber-400">
                                            booking says ₹{claim.expectedAmount.toLocaleString('en-IN')}
                                        </p>
                                    )}
                                </div>

                                <div className="min-w-[120px]">
                                    <p className="text-[10px] uppercase tracking-wide text-slate-500">
                                        Reference
                                    </p>
                                    <p className="font-mono text-[12px] text-slate-300">
                                        {claim.reference || '—'}
                                    </p>
                                </div>

                                <span className="text-[11px] text-slate-500">
                                    {formatWhen(claim.createdAt)}
                                </span>

                                <div className="flex gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => act(claim.id, 'verify')}
                                        disabled={actioningId === claim.id}
                                        className="flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-[11px] font-bold text-black transition-colors hover:bg-emerald-400 disabled:opacity-40"
                                    >
                                        {actioningId === claim.id ? (
                                            <Loader2 size={11} className="animate-spin" />
                                        ) : (
                                            <Check size={11} />
                                        )}
                                        Got it
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => act(claim.id, 'reject')}
                                        disabled={actioningId === claim.id}
                                        className="flex items-center gap-1 rounded-lg border border-white/[0.08] px-3 py-1.5 text-[11px] font-semibold text-slate-400 transition-colors hover:text-red-400 disabled:opacity-40"
                                    >
                                        <X size={11} />
                                        Not received
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {settled.length > 0 && (
                    <div className="mt-5">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Already checked
                        </p>
                        <div className="flex flex-col gap-1.5">
                            {settled.slice(0, 20).map((claim) => (
                                <div
                                    key={claim.id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/[0.02] px-3 py-2"
                                >
                                    <span className="text-[12px] text-slate-300">
                                        #{claim.shortId} · {claim.customerName || claim.customerPhone || 'Customer'}
                                    </span>
                                    <span className="font-mono text-[11px] text-slate-500">
                                        {claim.reference || '—'}
                                    </span>
                                    <span className="text-[12px] text-slate-400">
                                        ₹{claim.amount.toLocaleString('en-IN')}
                                    </span>
                                    <span
                                        className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase"
                                        style={
                                            claim.status === 'verified'
                                                ? { background: 'rgba(34,197,94,0.12)', color: '#4ade80' }
                                                : { background: 'rgba(239,68,68,0.12)', color: '#f87171' }
                                        }
                                    >
                                        {claim.status === 'verified' ? 'Received' : 'Not received'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}
