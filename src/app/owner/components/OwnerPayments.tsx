'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    Chips,
    EmptyRow,
    Field,
    Kpis,
    Panel,
    PrimaryButton,
    TableHead,
    TableRow,
    Tag,
} from './consoleUi';

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
    const verified = claims.filter((claim) => claim.status === 'verified');
    const rejected = claims.filter((claim) => claim.status === 'rejected');
    const mismatched = waiting.filter((claim) => !claim.amountMatches);

    const shown =
        filter === 'waiting' ? waiting
        : filter === 'verified' ? verified
        : filter === 'rejected' ? rejected
        : claims;

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
                    <span className="text-right">REFERENCE</span>
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
                                        {claim.bookingDate || '—'}
                                    </span>
                                    <span className="whitespace-nowrap font-mono text-[10px] text-[#f2f0ea]/35">
                                        {claim.startTime || ''}
                                    </span>
                                </div>

                                <div className="flex justify-end">
                                    <span className="truncate font-mono text-[10.5px] text-[#f2f0ea]/60">
                                        {claim.reference || 'NO REF'}
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

                <div className="flex items-center gap-3.5 border-t border-[#f2f0ea]/10 px-4 py-3 font-mono text-[10.5px] leading-[1.7] text-[#f2f0ea]/40">
                    {/* Said plainly, because the button says CONFIRM and it
                        would be easy to read that as the app having checked. */}
                    NOTHING HERE CAN SEE YOUR BANK. CONFIRM MEANS YOU CHECKED AND THE MONEY IS THERE.
                </div>
            </Panel>
        </div>
    );
}
