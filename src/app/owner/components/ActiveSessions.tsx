'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ConsoleId, CONSOLE_ICONS, CONSOLE_COLORS, CONSOLE_LABELS } from '@/lib/constants';
import { Clock3, MessageCircle, Banknote, Smartphone, Gamepad2, X, Square, UtensilsCrossed } from 'lucide-react';

import { getLocalDateString } from '../utils';

interface SessionEndedInfo {
    customerName: string;
    stationName: string;
    duration: number;
}

function parseStartMinutes(startTime: string): number | null {
    const timeParts = startTime.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if (!timeParts) return null;
    let hours = parseInt(timeParts[1]);
    const minutes = parseInt(timeParts[2]);
    const period = timeParts[3];
    if (period) {
        if (period.toLowerCase() === 'pm' && hours !== 12) hours += 12;
        else if (period.toLowerCase() === 'am' && hours === 12) hours = 0;
    }
    return hours * 60 + minutes;
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
    onSessionEnded?: (info: SessionEndedInfo) => void;
    onEndCollect?: (bookingId: string, paymentMode: 'cash' | 'upi') => void;
}

export function ActiveSessions({
    bookings,
    subscriptions,
    activeTimers,
    timerElapsed,
    currentTime,
    onAddTime,
    onAddItems,
    onSessionEnded,
    onEndCollect,
}: ActiveSessionsProps) {
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

    // 1. Filter and Flatten Bookings
    const activeBookings = bookings.filter(
        (b) => b.status === 'in-progress' && b.booking_date === getLocalDateString()
    );

    const activeMemberships = subscriptions.filter((sub) => activeTimers.has(sub.id));

    const flattenedBookings = activeBookings.flatMap((booking) => {
        const items = booking.booking_items || [];
        if (items.length <= 1) return [booking];
        return items.map((item: any, itemIndex: number) => ({
            ...booking,
            id: `${booking.id}-item-${itemIndex}`,
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
                const parsedTitle = parseInt(bi?.title || '');
                const duration = !isNaN(parsedTitle) && parsedTitle > 0 ? parsedTitle : booking.duration;
                if (!duration) return 999;
                const startMinutes = parseStartMinutes(booking.start_time);
                if (startMinutes === null) return 999;
                return Math.max(0, calcTimeRemaining(startMinutes, duration, sortMinute));
            };
            return getTimeRemaining(a) - getTimeRemaining(b);
        });
    }, [flattenedBookings, sortMinute]);

    const getConsoleIcon = (consoleName: string) => {
        const key = consoleName?.toLowerCase() as ConsoleId;
        return CONSOLE_ICONS[key] || '🎮';
    };
    const getConsoleColor = (consoleName: string) => {
        const key = consoleName?.toLowerCase() as ConsoleId;
        return CONSOLE_COLORS[key] || '#6b7280';
    };
    const getConsoleLabel = (consoleName: string) => {
        const key = consoleName?.toLowerCase() as ConsoleId;
        return CONSOLE_LABELS[key] || consoleName;
    };

    // Fire session-ended callback once when time hits 0
    useEffect(() => {
        if (!onSessionEnded) return;
        const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
        sortedActiveBookings.forEach((booking) => {
            const bookingId = booking.originalBookingId || booking.id;
            if (endedSessionsRef.current.has(bookingId)) return;
            if (!booking.start_time) return;
            const bi = booking.booking_items?.[0];
            const parsedTitle = parseInt(bi?.title || '');
            const duration = !isNaN(parsedTitle) && parsedTitle > 0 ? parsedTitle : booking.duration;
            if (!duration) return;
            const startMinutes = parseStartMinutes(booking.start_time);
            if (startMinutes === null) return;
            const timeRemaining = calcTimeRemaining(startMinutes, duration, currentMinutes);
            if (timeRemaining <= 0) {
                const consoleType = booking.booking_items?.[0]?.console?.toUpperCase() || 'UNKNOWN';
                const isWalkIn = booking.source === 'walk-in';
                const customerName = isWalkIn ? booking.customer_name : (booking.user_name || 'Guest');
                endedSessionsRef.current.add(bookingId);
                onSessionEnded({ customerName, stationName: consoleType, duration: booking.duration });
            }
        });
    }, [currentTime, sortedActiveBookings, onSessionEnded]);

    if (sortedActiveBookings.length === 0 && activeMemberships.length === 0) {
        return (
            <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-8 md:p-16 text-center flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-1">
                    <Gamepad2 size={28} className="text-slate-600" />
                </div>
                <p className="text-base text-slate-400 font-medium">No active sessions</p>
                <p className="text-sm text-slate-600">Sessions in progress will appear here</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {/* Active Membership Sessions */}
            {activeMemberships.map((sub: any) => {
                const planDetails = sub.membership_plans || {};
                const elapsedSeconds = timerElapsed.get(sub.id) || 0;
                const consoleType = planDetails.console_type?.toUpperCase() || 'UNKNOWN';
                const stationName = sub.assigned_console_station?.toUpperCase() || `${consoleType}-??`;
                const hours = Math.floor(elapsedSeconds / 3600);
                const minutes = Math.floor((elapsedSeconds % 3600) / 60);
                const seconds = elapsedSeconds % 60;
                const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

                return (
                    <div key={sub.id} className="flex flex-col justify-between bg-emerald-500/5 border-2 border-emerald-500/40 rounded-2xl p-5 min-h-[160px]">
                        <div>
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <p className="text-xs text-[#6b7280] mb-1 font-semibold uppercase tracking-wide">{stationName}</p>
                                    <p className="text-base font-bold text-white mb-0">{sub.customer_name}</p>
                                    <p className="text-xs text-[#6b7280] mt-0.5">{planDetails.name || 'Membership'}</p>
                                </div>
                                <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-500 rounded-xl text-xs font-semibold whitespace-nowrap">MEMBERSHIP</span>
                            </div>
                        </div>
                        <div>
                            <div className="mb-3">
                                <p className="text-xs text-[#6b7280] mb-1">Session Time</p>
                                <p className="text-2xl font-bold text-emerald-500 m-0 font-mono">{timeString}</p>
                            </div>
                        </div>
                    </div>
                );
            })}

            {/* Regular Booking Sessions */}
            {sortedActiveBookings.map((booking, index) => {
                const consoleInfo = booking.booking_items?.[0];
                const isWalkIn = booking.source === 'walk-in';
                const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

                let timeRemaining = 0;
                let endTime = '';
                const parsedItemDuration = parseInt(consoleInfo?.title || '');
                const itemDuration = !isNaN(parsedItemDuration) && parsedItemDuration > 0 ? parsedItemDuration : booking.duration;

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

                // Thresholds: ≤5 min = critical (pulse), 5–15 min = warning, >15 min = healthy
                const isCritical = timeRemaining <= 5;
                const isWarning = timeRemaining > 5 && timeRemaining <= 15;
                const badgeBg = isCritical ? 'bg-red-500/25' : isWarning ? 'bg-amber-500/20' : 'bg-emerald-500/20';
                const badgeText = isCritical ? 'text-red-400' : isWarning ? 'text-amber-500' : 'text-emerald-500';
                const pulseClass = isCritical ? 'animate-pulse' : '';

                const bookingId = booking.originalBookingId || booking.id;
                const customerName = isWalkIn ? booking.customer_name : (booking.user_name || 'Guest');
                const isShowingEndCollect = endCollectId === booking.id;

                const ringProgress = Math.min(1, Math.max(0, timeRemaining / (itemDuration || booking.duration || 60)));
                const ringR = 34;
                const ringCircumference = 2 * Math.PI * ringR;
                const ringOffset = ringCircumference * (1 - ringProgress);
                const consoleBaseColor = getConsoleColor(consoleInfo?.console || '');
                const ringStroke = isCritical ? '#ef4444' : isWarning ? '#f59e0b' : consoleBaseColor;

                return (
                    <div
                        key={booking.id}
                        className={`group relative flex flex-col glass ${pulseClass} rounded-2xl overflow-hidden transition-all duration-300`}
                        style={{ borderLeft: `2px solid ${ringStroke}`, boxShadow: `0 0 0 1px ${ringStroke}22, 0 0 28px -8px ${ringStroke}44` }}
                    >
                        {/* Card header */}
                        <div className="flex items-center justify-between px-4 pt-4 pb-2">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-base" style={{ background: `${consoleBaseColor}22`, color: consoleBaseColor }}>
                                    {getConsoleIcon(consoleInfo?.console || '')}
                                </div>
                                <div>
                                    <p className="mono text-[12px] font-bold text-white tracking-wide">{stationName}</p>
                                    <p className="text-[10px] text-slate-500">{getConsoleLabel(consoleInfo?.console || '')}</p>
                                </div>
                            </div>
                            <span className={`text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${badgeBg} ${badgeText}`}>
                                {isCritical ? 'Urgent' : isWarning ? 'Ending' : 'Live'}
                            </span>
                        </div>

                        {/* Middle: ring + customer info */}
                        <div className="flex flex-col items-start gap-4 px-4 py-3 sm:flex-row sm:items-center">
                            {/* Circular ring */}
                            <div className="relative w-[76px] h-[76px] shrink-0 flex items-center justify-center">
                                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 80 80" style={{ transform: 'rotate(-90deg)' }}>
                                    <circle cx="40" cy="40" r={ringR} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
                                    <circle
                                        cx="40" cy="40" r={ringR} fill="none"
                                        stroke={ringStroke} strokeWidth="5"
                                        strokeLinecap="round"
                                        strokeDasharray={ringCircumference}
                                        strokeDashoffset={ringOffset}
                                        style={{ transition: 'stroke-dashoffset 1s linear' }}
                                    />
                                </svg>
                                <div className="text-center z-10">
                                    <p className="mono text-xl font-bold leading-none" style={{ color: ringStroke }}>{timeRemaining}</p>
                                    <p className="text-[9px] text-slate-500 mt-0.5 uppercase tracking-wide">min</p>
                                </div>
                            </div>

                            {/* Customer info */}
                            <div className="flex-1 min-w-0 w-full">
                                <p className="text-[10px] text-slate-500 mb-0.5" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.12em' }}>Customer</p>
                                <p className="text-sm font-bold text-white truncate">{customerName}</p>
                                {endTime && <p className="text-[11px] text-slate-500 mt-1">ends {endTime}</p>}
                                <div className="flex items-center gap-1.5 mt-1.5">
                                    {booking.payment_mode && (
                                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.06] text-[9px] font-semibold text-slate-400 uppercase">
                                            {booking.payment_mode.toLowerCase() === 'cash' ? <Banknote size={9} /> : <Smartphone size={9} />}
                                            {booking.payment_mode}
                                        </span>
                                    )}
                                    {(isWalkIn ? booking.customer_phone : booking.user_phone) && (
                                        <a
                                            href={`https://wa.me/${(isWalkIn ? booking.customer_phone : booking.user_phone)?.replace(/\D/g, '')}`}
                                            target="_blank" rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/10 text-[9px] font-semibold text-green-400 hover:bg-green-500/20 transition-colors"
                                        >
                                            <MessageCircle size={9} />WA
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* End & Collect inline panel */}
                        {isShowingEndCollect && (
                            <div className="mx-4 mb-3 pt-3 border-t border-white/[0.08] space-y-2.5">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-semibold text-white">End & Collect</p>
                                    <button onClick={() => setEndCollectId(null)} className="text-slate-500 hover:text-white transition-colors">
                                        <X size={13} />
                                    </button>
                                </div>
                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <button onClick={() => setEndCollectPayment('cash')} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${endCollectPayment === 'cash' ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-400' : 'bg-white/[0.04] border-white/[0.08] text-slate-400'}`}>
                                        <Banknote size={12} /> Cash
                                    </button>
                                    <button onClick={() => setEndCollectPayment('upi')} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${endCollectPayment === 'upi' ? 'bg-blue-500/15 border-blue-500/50 text-blue-400' : 'bg-white/[0.04] border-white/[0.08] text-slate-400'}`}>
                                        <Smartphone size={12} /> UPI
                                    </button>
                                </div>
                                <div className="flex justify-between text-xs mb-1">
                                    <span className="text-slate-400">Amount</span>
                                    <span className="font-bold text-emerald-400">₹{booking.total_amount || 0}</span>
                                </div>
                                <button onClick={() => { onEndCollect!(bookingId, endCollectPayment); setEndCollectId(null); }} className="w-full py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold transition-colors">
                                    ✓ Confirm & End Session
                                </button>
                            </div>
                        )}

                        {/* Action buttons */}
                        {!isShowingEndCollect && (
                            <div className="mt-3 grid grid-cols-1 gap-1.5 px-4 pb-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                                {onAddTime && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onAddTime(booking); }}
                                        className="flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:text-white hover:border-cyan-500/30 hover:bg-cyan-500/8 transition-colors rounded-lg"
                                        style={{ border: '1px solid rgba(255,255,255,0.07)' }}
                                    >
                                        <Clock3 className="w-3 h-3" /> Add time
                                    </button>
                                )}
                                {onAddItems && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onAddItems(bookingId, customerName); }}
                                        className="flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:text-white hover:border-amber-500/30 hover:bg-amber-500/8 transition-colors rounded-lg"
                                        style={{ border: '1px solid rgba(255,255,255,0.07)' }}
                                    >
                                        <UtensilsCrossed className="w-3 h-3" /> Add item
                                    </button>
                                )}
                                {onEndCollect && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setEndCollectId(booking.id); setEndCollectPayment('cash'); }}
                                        className="flex items-center justify-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg transition-colors hover:border-white/20 sm:col-span-2 xl:col-span-1"
                                        style={{ border: '1px solid rgba(255,255,255,0.07)', color: '#fca5a5' }}
                                    >
                                        <Square className="w-3 h-3" /> End
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
