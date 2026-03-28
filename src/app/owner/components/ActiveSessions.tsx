'use client';

import { useEffect, useRef } from 'react';
import { ConsoleId, CONSOLE_ICONS } from '@/lib/constants';
import { Plus } from 'lucide-react';

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
}: ActiveSessionsProps) {
    // Track sessions that have already triggered the ended callback
    const endedSessionsRef = useRef<Set<string>>(new Set());

    // 1. Filter and Flatten Bookings
    const activeBookings = bookings.filter(
        (b) =>
            b.status === 'in-progress' &&
            b.booking_date === getLocalDateString()
    );

    const activeMemberships = subscriptions.filter((sub) =>
        activeTimers.has(sub.id)
    );

    // Flatten bookings so each booking_item appears as a separate session
    const flattenedBookings = activeBookings.flatMap((booking) => {
        const items = booking.booking_items || [];
        if (items.length <= 1) {
            return [booking];
        }
        // Multiple items - create a separate entry for each
        return items.map((item: any, itemIndex: number) => ({
            ...booking,
            id: `${booking.id}-item-${itemIndex}`,
            originalBookingId: booking.id,
            booking_items: [item],
        }));
    });

    // 2. Sort Active Bookings by Time Remaining
    const sortedActiveBookings = [...flattenedBookings].sort((a, b) => {
        const currentMinutes =
            currentTime.getHours() * 60 + currentTime.getMinutes();

        const getTimeRemaining = (booking: typeof a) => {
            if (!booking.start_time || !booking.duration) return 999;
            const timeParts = booking.start_time.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
            if (!timeParts) return 999;

            let hours = parseInt(timeParts[1]);
            const minutes = parseInt(timeParts[2]);
            const period = timeParts[3];

            if (period) {
                if (period.toLowerCase() === 'pm' && hours !== 12) hours += 12;
                else if (period.toLowerCase() === 'am' && hours === 12) hours = 0;
            }

            const startMinutes = hours * 60 + minutes;
            const endMinutes = startMinutes + booking.duration;
            return Math.max(0, endMinutes - currentMinutes);
        };

        const timeA = getTimeRemaining(a);
        const timeB = getTimeRemaining(b);
        return timeA - timeB;
    });

    // Helper helper
    const getConsoleIcon = (consoleName: string) => {
        const key = consoleName?.toLowerCase() as ConsoleId;
        return CONSOLE_ICONS[key] || '🎮';
    };

    // Detect ended sessions
    useEffect(() => {
        if (!onSessionEnded) return;

        const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

        sortedActiveBookings.forEach((booking) => {
            const bookingId = booking.originalBookingId || booking.id;

            // Skip if already notified
            if (endedSessionsRef.current.has(bookingId)) return;

            if (booking.start_time && booking.duration) {
                const timeParts = booking.start_time.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
                if (timeParts) {
                    let hours = parseInt(timeParts[1]);
                    const minutes = parseInt(timeParts[2]);
                    const period = timeParts[3];

                    if (period) {
                        if (period.toLowerCase() === 'pm' && hours !== 12) hours += 12;
                        else if (period.toLowerCase() === 'am' && hours === 12) hours = 0;
                    }

                    const startMinutes = hours * 60 + minutes;
                    const endMinutes = startMinutes + booking.duration;
                    const timeRemaining = endMinutes - currentMinutes;

                    // Session just ended (within the last minute)
                    if (timeRemaining <= 0 && timeRemaining > -1) {
                        const consoleInfo = booking.booking_items?.[0];
                        const consoleType = consoleInfo?.console?.toUpperCase() || 'UNKNOWN';
                        const isWalkIn = booking.source === 'walk-in';
                        const customerName = isWalkIn ? booking.customer_name : (booking.user_name || 'Guest');

                        // Mark as notified
                        endedSessionsRef.current.add(bookingId);

                        // Call the callback
                        onSessionEnded({
                            customerName,
                            stationName: consoleType,
                            duration: booking.duration,
                        });
                    }
                }
            }
        });
    }, [currentTime, sortedActiveBookings, onSessionEnded]);

    if (sortedActiveBookings.length === 0 && activeMemberships.length === 0) {
        return (
            <div className="bg-[#0f0f14] border border-[#ffffff14] rounded-2xl p-16 text-center">
                <div className="text-5xl opacity-30 mb-3">🎮</div>
                <p className="text-base text-[#9ca3af] mb-1 font-medium">No active sessions</p>
                <p className="text-sm text-[#6b7280]">Sessions in progress will appear here</p>
            </div>
        );
    }

    return (
        <div className={`grid grid-cols-1 ${isMobile ? '' : 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'} gap-3`}>
            {/* Active Membership Sessions */}
            {activeMemberships.map((sub: any) => {
                const planDetails = sub.membership_plans || {};
                const elapsedSeconds = timerElapsed.get(sub.id) || 0;
                const consoleType = planDetails.console_type || 'UNKNOWN';
                const stationName = sub.assigned_console_station?.toUpperCase() || `${consoleType.toUpperCase()}-??`;

                const hours = Math.floor(elapsedSeconds / 3600);
                const minutes = Math.floor((elapsedSeconds % 3600) / 60);
                const seconds = elapsedSeconds % 60;
                const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

                return (
                    <div key={sub.id} className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 bg-slate-800">
                            {getConsoleIcon(consoleType)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-white text-sm truncate">{stationName}</span>
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 uppercase flex-shrink-0">Membership</span>
                            </div>
                            <div className="text-slate-400 text-xs truncate mt-0.5">{sub.customer_name}</div>
                            <div className="text-emerald-400 text-xs font-semibold font-mono mt-1">{timeString} elapsed</div>
                        </div>
                    </div>
                );
            })}

            {/* Regular Booking Sessions */}
            {sortedActiveBookings.map((booking, index) => {
                const consoleInfo = booking.booking_items?.[0];
                const isWalkIn = booking.source === 'walk-in';
                const customerName = isWalkIn ? booking.customer_name : (booking.user_name || 'Guest');

                // Calculate Time Remaining
                const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
                let timeRemaining = 0;
                let endTime = '';

                if (booking.start_time && booking.duration) {
                    const timeParts = booking.start_time.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
                    if (timeParts) {
                        let hours = parseInt(timeParts[1]);
                        const minutes = parseInt(timeParts[2]);
                        const period = timeParts[3];
                        if (period) {
                            if (period.toLowerCase() === 'pm' && hours !== 12) hours += 12;
                            else if (period.toLowerCase() === 'am' && hours === 12) hours = 0;
                        }
                        const startMinutes = hours * 60 + minutes;
                        const endMinutes = startMinutes + booking.duration;
                        timeRemaining = Math.max(0, endMinutes - currentMinutes);
                        const endHours = Math.floor(endMinutes / 60) % 24;
                        const endMins = endMinutes % 60;
                        const endPeriod = endHours >= 12 ? 'pm' : 'am';
                        const endHours12 = endHours === 0 ? 12 : endHours > 12 ? endHours - 12 : endHours;
                        endTime = `${endHours12}:${endMins.toString().padStart(2, '0')} ${endPeriod}`;
                    }
                }

                // Station Name
                const consoleType = consoleInfo?.console?.toUpperCase() || 'UNKNOWN';
                const sameTypeBookings = sortedActiveBookings.filter(
                    (b, i) => i <= index && b.booking_items?.[0]?.console === consoleInfo?.console
                );
                const stationName = `${consoleType}-${String(sameTypeBookings.length).padStart(2, '0')}`;

                const isEnding = timeRemaining <= 30;
                const isUrgent = timeRemaining < 15;
                const borderCls = isUrgent ? 'border-red-500/20 bg-red-500/5' : isEnding ? 'border-amber-500/20 bg-amber-500/5' : 'border-slate-700/50 bg-slate-800/30';
                const timeCls = isUrgent ? 'text-red-400' : isEnding ? 'text-amber-400' : 'text-slate-300';
                const badgeCls = isUrgent ? 'bg-red-500/10 text-red-500 border-red-500/20' : isEnding ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
                const badgeLabel = isUrgent ? 'Urgent' : isEnding ? 'Ending Soon' : 'Active';

                return (
                    <div key={booking.id} className={`rounded-xl border ${borderCls} p-4 flex items-center gap-4`}>
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 bg-slate-800">
                            {getConsoleIcon(consoleInfo?.console || '')}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-white text-sm">{stationName}</span>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase flex-shrink-0 ${badgeCls}`}>{badgeLabel}</span>
                            </div>
                            <div className="text-slate-400 text-xs truncate mt-0.5">{customerName}</div>
                            <div className={`text-xs font-semibold mt-1 flex items-center justify-between ${timeCls}`}>
                                <span>{Math.floor(timeRemaining / 60)}h {timeRemaining % 60}m left · Ends {endTime}</span>
                                {onAddItems && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onAddItems(booking.originalBookingId || booking.id, customerName);
                                        }}
                                        className="flex items-center gap-1 px-2 py-0.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded text-[10px] font-semibold transition-colors ml-2 flex-shrink-0"
                                    >
                                        <Plus className="w-3 h-3" />
                                        Add Items
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
