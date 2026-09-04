'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    Chips,
    WhatToFix,
    type Insight,
    EmptyRow,
    Field,
    Kpis,
    Panel,
    PrimaryButton,
    TableHead,
    TableRow,
    Tag,
} from './consoleUi';
import { ownerApi } from '../ownerApi';

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
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [actioningId, setActioningId] = useState<string | null>(null);

    const [upi, setUpi] = useState(upiId || '');
    const [payeeName, setPayeeName] = useState(upiDisplayName || '');
    const [savingUpi, setSavingUpi] = useState(false);
    const [filter, setFilter] = useState('waiting');

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
            await ownerApi('/api/owner/payments', {
                method: 'PUT',
                body: { cafeId, claimId, action },
                fallbackMessage: 'Could not save',
            });
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
    const verified = claims.filter((claim) => claim.status === 'verified');
    const rejected = claims.filter((claim) => claim.status === 'rejected');
    const mismatched = waiting.filter((claim) => !claim.amountMatches);

    const shown =
        filter === 'waiting' ? waiting
        : filter === 'verified' ? verified
        : filter === 'rejected' ? rejected
        : claims;

    // How the week's money actually arrived. The bookings endpoint already
    // totals cash and UPI for a range, so this is one call rather than a
    // second tally of the same rows.
    const [arrivals, setArrivals] = useState<{ cash: number; upi: number } | null>(null);
    useEffect(() => {
        if (!cafeId) return;
        let cancelled = false;
        const to = new Date();
        const from = new Date(to);
        from.setDate(from.getDate() - 6);
        const iso = (d: Date) => d.toISOString().slice(0, 10);
        fetch(`/api/owner/bookings?cafeId=${cafeId}&page=1&pageSize=1&dateFrom=${iso(from)}&dateTo=${iso(to)}`,
            { credentials: 'include' })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (cancelled || !data?.summary) return;
                setArrivals({
                    cash: Number(data.summary.cashTotal) || 0,
                    upi: Number(data.summary.upiTotal) || 0,
                });
            })
            .catch(() => { /* the section stays hidden */ });
        return () => { cancelled = true; };
    }, [cafeId]);

    /** What the claim queue and the week's takings are saying. */
    const insights: Insight[] = (() => {
        const out: Insight[] = [];

        // Claims where the amount does not match the booking.
        if (mismatched.length > 0) {
            out.push({
                id: 'mismatch',
                tone: 'orange',
                title: `${mismatched.length} ${mismatched.length === 1 ? 'claim does' : 'claims do'} not match the booking amount`,
                detail: 'Somebody says they sent a different figure to the one owed. Check these against the bank before confirming — the app cannot see your account.',
            });
        }

        // A queue that has been left sitting.
        if (waiting.length > 0) {
            const owed = waiting.reduce((sum, c) => sum + c.amount, 0);
            out.push({
                id: 'waiting',
                tone: 'orange',
                title: `${waiting.length} ${waiting.length === 1 ? 'claim is' : 'claims are'} waiting on you, worth ₹${owed.toLocaleString('en-IN')}`,
                detail: 'Each one is a customer who believes they have paid. Until it is confirmed the booking still reads unpaid at the counter.',
            });
        }

        // Cash-heavy weeks mean this screen sees very little of the money.
        if (arrivals && arrivals.cash + arrivals.upi > 0) {
            const total = arrivals.cash + arrivals.upi;
            const onlineShare = Math.round((arrivals.upi / total) * 100);
            if (onlineShare < 40) {
                out.push({
                    id: 'cash-heavy',
                    tone: 'ink',
                    title: `${100 - onlineShare}% of this week's money was cash`,
                    detail: `₹${arrivals.cash.toLocaleString('en-IN')} counted at the counter against ₹${arrivals.upi.toLocaleString('en-IN')} online. This screen only ever shows the online part, so most of the week never appears here.`,
                });
            }
        }

        // No UPI id means nobody can pay online at all.
        if (!upiId) {
            out.push({
                id: 'no-upi',
                tone: 'orange',
                title: 'No UPI id is set, so nobody can pay online',
                detail: 'Every customer is sent to the counter and no QR can be shown. Adding one above is the difference between this screen having anything on it and not.',
            });
        }

        return out;
    })();

    const exportClaimsCsv = () => {
        const header = ['When', 'Reference', 'Customer', 'Phone', 'Booking date', 'Start', 'Claimed', 'Expected', 'Status'];
        const rows = shown.map((c) => [
            c.createdAt,
            c.reference || '',
            c.customerName || 'Guest',
            c.customerPhone || '',
            c.bookingDate || '',
            c.startTime || '',
            String(c.amount),
            String(c.expectedAmount),
            c.status,
        ]);
        const escape = (cell: string) => `"${String(cell).replace(/"/g, '""')}"`;
        const csv = [header, ...rows].map((cols) => cols.map(escape).join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `payment-claims-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const COLUMNS = '96px minmax(130px,1.3fr) minmax(120px,1fr) 104px 100px 132px';

    return (
        <div className="flex flex-col gap-[18px]">
            <Kpis
                items={[
                    {
                        label: 'WAITING ON YOU',
                        value: String(waiting.length),
                        tone: waiting.length > 0 ? 'orange' : 'ink',
                        sub: `₹${waiting.reduce((sum, c) => sum + c.amount, 0).toLocaleString('en-IN')} claimed`,
                    },
                    {
                        label: 'AMOUNT MISMATCH',
                        value: String(mismatched.length),
                        tone: mismatched.length > 0 ? 'orange' : 'ink',
                        sub: mismatched.length > 0 ? 'check these first' : 'all claims match',
                    },
                    {
                        label: 'CONFIRMED',
                        value: String(verified.length),
                        tone: 'lime',
                        sub: `₹${verified.reduce((sum, c) => sum + c.amount, 0).toLocaleString('en-IN')} taken`,
                    },
                    {
                        label: 'NOT RECEIVED',
                        value: String(rejected.length),
                        sub: rejected.length > 0 ? 'marked as never arrived' : 'none turned away',
                    },
                ]}
            />

            {/* Where the money is told to go. Wrong here means every UPI QR in
                the café points at nobody, so it sits above the queue. */}
            <Panel className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                <span className="whitespace-nowrap font-mono text-[10px] tracking-[0.16em] text-[#d8ff3c]">
                    PAID INTO
                </span>
                <Field value={upi} onChange={setUpi} placeholder="yourname@bank" className="w-[220px]" />
                <Field
                    value={payeeName}
                    onChange={setPayeeName}
                    placeholder={cafeName || 'Name on the account'}
                    className="w-[180px]"
                />
                <PrimaryButton onClick={saveUpi} disabled={savingUpi}>
                    {savingUpi ? 'SAVING…' : 'SAVE UPI ID'}
                </PrimaryButton>
                <span className="min-w-[10px] flex-1" />
                <span className="font-mono text-[10.5px] text-[#f2f0ea]/40">
                    {upiId ? 'CUSTOMERS CAN PAY ONLINE' : 'NO UPI ID · CUSTOMERS ARE SENT TO THE COUNTER'}
                </span>
            </Panel>

            {notice && (
                <div className="border border-[#d8ff3c]/[0.28] bg-[#d8ff3c]/[0.06] px-[15px] py-3 font-mono text-[10.5px] leading-[1.6] tracking-[0.1em] text-[#d8ff3c]">
                    {notice}
                </div>
            )}
            {error && (
                <div className="border border-[#ff5c2b]/[0.28] bg-[#ff5c2b]/[0.06] px-[15px] py-3 font-mono text-[10.5px] tracking-[0.1em] text-[#ff5c2b]">
                    {error}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-[9px]">
                <Chips
                    items={[
                        { id: 'waiting', label: 'WAITING', count: waiting.length },
                        { id: 'verified', label: 'CONFIRMED', count: verified.length },
                        { id: 'rejected', label: 'NOT RECEIVED', count: rejected.length },
                        { id: 'all', label: 'ALL', count: claims.length },
                    ]}
                    active={filter}
                    onPick={setFilter}
                />
                <span className="h-px min-w-[20px] flex-1 bg-[#f2f0ea]/10" />
                <span className="whitespace-nowrap font-mono text-[10.5px] text-[#f2f0ea]/40">
                    {loading ? 'LOADING…' : `${settled.length} SETTLED`}
                </span>
            </div>

            <Panel>
                <TableHead columns={COLUMNS}>
                    <span>WHEN</span>
                    <span>CUSTOMER</span>
                    <span>AGAINST</span>
                    <span className="text-right">MODE</span>
                    <span className="text-right">AMOUNT</span>
                    <span className="text-right">ACTIONS</span>
                </TableHead>

                {shown.length === 0 ? (
                    <EmptyRow>
                        {claims.length === 0
                            ? 'No payment claims yet. They appear the moment a customer says they have paid.'
                            : 'Nothing under this filter.'}
                    </EmptyRow>
                ) : (
                    shown.map((claim) => {
                        const isWaiting = claim.status === 'claimed';
                        const edge = isWaiting
                            ? claim.amountMatches ? '#d8ff3c' : '#ff5c2b'
                            : claim.status === 'verified' ? 'rgba(216,255,60,.4)' : 'rgba(242,240,234,.2)';

                        return (
                            <TableRow key={claim.id} columns={COLUMNS} edge={edge}>
                                <div className="flex min-w-0 flex-col gap-[3px]">
                                    <span className="whitespace-nowrap font-mono text-[11.5px] text-[#f2f0ea]/80">
                                        {formatWhen(claim.createdAt).toUpperCase()}
                                    </span>
                                    <span className="whitespace-nowrap font-mono text-[10px] text-[#f2f0ea]/35">
                                        #{claim.shortId}
                                    </span>
                                </div>

                                <div className="flex min-w-0 flex-col gap-[3px]">
                                    <span className="truncate text-[13.5px] font-bold text-[#f2f0ea]">
                                        {claim.customerName || 'Guest'}
                                    </span>
                                    <span className="whitespace-nowrap font-mono text-[10px] text-[#f2f0ea]/35">
                                        {claim.customerPhone || '—'}
                                    </span>
                                </div>

                                <div className="flex min-w-0 flex-col gap-[3px]">
                                    <span className="truncate font-mono text-[11.5px] text-[#f2f0ea]/75">
                                        {claim.bookingDate || '—'}{claim.startTime ? ` · ${claim.startTime}` : ''}
                                    </span>
                                    {/* The reference belongs with what it references,
                                        which is where the design puts it. */}
                                    <span className="truncate font-mono text-[10px] text-[#f2f0ea]/35">
                                        {claim.reference || 'NO REF'}
                                    </span>
                                </div>

                                {/* Every claim on this screen is someone saying they
                                    sent money online — cash never becomes a claim. */}
                                <div className="flex justify-end">
                                    <span className="whitespace-nowrap bg-[#d8ff3c]/[0.12] px-2 py-1 font-mono text-[9.5px] tracking-[0.1em] text-[#d8ff3c]">
                                        UPI
                                    </span>
                                </div>

                                <div className="flex min-w-0 flex-col gap-[3px] text-right">
                                    <span
                                        className="whitespace-nowrap text-[13.5px] font-extrabold"
                                        style={{ color: claim.amountMatches ? '#f2f0ea' : '#ff5c2b' }}
                                    >
                                        ₹{claim.amount.toLocaleString('en-IN')}
                                    </span>
                                    {/* The one number worth arguing with: what
                                        they say they sent against what the
                                        booking costs. */}
                                    <span
                                        className="whitespace-nowrap font-mono text-[10px]"
                                        style={{ color: claim.amountMatches ? 'rgba(242,240,234,.35)' : '#ff5c2b' }}
                                    >
                                        {claim.amountMatches
                                            ? claim.status.toUpperCase()
                                            : `EXPECTED ₹${claim.expectedAmount.toLocaleString('en-IN')}`}
                                    </span>
                                </div>

                                <div className="flex justify-end gap-[5px]">
                                    {isWaiting ? (
                                        <>
                                            <button
                                                type="button"
                                                disabled={actioningId === claim.id}
                                                onClick={() => act(claim.id, 'verify')}
                                                title="Confirm the money arrived — this releases the booking"
                                                className="flex h-[26px] items-center border border-[#d8ff3c] bg-[#d8ff3c]/[0.10] px-[9px] font-mono text-[9.5px] tracking-[0.1em] text-[#d8ff3c] transition-colors hover:bg-[#d8ff3c]/20 disabled:opacity-40"
                                            >
                                                {actioningId === claim.id ? '…' : 'CONFIRM'}
                                            </button>
                                            <button
                                                type="button"
                                                disabled={actioningId === claim.id}
                                                onClick={() => act(claim.id, 'reject')}
                                                title="Mark as never received"
                                                className="flex h-[26px] items-center border border-[#f2f0ea]/[0.14] px-[9px] font-mono text-[9.5px] tracking-[0.1em] text-[#f2f0ea]/55 transition-colors hover:border-[#ff5c2b] hover:text-[#ff5c2b] disabled:opacity-40"
                                            >
                                                NO
                                            </button>
                                        </>
                                    ) : (
                                        <Tag tone={claim.status === 'verified' ? 'lime' : 'muted'}>
                                            {claim.status.toUpperCase()}
                                        </Tag>
                                    )}
                                </div>
                            </TableRow>
                        );
                    })
                )}

                <div className="flex flex-wrap items-center gap-3.5 border-t border-[#f2f0ea]/10 px-4 py-3 font-mono text-[10.5px] leading-[1.7] text-[#f2f0ea]/40">
                    {/* Said plainly, because the button says CONFIRM and it
                        would be easy to read that as the app having checked. */}
                    <span className="min-w-0 flex-1">
                        NOTHING HERE CAN SEE YOUR BANK. CONFIRM MEANS YOU CHECKED AND THE MONEY IS THERE.
                    </span>
                    <button
                        type="button"
                        onClick={exportClaimsCsv}
                        disabled={shown.length === 0}
                        className="whitespace-nowrap tracking-[0.14em] transition-colors hover:text-[#d8ff3c] disabled:opacity-40"
                    >
                        EXPORT CSV →
                    </button>
                </div>
            </Panel>

            {/* Cash against online over the week. This screen only ever shows
                the online half as claims, so without this an owner cannot see
                what share of takings it even represents. */}
            {arrivals && arrivals.cash + arrivals.upi > 0 && (
                <section>
                    <div className="mb-3 flex items-center gap-3">
                        <span className="whitespace-nowrap font-mono text-[10px] tracking-[0.2em] text-[#f2f0ea]/50">
                            HOW MONEY ARRIVES · 7D
                        </span>
                        <span className="h-px flex-1 bg-[#f2f0ea]/10" />
                        <span className="whitespace-nowrap font-mono text-[10px] text-[#f2f0ea]/40">
                            ₹{(arrivals.cash + arrivals.upi).toLocaleString('en-IN')} taken
                        </span>
                    </div>
                    <div className="flex flex-col gap-px border border-[#f2f0ea]/10 bg-[#f2f0ea]/10">
                        {([
                            { key: 'cash', label: 'CASH', value: arrivals.cash, note: 'counted at the counter', tone: '#f2f0ea' },
                            { key: 'upi', label: 'UPI / ONLINE', value: arrivals.upi, note: 'confirmed against a claim', tone: '#d8ff3c' },
                        ] as const).map((row) => {
                            const total = arrivals.cash + arrivals.upi;
                            const share = total > 0 ? Math.round((row.value / total) * 100) : 0;
                            return (
                                <div
                                    key={row.key}
                                    className="grid items-center gap-3 bg-[#111113] px-4 py-3"
                                    style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,100px) 96px' }}
                                >
                                    <div className="flex min-w-0 flex-col gap-[3px]">
                                        <span className="truncate font-mono text-[11px] tracking-[0.08em]" style={{ color: row.tone }}>
                                            {row.label}
                                        </span>
                                        <span className="truncate font-mono text-[10px] text-[#f2f0ea]/35">
                                            {share}% · {row.note}
                                        </span>
                                    </div>
                                    <div className="h-1.5 bg-[#f2f0ea]/[0.08]">
                                        <div className="h-1.5" style={{ width: `${share}%`, background: row.tone }} />
                                    </div>
                                    <span className="whitespace-nowrap text-right font-mono text-[11.5px]" style={{ color: row.tone }}>
                                        ₹{row.value.toLocaleString('en-IN')}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            <WhatToFix items={insights} />
        </div>
    );
}
