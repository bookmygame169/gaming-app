'use client';

import { useCallback, useEffect, useState } from 'react';
import { Wallet, Loader2, AlertCircle, Plus, Minus, Search } from 'lucide-react';

type Holder = { phone: string; name: string | null; balance: number };

type RecentEntry = {
    id: string;
    phone: string;
    amount: number;
    reason: string;
    paymentMode: string | null;
    createdAt: string;
};

interface OwnerWalletProps {
    cafeId?: string;
}

const REASON_LABELS: Record<string, string> = {
    topup: 'Top-up',
    spend: 'Spent',
    refund: 'Refunded',
    correction: 'Correction',
};

const formatWhen = (iso: string) =>
    new Date(iso).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
    });

/**
 * Wallet top-ups and spends.
 *
 * A customer hands over cash or pays by UPI at the counter and the café credits
 * their wallet. There is no gateway, so every credit here is a person saying
 * they were paid — which is why the form asks how, and records who said it.
 */
export function OwnerWallet({ cafeId }: OwnerWalletProps) {
    const [holders, setHolders] = useState<Holder[]>([]);
    const [recent, setRecent] = useState<RecentEntry[]>([]);
    const [totalHeld, setTotalHeld] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [search, setSearch] = useState('');

    const [phone, setPhone] = useState('');
    const [amount, setAmount] = useState('');
    const [paymentMode, setPaymentMode] = useState('cash');
    const [reference, setReference] = useState('');
    const [mode, setMode] = useState<'topup' | 'spend'>('topup');
    const [saving, setSaving] = useState(false);
    const [lookedUpBalance, setLookedUpBalance] = useState<number | null>(null);

    const load = useCallback(async () => {
        if (!cafeId) return;

        setLoading(true);
        try {
            const res = await fetch(`/api/owner/wallet?cafeId=${encodeURIComponent(cafeId)}`, {
                credentials: 'include',
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Could not load wallets');

            setHolders(Array.isArray(data.holders) ? data.holders : []);
            setRecent(Array.isArray(data.recent) ? data.recent : []);
            setTotalHeld(Number(data.totalHeld) || 0);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not load wallets');
        } finally {
            setLoading(false);
        }
    }, [cafeId]);

    useEffect(() => {
        load();
    }, [load]);

    // Shows the balance as the number is typed, so staff are not crediting or
    // deducting blind.
    useEffect(() => {
        const digits = phone.replace(/\D/g, '');
        if (!cafeId || digits.length < 10) {
            setLookedUpBalance(null);
            return;
        }

        let cancelled = false;
        const timer = setTimeout(async () => {
            try {
                const res = await fetch(
                    `/api/owner/wallet?cafeId=${encodeURIComponent(cafeId)}&phone=${encodeURIComponent(digits)}`,
                    { credentials: 'include' }
                );
                if (!res.ok) return;
                const data = await res.json();
                if (!cancelled) setLookedUpBalance(Number(data.balance) || 0);
            } catch {
                // A lookup problem must not stop the counter taking money.
            }
        }, 300);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [phone, cafeId]);

    const submit = async () => {
        if (!cafeId) return;

        setSaving(true);
        setNotice(null);
        try {
            const res = await fetch('/api/owner/wallet', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cafeId,
                    phone,
                    amount: Number(amount),
                    reason: mode,
                    paymentMode: mode === 'topup' ? paymentMode : undefined,
                    paymentReference: mode === 'topup' ? reference : undefined,
                    // A tablet on a bad connection retries; the same key makes
                    // the retry land once rather than credit twice.
                    idempotencyKey: `${cafeId}:${phone}:${amount}:${mode}:${Math.floor(Date.now() / 1000)}`,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Could not save');

            setNotice(
                data.duplicate
                    ? 'Already recorded — nothing was added twice.'
                    : mode === 'topup'
                      ? `Added ₹${amount}. Balance is now ₹${data.balance}.`
                      : `Took ₹${amount} off. Balance is now ₹${data.balance}.`
            );
            setAmount('');
            setReference('');
            setError(null);
            load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save');
        } finally {
            setSaving(false);
        }
    };

    const searchKey = search.replace(/\D/g, '');
    const visible = searchKey
        ? holders.filter(
              (h) =>
                  h.phone.includes(searchKey) ||
                  (h.name || '').toLowerCase().includes(search.toLowerCase())
          )
        : holders;

    return (
        <div className="flex flex-col gap-4">
            <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
                <div className="mb-4 flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15">
                        <Wallet size={15} className="text-emerald-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-200">Wallet</h3>
                        <p className="text-[11px] text-slate-500">
                            Take payment now, let them play it down later
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

                <div className="mb-3 flex gap-2">
                    <button
                        type="button"
                        onClick={() => setMode('topup')}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-bold transition-colors ${
                            mode === 'topup'
                                ? 'bg-emerald-500 text-black'
                                : 'border border-white/[0.08] text-slate-400 hover:text-white'
                        }`}
                    >
                        <Plus size={13} /> Add money
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode('spend')}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-bold transition-colors ${
                            mode === 'spend'
                                ? 'bg-amber-500 text-black'
                                : 'border border-white/[0.08] text-slate-400 hover:text-white'
                        }`}
                    >
                        <Minus size={13} /> Use for a session
                    </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-4">
                    <input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="Phone number"
                        className="rounded-lg border border-white/[0.08] bg-[#0b1018] px-2.5 py-2 text-[13px] text-slate-200 focus:border-emerald-500/50 focus:outline-none"
                    />
                    <input
                        type="number"
                        min={1}
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="Amount ₹"
                        className="rounded-lg border border-white/[0.08] bg-[#0b1018] px-2.5 py-2 text-[13px] text-slate-200 focus:border-emerald-500/50 focus:outline-none"
                    />

                    {mode === 'topup' ? (
                        <select
                            value={paymentMode}
                            onChange={(e) => setPaymentMode(e.target.value)}
                            className="rounded-lg border border-white/[0.08] bg-[#0b1018] px-2.5 py-2 text-[13px] text-slate-200 focus:border-emerald-500/50 focus:outline-none"
                        >
                            <option value="cash">Paid cash</option>
                            <option value="upi">Paid by UPI</option>
                            <option value="card">Paid by card</option>
                        </select>
                    ) : (
                        <div className="self-center text-[11px] text-slate-500">
                            Comes off their balance
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={submit}
                        disabled={!cafeId || saving || !phone || !amount}
                        className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-bold text-black transition-colors disabled:opacity-40 ${
                            mode === 'topup'
                                ? 'bg-emerald-500 hover:bg-emerald-400'
                                : 'bg-amber-500 hover:bg-amber-400'
                        }`}
                    >
                        {saving ? <Loader2 size={13} className="animate-spin" /> : <Wallet size={13} />}
                        {mode === 'topup' ? 'Add money' : 'Use money'}
                    </button>
                </div>

                {/* The UPI reference makes a disputed top-up findable on the
                    café's own statement weeks later. */}
                {mode === 'topup' && paymentMode === 'upi' && (
                    <input
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        placeholder="UPI reference number (recommended)"
                        className="mt-3 w-full rounded-lg border border-white/[0.08] bg-[#0b1018] px-2.5 py-2 text-[13px] text-slate-200 focus:border-emerald-500/50 focus:outline-none"
                    />
                )}

                {lookedUpBalance !== null && (
                    <p className="mt-3 text-[12px] text-slate-400">
                        This customer currently has{' '}
                        <strong className="text-slate-100">
                            ₹{lookedUpBalance.toLocaleString('en-IN')}
                        </strong>{' '}
                        in their wallet.
                    </p>
                )}
            </section>

            <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                <p className="text-[11px] text-slate-500">Money you are holding for customers</p>
                <p className="mt-1 text-xl font-bold text-amber-400">
                    ₹{totalHeld.toLocaleString('en-IN')}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                    Already paid to you, not yet played. You owe this in sessions.
                </p>
            </section>

            <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-bold text-slate-200">Who has a balance</h3>
                    <div className="relative">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search name or phone"
                            className="rounded-lg border border-white/[0.08] bg-[#0b1018] py-2 pl-8 pr-2.5 text-[12px] text-slate-200 focus:border-emerald-500/50 focus:outline-none"
                        />
                    </div>
                </div>

                {loading && (
                    <div className="flex items-center gap-2 py-6 text-[12px] text-slate-500">
                        <Loader2 size={14} className="animate-spin" /> Loading…
                    </div>
                )}

                {!loading && visible.length === 0 && (
                    <p className="py-6 text-center text-[12px] text-slate-500">
                        {holders.length === 0
                            ? 'Nobody has a wallet balance yet. Add money above when a customer pays up front.'
                            : 'No customer matches that search.'}
                    </p>
                )}

                <div className="flex flex-col gap-2">
                    {visible.map((holder) => (
                        <div
                            key={holder.phone}
                            className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"
                        >
                            <div className="min-w-[150px] flex-1">
                                <p className="text-[13px] font-bold text-slate-200">
                                    {holder.name || holder.phone}
                                </p>
                                {holder.name && (
                                    <p className="text-[11px] text-slate-500">{holder.phone}</p>
                                )}
                            </div>

                            <p className="text-[15px] font-bold text-emerald-300">
                                ₹{holder.balance.toLocaleString('en-IN')}
                            </p>

                            <button
                                type="button"
                                onClick={() => {
                                    setPhone(holder.phone);
                                    setMode('spend');
                                }}
                                className="rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 transition-colors hover:text-white"
                            >
                                Use
                            </button>
                        </div>
                    ))}
                </div>
            </section>

            {recent.length > 0 && (
                <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
                    <h3 className="mb-4 text-sm font-bold text-slate-200">Recent activity</h3>
                    <div className="flex flex-col gap-1.5">
                        {recent.map((entry) => (
                            <div
                                key={entry.id}
                                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                                style={{ background: 'rgba(255,255,255,0.02)' }}
                            >
                                <span className="text-[12px] text-slate-300">{entry.phone}</span>
                                <span className="text-[11px] text-slate-500">
                                    {REASON_LABELS[entry.reason] || entry.reason}
                                    {entry.paymentMode ? ` · ${entry.paymentMode}` : ''} ·{' '}
                                    {formatWhen(entry.createdAt)}
                                </span>
                                <span
                                    className="text-[13px] font-bold"
                                    style={{ color: entry.amount >= 0 ? '#4ade80' : '#f59e0b' }}
                                >
                                    {entry.amount >= 0 ? '+' : '−'}₹{Math.abs(entry.amount)}
                                </span>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
