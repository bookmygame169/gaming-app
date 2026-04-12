'use client';

import { useEffect, useRef, useState } from 'react';
import { ConsoleId, CONSOLE_ICONS } from '@/lib/constants';
import { Plus, MessageCircle, Banknote, Smartphone, Gamepad2, CheckCircle, X } from 'lucide-react';

import { getLocalDateString } from '../utils';

interface SessionEndedInfo {
    customerName: string;
    stationName: string;
    duration: number;
}

interface ActiveSessionsProps {
    bookings: any[];
    subscriptions: any[];
    activeTimers: Map<string, any>;
    timerElapsed: Map<string, number>;
    currentTime: Date;
    isMobile: boolean;
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
    isMobile,
    onAddItems,
    onSessionEnded,
    onEndCollect,
}: ActiveSessionsProps) {
    const endedSessionsRef = useRef<Set<string>>(new Set());
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

    const parseStartMinutes = (startTime: string): number | null => {
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
    };

    const calcTimeRemaining = (startMinutes: number, duration: number, currentMinutes: number): number => {
        const endMinutes = startMinutes + duration;
        if (endMinutes > 1440) {
            const remaining = currentMinutes < startMinutes
                ? (endMinutes - 1440) - currentMinutes
                : endMinutes - currentMinutes;
            return remaining;
        }
        return endMinutes - currentMinutes;
    };

    const sortedActiveBookings = [...flattenedBookings].sort((a, b) => {
        const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
        const getTimeRemaining = (booking: typeof a) => {
            if (!booking.start_time) return 999;
            const bi = booking.booking_items?.[0];
            const parsedTitle = parseInt(bi?.title || '');
            const duration = !isNaN(parsedTitle) && parsedTitle > 0 ? parsedTitle : booking.duration;
            if (!duration) return 999;
            const startMinutes = parseStartMinutes(booking.start_time);
            if (startMinutes === null) return 999;
            return Math.max(0, calcTimeRemaining(startMinutes, duration, currentMinutes));
        };
        return getTimeRemaining(a) - getTimeRemaining(b);
    });

    const getConsoleIcon = (consoleName: string) => {
        const key = consoleName?.toLowerCase() as ConsoleId;
        return CONSOLE_ICONS[key] || '🎮';
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
            <div className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-16 text-center flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-1">
                    <Gamepad2 size={28} className="text-slate-600" />
                </div>
                <p className="text-base text-slate-400 font-medium">No active sessions</p>
                <p className="text-sm text-slate-600">Sessions in progress will appear here</p>
            </div>
        );
    }

    return (
        <div className={`grid grid-cols-1 ${isMobile ? '' : 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'} gap-4 md:gap-5`}>
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
                const isHealthy = timeRemaining > 15;

                const bgColor = isCritical ? 'bg-red-500/8' : isWarning ? 'bg-amber-500/5' : 'bg-emerald-500/5';
                const borderColor = isCritical ? 'border-red-500/60' : isWarning ? 'border-amber-500/40' : 'border-emerald-500/40';
                const badgeBg = isCritical ? 'bg-red-500/25' : isWarning ? 'bg-amber-500/20' : 'bg-emerald-500/20';
                const badgeText = isCritical ? 'text-red-400' : isWarning ? 'text-amber-500' : 'text-emerald-500';
                const badgeBorder = isCritical ? 'border-red-400' : isWarning ? 'border-amber-500' : 'border-emerald-500';
                const timerColor = isCritical ? 'text-red-400' : isWarning ? 'text-amber-500' : 'text-emerald-500';
                const progressColor = isCritical ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-emerald-500';
                const pulseClass = isCritical ? 'animate-pulse' : '';

                const bookingId = booking.originalBookingId || booking.id;
                const customerName = isWalkIn ? booking.customer_name : (booking.user_name || 'Guest');
                const isShowingEndCollect = endCollectId === booking.id;

                return (
                    <div
                        key={booking.id}
                        className={`group relative flex flex-col justify-between ${bgColor} border-2 ${borderColor} ${pulseClass} rounded-2xl p-5 min-h-[160px] transition-all duration-300 overflow-hidden`}
                    >
                        {/* Badge */}
                        <div className={`absolute top-3 right-3 ${badgeBg} border ${badgeBorder} rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${badgeText}`}>
                            {isCritical ? '⏰ URGENT' : isWarning ? 'ENDING SOON' : 'ACTIVE'}
                        </div>

                        {/* Header */}
                        <div className="flex items-center gap-2.5 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-white/[0.08] flex items-center justify-center shrink-0">
                                <Gamepad2 size={20} className="text-slate-300" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-xs text-[#6b7280] font-semibold uppercase tracking-wide">{stationName}</div>
                                <div className="text-base font-bold text-white truncate">{customerName}</div>
                                <div className="flex items-center gap-2 mt-1">
                                    {booking.payment_mode && (
                                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#ffffff08] text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wide">
                                            {booking.payment_mode.toLowerCase() === 'cash' ? <Banknote size={10} /> : <Smartphone size={10} />}
                                            {booking.payment_mode}
                                        </span>
                                    )}
                                    {(isWalkIn ? booking.customer_phone : booking.user_phone) && (
                                        <a
                                            href={`https://wa.me/${(isWalkIn ? booking.customer_phone : booking.user_phone)?.replace(/\D/g, '')}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-500/10 text-[10px] font-semibold text-green-400 hover:bg-green-500/20 transition-colors"
                                        >
                                            <MessageCircle size={10} />WA
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Timer row */}
                        <div className="flex justify-between items-end">
                            <div>
                                <p className="text-xs text-[#6b7280] mb-0.5">Time Remaining</p>
                                <p className={`text-2xl font-bold font-mono ${timerColor}`}>
                                    {Math.floor(timeRemaining / 60)}h {timeRemaining % 60}m
                                </p>
                            </div>
                            <div className="flex items-end gap-2">
                                {onAddItems && !isShowingEndCollect && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onAddItems(bookingId, customerName);
                                        }}
                                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded-lg text-xs font-semibold transition-colors"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        Add
                                    </button>
                                )}
                                {onEndCollect && !isShowingEndCollect && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setEndCollectId(booking.id);
                                            setEndCollectPayment('cash');
                                        }}
                                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${isCritical ? 'bg-red-500/25 text-red-300 hover:bg-red-500/35' : 'bg-white/[0.08] text-slate-300 hover:bg-white/[0.12]'}`}
                                    >
                                        <CheckCircle className="w-3.5 h-3.5" />
                                        End
                                    </button>
                                )}
                                {!isShowingEndCollect && (
                                    <div className="text-right">
                                        <p className="text-xs text-[#6b7280] mb-0.5">Ends At</p>
                                        <p className="text-sm font-semibold text-white">{endTime}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* End & Collect inline panel */}
                        {isShowingEndCollect && (
                            <div className="mt-3 pt-3 border-t border-white/[0.10] space-y-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-semibold text-white">End & Collect</p>
                                    <button onClick={() => setEndCollectId(null)} className="text-slate-500 hover:text-white transition-colors">
                                        <X size={13} />
                                    </button>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setEndCollectPayment('cash')}
                                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border transition-colors ${endCollectPayment === 'cash' ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-400' : 'bg-white/[0.04] border-white/[0.08] text-slate-400'}`}
                                    >
                                        <Banknote size={13} /> Cash
                                    </button>
                                    <button
                                        onClick={() => setEndCollectPayment('upi')}
                                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border transition-colors ${endCollectPayment === 'upi' ? 'bg-blue-500/15 border-blue-500/50 text-blue-400' : 'bg-white/[0.04] border-white/[0.08] text-slate-400'}`}
                                    >
                                        <Smartphone size={13} /> UPI
                                    </button>
                                </div>
                                <div className="flex items-center justify-between text-xs mb-1">
                                    <span className="text-slate-400">Amount</span>
                                    <span className="font-bold text-emerald-400 text-sm">₹{booking.total_amount || 0}</span>
                                </div>
                                <button
                                    onClick={() => {
                                        onEndCollect!(bookingId, endCollectPayment);
                                        setEndCollectId(null);
                                    }}
                                    className="w-full py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold transition-colors"
                                >
                                    ✓ Confirm & End Session
                                </button>
                            </div>
                        )}

                        {/* Progress Bar */}
                        <div className="absolute bottom-0 left-0 w-full h-1 bg-[#ffffff10]">
                            <div
                                className={`h-full ${progressColor}`}
                                style={{ width: `${Math.min(100, (timeRemaining / (itemDuration || booking.duration || 60)) * 100)}%` }}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
