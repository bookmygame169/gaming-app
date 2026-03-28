'use client';

import { useEffect, useRef } from 'react';
import { ConsoleId, CONSOLE_ICONS } from '@/lib/constants';
import { Button } from './ui';
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

    // Helper
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
                    <div
                        key={sub.id}
                        className="flex flex-col justify-between bg-emerald-500/5 border-2 border-emerald-500/40 rounded-2xl p-5 min-h-[160px]"
                    >
                        <div>
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <p className="text-xs text-[#6b7280] mb-1 font-semibold uppercase tracking-wide">
                                        {stationName}
                                    </p>
                                    <p className="text-base font-bold text-white mb-0">
                                        {sub.customer_name}
                                    </p>
                                    <p className="text-xs text-[#6b7280] mt-0.5">
                                        {planDetails.name || 'Membership'}
                                    </p>
                                </div>
                                <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-500 rounded-xl text-xs font-semibold whitespace-nowrap">
                                    MEMBERSHIP
                                </span>
                            </div>
                        </div>

                        <div>
                            <div className="mb-3">
                                <p className="text-xs text-[#6b7280] mb-1">Session Time</p>
                                <p className="text-2xl font-bold text-emerald-500 m-0 font-mono">
                                    {timeString}
                                </p>
                            </div>
                        </div>
                    </div>
                );
            })}

            {/* Regular Booking Sessions */}
            {sortedActiveBookings.map((booking, index) => {
                const consoleInfo = booking.booking_items?.[0];
                const isWalkIn = booking.source === 'walk-in';

                // Calculate Time Remaining
                const currentMinutes =
                    currentTime.getHours() * 60 + currentTime.getMinutes();

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

                        // End time display
                        const endHours = Math.floor(endMinutes / 60) % 24;
                        const endMins = endMinutes % 60;
                        const endPeriod = endHours >= 12 ? 'pm' : 'am';
                        const endHours12 = endHours === 0 ? 12 : endHours > 12 ? endHours - 12 : endHours;
                        endTime = `${endHours12}:${endMins.toString().padStart(2, '0')} ${endPeriod}`;
                    }
                }

                // Station Name Logic
                const consoleType = consoleInfo?.console?.toUpperCase() || 'UNKNOWN';
                const sameTypeBookings = sortedActiveBookings.filter(
                    (b, i) => i <= index && b.booking_items?.[0]?.console === consoleInfo?.console
                );
                const stationNumber = sameTypeBookings.length;
                const stationName = `${consoleType}-${String(stationNumber).padStart(2, '0')}`;

                // Status Colors
                const isUrgent = timeRemaining < 15;
                const isWarning = timeRemaining >= 15 && timeRemaining <= 30;
                const isHealthy = timeRemaining > 30;

                const bgColor = isHealthy ? 'bg-emerald-500/5' : isWarning ? 'bg-amber-500/5' : 'bg-red-500/5';
                const borderColor = isHealthy ? 'border-emerald-500/40' : isWarning ? 'border-amber-500/40' : 'border-red-500/40';
                const hoverShadow = isHealthy ? 'group-hover:shadow-[0_8px_24px_rgba(34,197,94,0.2)]' : isWarning ? 'group-hover:shadow-[0_8px_24px_rgba(251,191,36,0.2)]' : 'group-hover:shadow-[0_8px_24px_rgba(239,68,68,0.2)]';
                const badgeBg = isHealthy ? 'bg-emerald-500/20' : isWarning ? 'bg-amber-500/20' : 'bg-red-500/20';
                const badgeText = isHealthy ? 'text-emerald-500' : isWarning ? 'text-amber-500' : 'text-red-500';
                const badgeBorder = isHealthy ? 'border-emerald-500' : isWarning ? 'border-amber-500' : 'border-red-500';
                const timerColor = isHealthy ? 'text-emerald-500' : isWarning ? 'text-amber-500' : 'text-red-500';

                return (
                    <div
                        key={booking.id}
                        className={`group relative flex flex-col justify-between ${bgColor} border-2 ${borderColor} rounded-2xl p-5 min-h-[160px] transition-all duration-300 hover:-translate-y-1 ${hoverShadow} cursor-default overflow-hidden`}
                    >
                        {/* Badge */}
                        <div className={`absolute top-3 right-3 ${badgeBg} border ${badgeBorder} rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${badgeText}`}>
                            {isHealthy ? "ACTIVE" : isWarning ? "ENDING SOON" : "URGENT"}
                        </div>

                        {/* Header */}
                        <div className="flex items-center gap-2.5 mb-4">
                            <div className="text-3xl">
                                {getConsoleIcon(consoleInfo?.console || '')}
                            </div>
                            <div>
                                <div className="text-xs text-[#6b7280] font-semibold uppercase tracking-wide">
                                    {stationName}
                                </div>
                                <div className="text-base font-bold text-white">
                                    {isWalkIn ? booking.customer_name : (booking.user_name || 'Guest')}
                                </div>
                            </div>
                        </div>

                        {/* Timer */}
                        <div className="flex justify-between items-end">
                            <div>
                                <p className="text-xs text-[#6b7280] mb-0.5">Time Remaining</p>
                                <p className={`text-2xl font-bold font-mono ${timerColor}`}>
                                    {Math.floor(timeRemaining / 60)}h {timeRemaining % 60}m
                                </p>
                            </div>
                            <div className="flex items-end gap-3">
                                {onAddItems && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const originalId = booking.originalBookingId || booking.id;
                                            const customerName = isWalkIn ? booking.customer_name : (booking.user_name || 'Guest');
                                            onAddItems(originalId, customerName);
                                        }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded-lg text-xs font-semibold transition-colors"
                                        title="Add F&B items"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        Add Items
                                    </button>
                                )}
                                <div className="text-right">
                                    <p className="text-xs text-[#6b7280] mb-0.5">Ends At</p>
                                    <p className="text-sm font-semibold text-white">
                                        {endTime}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="absolute bottom-0 left-0 w-full h-1 bg-[#ffffff10]">
                            <div
                                className={`h-full ${isHealthy ? 'bg-emerald-500' : isWarning ? 'bg-amber-500' : 'bg-red-500'}`}
                                style={{ width: `${Math.min(100, (timeRemaining / booking.duration) * 100)}%` }}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
