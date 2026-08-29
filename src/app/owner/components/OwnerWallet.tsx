'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    Chips,
    EmptyRow,
    Field,
    Kpis,
    Panel,
    PrimaryButton,
    SectionBar,
    TableHead,
    TableRow,
} from './consoleUi';

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

    const COLUMNS = 'minmax(140px,1.4fr) minmax(120px,1fr) 120px 132px';
    const inCredit = holders.filter((holder) => holder.balance > 0);

    const exportWalletsCsv = () => {
        const header = ['Customer', 'Phone', 'Balance'];
        const rows = visible.map((h) => [h.name || '', h.phone, String(h.balance)]);
        const escape = (cell: string) => `"${String(cell).replace(/"/g, '""')}"`;
        const csv = [header, ...rows].map((cols) => cols.map(escape).join(',')).join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `wallets-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="flex flex-col gap-[18px]">
            <Kpis
                items={[
                    {
                        label: 'HELD FOR CUSTOMERS',
                        value: `₹${totalHeld.toLocaleString('en-IN')}`,
                        tone: 'lime',
                        sub: 'money already taken, not yet played',
                    },
                    {
                        label: 'IN CREDIT',
                        value: String(inCredit.length),
                        sub: `of ${holders.length} with a wallet here`,
                    },
                    {
                        label: 'BIGGEST BALANCE',
                        value: `₹${Math.max(0, ...holders.map((h) => h.balance)).toLocaleString('en-IN')}`,
                        sub: inCredit.length > 0 ? 'one customer' : 'nobody in credit',
                    },
                    {
                        label: 'RECENT MOVES',
                        value: String(recent.length),
                        sub: 'top-ups and spends logged',
                    },
                ]}
            />

            {/* Taking money in, or putting a spend against it. One panel
                because they are the same form with the sign flipped. */}
            <Panel className="flex flex-col gap-3 px-4 py-4">
                <div className="flex flex-wrap items-center gap-[9px]">
                    <Chips
                        items={[
                            { id: 'topup', label: 'TAKE MONEY IN' },
                            { id: 'spend', label: 'SPEND FROM WALLET' },
                        ]}
                        active={mode}
                        onPick={(id) => setMode(id as 'topup' | 'spend')}
                    />
                    <span className="h-px min-w-[20px] flex-1 bg-[#f2f0ea]/10" />
                    {lookedUpBalance !== null && (
                        <span className="whitespace-nowrap font-mono text-[10.5px] text-[#d8ff3c]">
                            BALANCE ₹{lookedUpBalance.toLocaleString('en-IN')}
                        </span>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Field value={phone} onChange={setPhone} placeholder="10-DIGIT NUMBER" className="w-[170px]" />
                    <Field value={amount} onChange={setAmount} placeholder="AMOUNT" type="number" className="w-[120px]" />
                    <Chips
                        items={[
                            { id: 'cash', label: 'CASH' },
                            { id: 'upi', label: 'UPI' },
                        ]}
                        active={paymentMode}
                        onPick={setPaymentMode}
                    />
                    <Field value={reference} onChange={setReference} placeholder="REFERENCE (OPTIONAL)" className="w-[190px]" />
                    <PrimaryButton onClick={submit} disabled={saving}>
                        {saving ? 'SAVING…' : mode === 'topup' ? 'ADD TO WALLET' : 'TAKE FROM WALLET'}
                    </PrimaryButton>
                </div>
            </Panel>

            {notice && (
                <div className="border border-[#d8ff3c]/[0.28] bg-[#d8ff3c]/[0.06] px-[15px] py-3 font-mono text-[10.5px] tracking-[0.1em] text-[#d8ff3c]">
                    {notice}
                </div>
            )}
            {error && (
                <div className="border border-[#ff5c2b]/[0.28] bg-[#ff5c2b]/[0.06] px-[15px] py-3 font-mono text-[10.5px] tracking-[0.1em] text-[#ff5c2b]">
                    {error}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-[9px]">
                <SectionBar
                    title="WALLETS"
                    action={
                        <Field
                            value={search}
                            onChange={setSearch}
                            placeholder="FIND BY NAME OR NUMBER"
                            className="w-[220px]"
                        />
                    }
                />
            </div>

            <Panel>
                <TableHead columns={COLUMNS}>
                    <span>CUSTOMER</span>
                    <span>BALANCE</span>
                    <span className="text-right">LAST MOVE</span>
                    <span className="text-right">ACTIONS</span>
                </TableHead>

                {visible.length === 0 ? (
                    <EmptyRow>
                        {holders.length === 0
                            ? 'No wallets yet. Take money in above and one is created against that number.'
                            : 'Nobody matches that search.'}
                    </EmptyRow>
                ) : (
                    visible.map((holder) => {
                        const last = recent.find((entry) => entry.phone === holder.phone);

                        return (
                            <TableRow
                                key={holder.phone}
                                columns={COLUMNS}
                                edge={holder.balance > 0 ? 'rgba(216,255,60,.4)' : 'transparent'}
                            >
                                <div className="flex min-w-0 flex-col gap-[3px]">
                                    <span className="truncate text-[13.5px] font-bold text-[#f2f0ea]">
                                        {holder.name || 'No name'}
                                    </span>
                                    <span className="whitespace-nowrap font-mono text-[10px] text-[#f2f0ea]/35">
                                        {holder.phone}
                                    </span>
                                </div>

                                <span
                                    className="whitespace-nowrap text-[15px] font-extrabold"
                                    style={{ color: holder.balance > 0 ? '#d8ff3c' : 'rgba(242,240,234,.35)' }}
                                >
                                    ₹{holder.balance.toLocaleString('en-IN')}
                                </span>

                                <div className="flex flex-col gap-[3px] text-right">
                                    {last ? (
                                        <>
                                            <span className="whitespace-nowrap font-mono text-[11px] text-[#f2f0ea]/70">
                                                {last.amount >= 0 ? '+' : '−'}₹{Math.abs(last.amount).toLocaleString('en-IN')}
                                            </span>
                                            <span className="whitespace-nowrap font-mono text-[10px] text-[#f2f0ea]/35">
                                                {(REASON_LABELS[last.reason] || last.reason).toUpperCase()} ·{' '}
                                                {formatWhen(last.createdAt).toUpperCase()}
                                            </span>
                                        </>
                                    ) : (
                                        <span className="font-mono text-[10.5px] text-[#f2f0ea]/30">—</span>
                                    )}
                                </div>

                                <div className="flex justify-end gap-[5px]">
                                    <button
                                        type="button"
                                        title="Take money in for this customer"
                                        onClick={() => { setPhone(holder.phone); setMode('topup'); }}
                                        className="flex h-[26px] items-center border border-[#f2f0ea]/[0.14] px-[9px] font-mono text-[9.5px] tracking-[0.1em] text-[#f2f0ea]/55 transition-colors hover:border-[#d8ff3c] hover:text-[#d8ff3c]"
                                    >
                                        + TOP UP
                                    </button>
                                    <button
                                        type="button"
                                        title="Put a spend against this wallet"
                                        onClick={() => { setPhone(holder.phone); setMode('spend'); }}
                                        className="flex h-[26px] items-center border border-[#f2f0ea]/[0.14] px-[9px] font-mono text-[9.5px] tracking-[0.1em] text-[#f2f0ea]/55 transition-colors hover:border-[#f2f0ea] hover:text-[#f2f0ea]"
                                    >
                                        − SPEND
                                    </button>
                                </div>
                            </TableRow>
                        );
                    })
                )}

                <div className="flex items-center gap-3.5 border-t border-[#f2f0ea]/10 px-4 py-3 font-mono text-[10.5px] text-[#f2f0ea]/40">
                    <span className="truncate">
                        {visible.length} of {holders.length} wallets · {loading ? 'loading…' : `₹${totalHeld.toLocaleString('en-IN')} held in total`}
                    </span>
                    <span className="flex-1" />
                    <button
                        type="button"
                        onClick={exportWalletsCsv}
                        disabled={visible.length === 0}
                        className="whitespace-nowrap tracking-[0.14em] transition-colors hover:text-[#d8ff3c] disabled:opacity-40"
                    >
                        EXPORT CSV →
                    </button>
                </div>
            </Panel>
        </div>
    );
}
