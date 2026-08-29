'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useMemo, useRef, useState } from 'react';
import { parseTimeToMinutes } from "@/lib/timeUtils";
import { ConsoleId, CONSOLE_LABELS } from '@/lib/constants';
import { getBookingItemDurationMinutes, isBookingActiveNow, isBookingItemActiveNow } from '@/lib/bookingFilters';
import { getBookingRevenueTotal } from '@/lib/ownerRevenue';

interface SessionEndedInfo {
    customerName: string;
    stationName: string;
    duration: number;
}

function parseStartMinutes(startTime: string): number | null {
    return parseTimeToMinutes(startTime);
}

function calcTimeRemaining(startMinutes: number, duration: number, currentMinutes: number): number {
    const endMinutes = startMinutes + duration;
    if (endMinutes > 1440) {
        const remaining = currentMinutes < startMinutes
            ? (endMinutes - 1440) - currentMinutes
            : endMinutes - currentMinutes;
        return remaining;
    }
    return endMinutes - currentMinutes;
}

interface ActiveSessionsProps {
    bookings: any[];
    subscriptions: any[];
    activeTimers: Map<string, any>;
    timerElapsed: Map<string, number>;
    currentTime: Date;
    onAddTime?: (booking: any) => void;
    onAddItems?: (bookingId: string, customerName: string) => void;
    /** Opens the booking behind this session, as the design's ✎ EDIT does. */
    onEdit?: (booking: any) => void;
    onSessionEnded?: (info: SessionEndedInfo) => void;
    onEndCollect?: (bookingId: string, paymentMode: 'cash' | 'upi') => void;
    onEndMembership?: (subscriptionId: string) => Promise<void> | void;
    /** Unlocks or locks the physical machine(s) attached to this booking. */
    onStationCommand?: (bookingId: string, action: 'unlock' | 'lock') => Promise<void> | void;
}

export function ActiveSessions({
    bookings,
    subscriptions,
    activeTimers,
    timerElapsed,
    currentTime,
    onAddTime,
    onAddItems,
    onEdit,
    onSessionEnded,
    onEndCollect,
    onEndMembership,
    onStationCommand,
}: ActiveSessionsProps) {
    // Which card is mid-request, so the buttons can be disabled and show progress.
    const [stationBusyId, setStationBusyId] = useState<string | null>(null);
    const endedSessionsRef = useRef<Set<string>>(new Set());
    // Clear ended-session tracking when bookings list changes (prevents unbounded Set growth)
    useEffect(() => {
        const activeIds = new Set(bookings.map((b: any) => b.id));
        endedSessionsRef.current.forEach(id => {
            if (!activeIds.has(id)) endedSessionsRef.current.delete(id);
        });
    }, [bookings]);

    // Track which card has the End & Collect panel open
    const [endCollectId, setEndCollectId] = useState<string | null>(null);
    const [endCollectPayment, setEndCollectPayment] = useState<'cash' | 'upi'>('cash');
    const [endingMembershipId, setEndingMembershipId] = useState<string | null>(null);
    const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

    // 1. Filter and Flatten Bookings
    const activeBookings = bookings.filter(
        (booking) => !booking.deleted_at && isBookingActiveNow(booking, currentTime)
    );

    const activeMemberships = subscriptions.filter((sub) => activeTimers.has(sub.id));


    const flattenedBookings = activeBookings.flatMap((booking) => {
        const items = booking.booking_items || [];
        if (items.length === 0) return [booking];

        const activeItems = items
            .map((item: any, itemIndex: number) => ({ item, itemIndex }))
            .filter(({ item }: { item: any }) => isBookingItemActiveNow(booking, item, currentTime));

        if (items.length === 1) return activeItems.length > 0 ? [booking] : [];

        return activeItems.map(({ item, itemIndex }: { item: any; itemIndex: number }) => ({
            ...booking,
            id: `${booking.id}-item-${item.id || itemIndex}`,
            originalBookingId: booking.id,
            booking_items: [item],
        }));
    });

    // Compute sort keys once per minute (not every second) so cards don't shuffle every tick
    const sortMinute = currentTime.getHours() * 60 + currentTime.getMinutes();
    const sortedActiveBookings = useMemo(() => {
        return [...flattenedBookings].sort((a, b) => {
            const getTimeRemaining = (booking: typeof a) => {
                if (!booking.start_time) return 999;
                const bi = booking.booking_items?.[0];
                const duration = getBookingItemDurationMinutes(bi, booking.duration || 60);
                if (!duration) return 999;
                const startMinutes = parseStartMinutes(booking.start_time);
                if (startMinutes === null) return 999;
                return Math.max(0, calcTimeRemaining(startMinutes, duration, sortMinute));
            };
            return getTimeRemaining(a) - getTimeRemaining(b);
        });
    }, [flattenedBookings, sortMinute]);

    const getConsoleLabel = (consoleName: string) => {
        const key = consoleName?.toLowerCase() as ConsoleId;
        return CONSOLE_LABELS[key] || consoleName;
    };

    // Fire session-ended callback once when time hits 0
    useEffect(() => {
        if (!onSessionEnded) return;
        sortedActiveBookings.forEach((booking) => {
            const bookingId = booking.id;
            if (endedSessionsRef.current.has(bookingId)) return;
            if (!booking.start_time) return;
            const bi = booking.booking_items?.[0];
            const duration = getBookingItemDurationMinutes(bi, booking.duration || 60);
            if (!duration) return;
            const startMinutes = parseStartMinutes(booking.start_time);
            if (startMinutes === null) return;
            const timeRemaining = calcTimeRemaining(startMinutes, duration, currentMinutes);
            if (timeRemaining <= 0) {
                const consoleType = booking.booking_items?.[0]?.console?.toUpperCase() || 'UNKNOWN';
                const isWalkIn = booking.source === 'walk-in';
                const customerName = isWalkIn ? booking.customer_name : (booking.user_name || 'Guest');
                endedSessionsRef.current.add(bookingId);
                onSessionEnded({ customerName, stationName: consoleType, duration });
            }
        });
    }, [currentMinutes, currentTime, sortedActiveBookings, onSessionEnded]);

    if (sortedActiveBookings.length === 0 && activeMemberships.length === 0) {
        return (
            <div className="flex flex-col gap-3 border border-dashed border-[#f2f0ea]/[0.16] bg-[#111113] p-[26px]">
                <span className="font-mono text-[11.5px] text-[#f2f0ea]/45">
                    No live sessions right now. Start one to see it on the floor.
                </span>
            </div>
        );
    }

    return (
        <div
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))' }}
        >
            {/* ── memberships on the clock ── */}
            {activeMemberships.map((sub: any) => {
                const planDetails = sub.membership_plans || {};
                const elapsedSeconds = timerElapsed.get(sub.id) || 0;
                const isDayPass = planDetails.plan_type === 'day_pass';
                const isUnlimited = sub.is_unlimited === true;
                const consoleType = planDetails.console_type?.toUpperCase() || 'UNKNOWN';
                const stationName = sub.assigned_console_station?.toUpperCase() || `${consoleType}-??`;
                const hours = Math.floor(elapsedSeconds / 3600);
                const minutes = Math.floor((elapsedSeconds % 3600) / 60);
                const seconds = elapsedSeconds % 60;
                const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                const isEnding = endingMembershipId === sub.id;

                const handleEndMembership = async () => {
                    if (!onEndMembership || isEnding) return;
                    try {
                        setEndingMembershipId(sub.id);
                        await onEndMembership(sub.id);
                    } finally {
                        setEndingMembershipId(null);
                    }
                };

                return (
                    <div
                        key={sub.id}
                        className="flex flex-col border border-[#f2f0ea]/10 bg-[#111113]"
                        style={{ borderTop: '2px solid #d8ff3c' }}
                    >
                        <div className="flex items-center gap-2.5 px-4 pb-[11px] pt-[13px]">
                            <span className="h-[7px] w-[7px] shrink-0 animate-pulse bg-[#d8ff3c]" />
                            <span className="font-mono text-[11.5px] font-semibold tracking-[0.02em] text-[#f2f0ea]/90">
                                {stationName}
                            </span>
                            <span className="flex-1" />
                            <span className="font-mono text-[9px] tracking-[0.16em] text-[#d8ff3c]">MEMBERSHIP</span>
                        </div>

                        <div className="flex items-end gap-3.5 px-4 pb-3.5">
                            <div className="flex min-w-0 flex-col gap-1">
                                <span className="truncate text-xl font-extrabold leading-[1.1] tracking-[-0.015em] text-[#f2f0ea]">
                                    {sub.customer_name}
                                </span>
                                <span className="font-mono text-[10.5px] text-[#f2f0ea]/40">
                                    {planDetails.name || 'Membership'}
                                </span>
                            </div>
                            <span className="flex-1" />
                            <div className="flex flex-col items-end gap-0.5">
                                <span className="font-mono text-[26px] font-bold leading-[0.85] tracking-[-0.02em] text-[#d8ff3c]">
                                    {timeString}
                                </span>
                                <span className="font-mono text-[9.5px] tracking-[0.12em] text-[#f2f0ea]/40">
                                    {isUnlimited ? 'UNLIMITED · ELAPSED' : isDayPass ? 'DAY PASS · ELAPSED' : 'ELAPSED'}
                                </span>
                            </div>
                        </div>

                        {onEndMembership && (
                            <button
                                type="button"
                                onClick={handleEndMembership}
                                disabled={isEnding}
                                // mt-auto so the card's one action sits on its bottom
                                // edge like the booking cards beside it. Without it
                                // the button floated mid-card over dead space.
                                className="mt-auto border-t border-[#f2f0ea]/10 bg-[#d8ff3c] py-3.5 font-mono text-[11px] font-semibold tracking-[0.16em] text-[#0b0b0c] transition-transform hover:-translate-y-px disabled:opacity-60"
                            >
                                {isEnding ? 'ENDING…' : isDayPass ? 'END DAY PASS' : 'STOP MEMBERSHIP'}
                            </button>
                        )}
                    </div>
                );
            })}

            {/* ── machines in use ── */}
            {sortedActiveBookings.map((booking, index) => {
                const consoleInfo = booking.booking_items?.[0];
                const isWalkIn = booking.source === 'walk-in';

                let timeRemaining = 0;
                let endTime = '';
                const itemDuration = getBookingItemDurationMinutes(consoleInfo, booking.duration || 60);

                if (booking.start_time && itemDuration) {
                    const startMinutes = parseStartMinutes(booking.start_time);
                    if (startMinutes !== null) {
                        timeRemaining = Math.max(0, calcTimeRemaining(startMinutes, itemDuration, currentMinutes));
                        const endTotalMinutes = (startMinutes + itemDuration) % 1440;
                        const endHours = Math.floor(endTotalMinutes / 60);
                        const endMins = endTotalMinutes % 60;
                        const endPeriod = endHours >= 12 ? 'pm' : 'am';
                        const endHours12 = endHours === 0 ? 12 : endHours > 12 ? endHours - 12 : endHours;
                        endTime = `${endHours12}:${endMins.toString().padStart(2, '0')} ${endPeriod}`;
                    }
                }

                const consoleType = consoleInfo?.console?.toUpperCase() || 'UNKNOWN';
                const titleParts = consoleInfo?.title?.split('|');
                const assignedStation = titleParts && titleParts.length > 1 ? titleParts[1].trim().toUpperCase() : null;
                const sameTypeBookings = sortedActiveBookings.filter(
                    (b, i) => i <= index && b.booking_items?.[0]?.console === consoleInfo?.console
                );
                const stationNumber = sameTypeBookings.length;
                const stationName = assignedStation || `${consoleType}-${String(stationNumber).padStart(2, '0')}`;

                // Thresholds: <=5 min is about to end, 5-15 min is close.
                const isCritical = timeRemaining <= 5;
                const isWarning = timeRemaining > 5 && timeRemaining <= 15;
                const accent = isCritical ? '#ff5c2b' : isWarning ? '#ffa53c' : '#d8ff3c';

                const bookingId = booking.originalBookingId || booking.id;
                const customerName = isWalkIn ? booking.customer_name : (booking.user_name || 'Guest');
                const phone = booking.customer_phone || booking.user_phone || '';
                const isShowingEndCollect = endCollectId === booking.id;
                const isUnpaid = (booking.status || '').toLowerCase() === 'pending';
                const amount = getBookingRevenueTotal(booking);
                const elapsedPct = itemDuration
                    ? Math.min(100, Math.max(0, ((itemDuration - timeRemaining) / itemDuration) * 100))
                    : 0;

                return (
                    <div
                        key={booking.id}
                        className="flex flex-col border border-[#f2f0ea]/10 bg-[#111113]"
                        style={{ borderTop: `2px solid ${accent}` }}
                    >
                        <div className="flex items-center gap-2.5 px-4 pb-[11px] pt-[13px]">
                            <span
                                className={`h-[7px] w-[7px] shrink-0 ${isCritical ? 'animate-pulse' : ''}`}
                                style={{ background: accent }}
                            />
                            <span className="font-mono text-[11.5px] font-semibold tracking-[0.02em] text-[#f2f0ea]/90">
                                {stationName}
                            </span>
                            <span className="flex-1" />
                            <span className="font-mono text-[9px] tracking-[0.16em]" style={{ color: accent }}>
                                {getConsoleLabel(consoleInfo?.console || '').toUpperCase()}
                            </span>
                        </div>

                        <div className="flex items-end gap-3.5 px-4 pb-3.5">
                            <div className="flex min-w-0 flex-col gap-1">
                                <span className="truncate text-xl font-extrabold leading-[1.1] tracking-[-0.015em] text-[#f2f0ea]">
                                    {customerName}
                                </span>
                                {phone && (
                                    <span className="font-mono text-[10.5px] text-[#f2f0ea]/40">{phone}</span>
                                )}
                            </div>
                            <span className="flex-1" />
                            <div className="flex flex-col items-end gap-0.5">
                                <span
                                    className="text-[32px] font-black leading-[0.85] tracking-[-0.03em]"
                                    style={{ color: accent }}
                                >
                                    {timeRemaining}
                                </span>
                                <span className="whitespace-nowrap font-mono text-[9.5px] tracking-[0.12em] text-[#f2f0ea]/40">
                                    MIN{endTime ? ` · ENDS ${endTime.toUpperCase()}` : ''}
                                </span>
                            </div>
                        </div>

                        <div className="mx-4 h-[3px] bg-[#f2f0ea]/[0.08]">
                            <div
                                className="h-[3px] transition-[width] duration-300"
                                style={{ width: `${elapsedPct}%`, background: accent }}
                            />
                        </div>

                        <div className="flex flex-wrap gap-1.5 px-4 pb-3.5 pt-[13px]">
                            <span
                                className="px-2 py-1 font-mono text-[9.5px] tracking-[0.12em]"
                                style={
                                    isUnpaid
                                        ? { background: 'rgba(255,92,43,.12)', color: '#ff5c2b' }
                                        : { background: 'rgba(216,255,60,.12)', color: '#d8ff3c' }
                                }
                            >
                                {isUnpaid ? 'UNPAID' : `PAID · ${(booking.payment_mode || 'CASH').toUpperCase()}`}
                            </span>
                            <span className="bg-[#f2f0ea]/[0.07] px-2 py-1 font-mono text-[9.5px] tracking-[0.12em] text-[#f2f0ea]/60">
                                {isWalkIn ? 'WALK-IN' : 'BOOKED'} · {itemDuration} MIN
                            </span>
                            {amount > 0 && (
                                <span className="bg-[#f2f0ea]/[0.07] px-2 py-1 font-mono text-[9.5px] tracking-[0.12em] text-[#f2f0ea]/60">
                                    ₹{amount.toLocaleString('en-IN')}
                                </span>
                            )}
                        </div>

                        {!isShowingEndCollect && (
                            <>
                                {/* The design's three: edit the booking, extend it,
                                    or add to the tab. The station controls below are
                                    this app's own and have no counterpart there. */}
                                <div
                                    className="grid gap-px border-t border-[#f2f0ea]/10 bg-[#f2f0ea]/10"
                                    style={{
                                        // Sized to what is actually rendered. Fixed at three,
                                        // a card without EDIT left an empty lit cell.
                                        gridTemplateColumns: `repeat(${[onEdit, onAddTime, onAddItems].filter(Boolean).length || 1}, minmax(0,1fr))`,
                                    }}
                                >
                                    {onEdit && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onEdit(booking); }}
                                            className="bg-[#111113] py-3 font-mono text-[10.5px] font-semibold tracking-[0.14em] text-[#f2f0ea] transition-colors hover:bg-[#1c1c20]"
                                        >
                                            ✎ EDIT
                                        </button>
                                    )}
                                    {onAddTime && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onAddTime(booking); }}
                                            className="bg-[#111113] py-3 font-mono text-[10.5px] font-semibold tracking-[0.14em] text-[#f2f0ea] transition-colors hover:bg-[#1c1c20]"
                                        >
                                            ＋ TIME
                                        </button>
                                    )}
                                    {onAddItems && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onAddItems(bookingId, customerName); }}
                                            className="bg-[#111113] py-3 font-mono text-[10.5px] font-semibold tracking-[0.14em] text-[#f2f0ea] transition-colors hover:bg-[#1c1c20]"
                                        >
                                            ＋ SNACK
                                        </button>
                                    )}
                                </div>

                                {onStationCommand && (
                                    <div className="grid grid-cols-2 gap-px border-t border-[#f2f0ea]/10 bg-[#f2f0ea]/10">
                                            <button
                                                type="button"
                                                // 'pending' is this app's "money not taken yet". The API
                                                // refuses these too; this only stops the button looking
                                                // available. Locking stays allowed whatever the state.
                                                title={isUnpaid ? 'Record the payment before starting this session' : undefined}
                                                disabled={isUnpaid || stationBusyId === bookingId}
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    setStationBusyId(bookingId);
                                                    try {
                                                        await onStationCommand(bookingId, 'unlock');
                                                    } finally {
                                                        setStationBusyId(null);
                                                    }
                                                }}
                                                className="bg-[#111113] py-3 font-mono text-[10.5px] font-semibold tracking-[0.14em] text-[#d8ff3c] transition-colors hover:bg-[#1c1c20] disabled:text-[#f2f0ea]/25"
                                            >
                                                {stationBusyId === bookingId ? 'SENDING…' : isUnpaid ? 'UNPAID' : 'UNLOCK'}
                                            </button>
                                            <button
                                                type="button"
                                                disabled={stationBusyId === bookingId}
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    setStationBusyId(bookingId);
                                                    try {
                                                        await onStationCommand(bookingId, 'lock');
                                                    } finally {
                                                        setStationBusyId(null);
                                                    }
                                                }}
                                                className="bg-[#111113] py-3 font-mono text-[10.5px] font-semibold tracking-[0.14em] text-[#f2f0ea]/70 transition-colors hover:bg-[#1c1c20] disabled:opacity-40"
                                            >
                                                LOCK
                                            </button>
                                    </div>
                                )}

                                {onEndCollect && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setEndCollectId(booking.id);
                                            setEndCollectPayment('cash');
                                        }}
                                        className="bg-[#d8ff3c] py-3.5 font-mono text-[11px] font-semibold tracking-[0.16em] text-[#0b0b0c] transition-transform hover:-translate-y-px"
                                    >
                                        END &amp; CHECKOUT · ₹{amount.toLocaleString('en-IN')}
                                    </button>
                                )}
                            </>
                        )}

                        {isShowingEndCollect && onEndCollect && (
                            <div className="border-t border-[#f2f0ea]/10 px-4 pb-4 pt-3.5">
                                <div className="flex items-center justify-between">
                                    <span className="font-mono text-[10px] tracking-[0.2em] text-[#f2f0ea]/50">
                                        TAKE PAYMENT
                                    </span>
                                    <button
                                        onClick={() => setEndCollectId(null)}
                                        className="font-mono text-[10px] tracking-[0.14em] text-[#f2f0ea]/40 transition-colors hover:text-[#f2f0ea]"
                                    >
                                        CANCEL
                                    </button>
                                </div>

                                <div className="mt-3 grid grid-cols-2 gap-2">
                                    {(['cash', 'upi'] as const).map((mode) => (
                                        <button
                                            key={mode}
                                            onClick={() => setEndCollectPayment(mode)}
                                            className="border py-2.5 font-mono text-[10.5px] font-semibold tracking-[0.14em] transition-colors"
                                            style={
                                                endCollectPayment === mode
                                                    ? { borderColor: '#d8ff3c', background: 'rgba(216,255,60,.12)', color: '#d8ff3c' }
                                                    : { borderColor: 'rgba(242,240,234,.16)', color: 'rgba(242,240,234,.5)' }
                                            }
                                        >
                                            {mode.toUpperCase()}
                                        </button>
                                    ))}
                                </div>

                                <button
                                    onClick={() => {
                                        onEndCollect(bookingId, endCollectPayment);
                                        setEndCollectId(null);
                                    }}
                                    className="mt-2.5 w-full bg-[#d8ff3c] py-3 font-mono text-[11px] font-semibold tracking-[0.16em] text-[#0b0b0c] transition-transform hover:-translate-y-px"
                                >
                                    COLLECT ₹{amount.toLocaleString('en-IN')} · {endCollectPayment.toUpperCase()}
                                </button>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
