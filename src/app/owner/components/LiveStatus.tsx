'use client';

import { useEffect, useState } from 'react';
import { CONSOLE_LABELS, CONSOLE_ICONS } from '@/lib/constants';
import { isBookingActiveNow } from '@/lib/bookingFilters';
import { Button, LoadingSpinner, EmptyState } from './ui';
import { MonitorPlay, User, AlertCircle, Gamepad2 } from 'lucide-react';

type ConsoleId = "ps5" | "ps4" | "xbox" | "pc" | "pool" | "arcade" | "snooker" | "vr" | "steering" | "racing_sim";

type CafeConsoleCounts = {
    ps5_count: number; ps4_count: number; xbox_count: number; pc_count: number;
    pool_count: number; arcade_count: number; snooker_count: number; vr_count: number;
    steering_wheel_count: number; racing_sim_count: number;
};

type BookingData = {
    id: string; start_time: string; duration: number; customer_name: string | null;
    booking_date?: string | null;
    status?: string | null;
    user_id: string | null;
    booking_items: Array<{ console: ConsoleId; quantity: number; title?: string | null }>;
    profile?: { name: string } | null;
};

type MembershipData = {
    customer_name?: string | null;
    assigned_console_station?: string | null;
    timer_start_time: string;
    membership_plans?: { console_type?: string | null } | null;
};

type StationPricingData = {
    station_name?: string | null;
    is_active?: boolean | null;
};

type LiveStatusResponse = {
    cafe?: CafeConsoleCounts | null;
    bookings?: BookingData[] | null;
    activeSubscriptions?: MembershipData[] | null;
    stationPricing?: StationPricingData[] | null;
};

type ConsoleStatus = {
    id: string; consoleNumber: number;
    status: "free" | "busy" | "ending_soon" | "inactive";
    booking?: {
        customerName: string; startTime: string; endTime: string;
        timeRemaining: number; duration?: number; controllerCount?: number;
    };
};

type ConsoleSummary = {
    type: ConsoleId; label: string; icon: string;
    total: number; free: number; busy: number;
    statuses: ConsoleStatus[];
};

interface LiveStatusProps {
    cafeId: string;
    isMobile?: boolean;
}

function formatMinutes(mins: number) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h  ${m}m`;
}

function parseAssignedStations(title: string | null | undefined): string[] {
    const stationPart = title?.split('|')[1]?.trim();
    if (!stationPart) return [];

    return stationPart
        .split(',')
        .map((station) => station.trim().toLowerCase())
        .filter(Boolean);
}

function getOccupiedUnits(consoleType: ConsoleId, quantity: number | null | undefined): number {
    if (consoleType === 'ps5' || consoleType === 'ps4' || consoleType === 'xbox') {
        return 1;
    }

    return Math.max(1, quantity || 1);
}

export function LiveStatus({ cafeId, isMobile = false }: LiveStatusProps) {
    const [consoleData, setConsoleData] = useState<ConsoleSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(new Date());

    const loadConsoleStatus = async () => {
        try {
            const res = await fetch(`/api/owner/live-status?cafeId=${cafeId}`);
            if (!res.ok) throw new Error('Failed to fetch live status');
            const { cafe, bookings = [], activeSubscriptions = [], stationPricing = [] } = await res.json() as LiveStatusResponse;
            const bookingRows = bookings || [];
            const membershipRows = activeSubscriptions || [];
            const pricingRows = stationPricing || [];
            console.log('[LiveStatus] API response — cafeId:', cafeId, 'bookings:', bookingRows.length, 'inProgress:', bookingRows.filter((b) => b.status === 'in-progress').length, 'subscriptions (timer_active):', membershipRows.length, 'raw bookings:', bookingRows, 'raw subs:', membershipRows);
            if (!cafe) { setLoading(false); return; }
            const summaries = buildConsoleSummaries(cafe, bookingRows, membershipRows, pricingRows);
            const busy = summaries.flatMap(g => g.statuses).filter(s => s.status === 'busy' || s.status === 'ending_soon');
            console.log('[LiveStatus] buildConsoleSummaries result — activeSessions:', busy.length, busy);
            setConsoleData(summaries);
            setLastUpdated(new Date());
        } catch (error) {
            console.error("Error loading status:", error);
        } finally {
            setLoading(false);
        }
    };

    const buildConsoleSummaries = (cafe: CafeConsoleCounts, bookings: BookingData[], memberships: MembershipData[], stationPricing: StationPricingData[]): ConsoleSummary[] => {
        const consoleTypes: Array<{ id: ConsoleId; key: string }> = [
            { id: "ps5", key: "ps5_count" }, { id: "ps4", key: "ps4_count" },
            { id: "xbox", key: "xbox_count" }, { id: "pc", key: "pc_count" },
            { id: "pool", key: "pool_count" }, { id: "arcade", key: "arcade_count" },
            { id: "snooker", key: "snooker_count" }, { id: "vr", key: "vr_count" },
            { id: "steering", key: "steering_wheel_count" }, { id: "racing_sim", key: "racing_sim_count" },
        ];

        const summaries: ConsoleSummary[] = [];
        const now = new Date();
        const timeParts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).formatToParts(now);
        const currentHours = Number(timeParts.find((part) => part.type === 'hour')?.value || '0');
        const currentMins = Number(timeParts.find((part) => part.type === 'minute')?.value || '0');
        const currentMinutes = currentHours * 60 + currentMins;

        const parseTimeToMinutes = (timeStr: string): number => {
            const [time, period] = timeStr.toLowerCase().split(" ");
            const [hours, minutes] = time.split(":").map(Number);
            let totalHours = hours;
            if (period === "pm" && hours !== 12) totalHours += 12;
            if (period === "am" && hours === 12) totalHours = 0;
            return totalHours * 60 + minutes;
        };

        const formatEndTime = (startMinutes: number, duration: number): string => {
            const endMinutes = startMinutes + duration;
            const hours = Math.floor(endMinutes / 60) % 24;
            const mins = endMinutes % 60;
            const period = hours >= 12 ? "pm" : "am";
            const displayHours = hours % 12 || 12;
            return `${displayHours}:${mins.toString().padStart(2, "0")} ${period}`;
        };

        // Use all in-progress bookings from API (already filtered by status=in-progress)
        const activeBookings = bookings.filter(b => b.start_time && b.duration && isBookingActiveNow(b));

        const consoleTypeMap: Record<string, ConsoleId> = {
            'PC': 'pc', 'PS5': 'ps5', 'PS4': 'ps4', 'Xbox': 'xbox',
            'Pool': 'pool', 'Snooker': 'snooker', 'Arcade': 'arcade',
            'VR': 'vr', 'Steering': 'steering', 'Racing Sim': 'racing_sim'
        };

        consoleTypes.forEach(({ id, key }) => {
            const total = cafe[key as keyof CafeConsoleCounts] || 0;
            if (total === 0) return;

            const explicitStationBookings = new Map<string, BookingData & { quantity: number; controllerCount: number }>();
            const fallbackBookings: Array<BookingData & { quantity: number; controllerCount: number }> = [];
            activeBookings.forEach(b => {
                const matchingItems = b.booking_items?.filter(item => {
                    const rawConsole = (item.console as string || '').toLowerCase();
                    const itemConsole = rawConsole === 'steering_wheel' ? 'steering' : rawConsole;
                    return itemConsole === id;
                }) || [];
                matchingItems.forEach(item => {
                    const controllerCount = item.quantity || 1;
                    const assignedStations = parseAssignedStations(item.title);

                    if (assignedStations.length > 0) {
                        assignedStations.forEach((stationId) => {
                            explicitStationBookings.set(stationId, { ...b, quantity: 1, controllerCount });
                        });
                        return;
                    }

                    fallbackBookings.push({
                        ...b,
                        quantity: getOccupiedUnits(id, item.quantity || 1),
                        controllerCount,
                    });
                });
            });

            const consoleMemberships = memberships.filter(m => {
                const type = m.membership_plans?.console_type;
                return type && consoleTypeMap[type] === id;
            });

            const statuses: ConsoleStatus[] = [];
            let busyCount = 0;
            let fallbackIndex = 0;
            let fallbackRemaining = fallbackBookings[0]?.quantity || 0;

            const buildBookingStatus = (
                stationId: string,
                consoleNumber: number,
                booking: BookingData & { controllerCount: number }
            ): ConsoleStatus => {
                const startMinutes = parseTimeToMinutes(booking.start_time);
                const endMinutes = startMinutes + booking.duration;
                const timeRemaining = endMinutes - currentMinutes;
                const hasStarted = currentMinutes >= startMinutes;

                return {
                    id: stationId,
                    consoleNumber,
                    status: timeRemaining <= 15 ? 'ending_soon' : 'busy',
                    booking: {
                        customerName: booking.customer_name || booking.profile?.name || 'Guest',
                        startTime: booking.start_time,
                        endTime: formatEndTime(startMinutes, booking.duration),
                        timeRemaining: hasStarted ? timeRemaining : (startMinutes - currentMinutes),
                        duration: booking.duration,
                        controllerCount: booking.controllerCount
                    }
                };
            };

            for (let unit = 1; unit <= total; unit++) {
                const stationId = `${id}-${unit.toString().padStart(2, '0')}`;
                const pricingInfo = stationPricing.find((p) => p.station_name === stationId);
                const isInactive = pricingInfo && pricingInfo.is_active === false;

                if (isInactive) {
                    statuses.push({ id: stationId, consoleNumber: unit, status: 'inactive' });
                    continue;
                }

                const membership = consoleMemberships.find(m => m.assigned_console_station === stationId);
                if (membership) {
                    const startTime = new Date(membership.timer_start_time);
                    const elapsed = Math.floor((now.getTime() - startTime.getTime()) / 60000);
                    statuses.push({
                        id: stationId, consoleNumber: unit, status: 'busy',
                        booking: {
                            customerName: (membership.customer_name || 'Member') + ' (Sub)',
                            startTime: startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
                            endTime: 'Ongoing', timeRemaining: elapsed,
                        }
                    });
                    busyCount++;
                } else {
                    const explicitBooking = explicitStationBookings.get(stationId);
                    if (explicitBooking) {
                        statuses.push(buildBookingStatus(stationId, unit, explicitBooking));
                        busyCount++;
                    } else {
                        while (fallbackIndex < fallbackBookings.length && fallbackRemaining <= 0) {
                            fallbackIndex += 1;
                            fallbackRemaining = fallbackBookings[fallbackIndex]?.quantity || 0;
                        }

                        const fallbackBooking =
                            fallbackIndex < fallbackBookings.length ? fallbackBookings[fallbackIndex] : null;

                        if (fallbackBooking) {
                            statuses.push(buildBookingStatus(stationId, unit, fallbackBooking));
                            fallbackRemaining -= 1;
                            busyCount++;
                        } else {
                            statuses.push({ id: stationId, consoleNumber: unit, status: 'free' });
                        }
                    }
                }
            }

            summaries.push({
                type: id, label: CONSOLE_LABELS[id] || id, icon: CONSOLE_ICONS[id] || "🎮",
                total, free: total - busyCount, busy: busyCount, statuses
            });
        });

        return summaries;
    };

    useEffect(() => {
        loadConsoleStatus();
        const interval = setInterval(loadConsoleStatus, 5000);
        return () => clearInterval(interval);
    }, [cafeId]);

    if (loading && consoleData.length === 0) return <LoadingSpinner size="lg" />;

    if (consoleData.length === 0) {
        return (
            <EmptyState
                icon={<Gamepad2 size={24} />}
                title="No Stations Found"
                description="Configure your cafe stations in Settings to see them here."
                action={<Button variant="primary">Go to Settings</Button>}
            />
        );
    }

    const totalFree = consoleData.reduce((sum, c) => sum + c.free, 0);
    const totalBusy = consoleData.reduce((sum, c) => sum + c.busy, 0);
    const totalEndingSoon = consoleData.reduce((sum, c) => c.statuses.filter(s => s.status === 'ending_soon').length + sum, 0);
    const totalOff = consoleData.reduce((sum, c) => c.statuses.filter(s => s.status === 'inactive').length + sum, 0);

    const activeSessions = consoleData.flatMap(group =>
        group.statuses
            .filter(s => s.status === 'busy' || s.status === 'ending_soon')
            .map(s => ({ ...s, groupLabel: group.label, groupIcon: group.icon }))
    );

    return (
        <div className="space-y-6">
            {/* Active Sessions — shown first */}
            {activeSessions.length > 0 && (
                <div>
                    <h3 className="text-base font-semibold text-white mb-3 px-1">Active Sessions ({activeSessions.length})</h3>
                    <div className={`grid grid-cols-1 ${isMobile ? '' : 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'} gap-4`}>
                        {activeSessions.map(session => {
                            const isEnding = session.status === 'ending_soon';
                            const isOngoing = session.booking?.endTime === 'Ongoing';
                            const timeRemaining = session.booking?.timeRemaining || 0;
                            const duration = session.booking?.duration || 60;
                            const progressPct = isOngoing ? 100 : Math.min(100, (timeRemaining / duration) * 100);

                            const bgColor = isEnding ? 'bg-amber-500/5' : 'bg-red-500/5';
                            const borderColor = isEnding ? 'border-amber-500/40' : 'border-red-500/40';
                            const timerColor = isEnding ? 'text-amber-500' : 'text-red-400';
                            const barColor = isEnding ? 'bg-amber-500' : 'bg-red-500';
                            const badgeBg = isEnding ? 'bg-amber-500/20' : 'bg-red-500/20';
                            const badgeText = isEnding ? 'text-amber-500' : 'text-red-500';
                            const badgeBorder = isEnding ? 'border-amber-500' : 'border-red-500';
                            const badgeLabel = isEnding ? 'ENDING SOON' : 'BUSY';

                            return (
                                <div key={session.id} className={`group relative flex flex-col justify-between ${bgColor} border-2 ${borderColor} rounded-2xl p-5 min-h-[160px] overflow-hidden`}>
                                    {/* Badge */}
                                    <div className={`absolute top-3 right-3 ${badgeBg} border ${badgeBorder} rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${badgeText}`}>
                                        {badgeLabel}
                                    </div>

                                    {/* Header */}
                                    <div className="flex items-center gap-2.5 mb-4">
                                        <div className="w-9 h-9 rounded-xl bg-white/[0.08] flex items-center justify-center shrink-0">
                                            <Gamepad2 size={18} className="text-slate-300" />
                                        </div>
                                        <div>
                                            <div className="text-xs text-slate-500 font-semibold uppercase tracking-wide">
                                                {session.groupLabel}-{String(session.consoleNumber).padStart(2, '0')}
                                            </div>
                                            <div className="text-base font-bold text-white">
                                                {session.booking?.customerName || '—'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Timer */}
                                    <div className="flex justify-between items-end">
                                        <div>
                                            <p className="text-xs text-[#6b7280] mb-0.5">
                                                {isOngoing ? 'Session Time' : 'Time Remaining'}
                                            </p>
                                            <p className={`text-2xl font-bold font-mono ${timerColor}`}>
                                                {formatMinutes(timeRemaining)}
                                            </p>
                                        </div>
                                        {!isOngoing && (
                                            <div className="text-right">
                                                <p className="text-xs text-[#6b7280] mb-0.5">Ends At</p>
                                                <p className="text-sm font-semibold text-white">{session.booking?.endTime}</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Progress bar */}
                                    <div className="absolute bottom-0 left-0 w-full h-1 bg-[#ffffff10]">
                                        <div className={`h-full ${barColor}`} style={{ width: `${progressPct}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Header — stat chips */}
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-5">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3">
                        <div className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                        </div>
                        <h2 className="text-lg font-bold text-white">Live Status</h2>
                        <span className="text-slate-500 text-sm">· updates every 5s</span>
                    </div>
                    <span className="text-slate-400 text-sm">
                        Last updated {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
                        <div className="text-2xl font-bold text-emerald-400">{totalFree}</div>
                        <div className="text-xs text-emerald-600 font-semibold uppercase tracking-wide mt-0.5">Free</div>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
                        <div className="text-2xl font-bold text-red-400">{totalBusy}</div>
                        <div className="text-xs text-red-600 font-semibold uppercase tracking-wide mt-0.5">Busy</div>
                    </div>
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center">
                        <div className="text-2xl font-bold text-amber-400">{totalEndingSoon}</div>
                        <div className="text-xs text-amber-600 font-semibold uppercase tracking-wide mt-0.5">Ending Soon</div>
                    </div>
                    <div className="bg-white/[0.05] border border-white/[0.09]/50 rounded-xl p-3 text-center">
                        <div className="text-2xl font-bold text-slate-400">{totalOff}</div>
                        <div className="text-xs text-slate-600 font-semibold uppercase tracking-wide mt-0.5">Powered Off</div>
                    </div>
                </div>
            </div>

            {/* Station Grid by Type */}
            {consoleData.map((group) => (
                <div key={group.type}>
                    <div className="flex items-center justify-between mb-3 px-1">
                        <div className="flex items-center gap-2">
                            <Gamepad2 size={16} className="text-slate-500 shrink-0" />
                            <span className="text-base font-bold text-white">{group.label}</span>
                            <span className="px-2 py-0.5 rounded-full bg-white/[0.06] text-xs text-slate-400 font-medium">{group.total}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm font-medium">
                            <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                <span className="text-emerald-400">{group.free} Free</span>
                            </span>
                            {group.busy > 0 && (
                                <span className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                    <span className="text-red-400">{group.busy} Busy</span>
                                </span>
                            )}
                        </div>
                    </div>

                    <div className={`grid grid-cols-1 ${isMobile ? '' : 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'} gap-4`}>
                        {group.statuses.map((station) => {
                            const isFree = station.status === 'free';
                            const isEnding = station.status === 'ending_soon';
                            const isBusy = station.status === 'busy' && !isEnding;
                            const isOff = station.status === 'inactive';
                            const isOngoing = station.booking?.endTime === 'Ongoing';
                            const timeRemaining = station.booking?.timeRemaining || 0;
                            const duration = station.booking?.duration || 60;
                            const progressPct = isOngoing ? 100 : Math.min(100, (timeRemaining / duration) * 100);

                            const bgColor = isFree ? 'bg-emerald-500/5' : isEnding ? 'bg-amber-500/5' : isBusy ? 'bg-red-500/5' : 'bg-white/[0.06]/20';
                            const borderColor = isFree ? 'border-emerald-500/40' : isEnding ? 'border-amber-500/40' : isBusy ? 'border-red-500/40' : 'border-white/[0.09]/40';
                            const timerColor = isEnding ? 'text-amber-500' : isBusy ? 'text-red-400' : 'text-emerald-500';
                            const barColor = isFree ? 'bg-emerald-500' : isEnding ? 'bg-amber-500' : 'bg-red-500';
                            const badgeBg = isFree ? 'bg-emerald-500/20' : isEnding ? 'bg-amber-500/20' : isBusy ? 'bg-red-500/20' : 'bg-white/[0.06]';
                            const badgeText = isFree ? 'text-emerald-500' : isEnding ? 'text-amber-500' : isBusy ? 'text-red-500' : 'text-slate-500';
                            const badgeBorder = isFree ? 'border-emerald-500' : isEnding ? 'border-amber-500' : isBusy ? 'border-red-500' : 'border-slate-600';
                            const badgeLabel = isFree ? 'FREE' : isEnding ? 'ENDING SOON' : isBusy ? 'BUSY' : 'OFF';

                            return (
                                <div key={station.id} className={`relative flex flex-col justify-between ${bgColor} border-2 ${borderColor} rounded-2xl p-5 min-h-[140px] overflow-hidden ${isOff ? 'opacity-50' : ''}`}>
                                    {/* Badge */}
                                    <div className={`absolute top-3 right-3 ${badgeBg} border ${badgeBorder} rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${badgeText}`}>
                                        {badgeLabel}
                                    </div>

                                    {/* Header */}
                                    <div className="flex items-center gap-2.5 mb-3">
                                        <div className="w-8 h-8 rounded-lg bg-white/[0.08] flex items-center justify-center shrink-0">
                                            <Gamepad2 size={15} className="text-slate-400" />
                                        </div>
                                        <div>
                                            <div className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{group.label}</div>
                                            <div className="text-base font-bold text-white">#{String(station.consoleNumber).padStart(2, '0')}</div>
                                        </div>
                                    </div>

                                    {/* Content */}
                                    {station.booking ? (
                                        <div className="flex justify-between items-end">
                                            <div>
                                                <div className="flex items-center gap-1 text-[#6b7280] text-xs mb-0.5">
                                                    <User size={11} />
                                                    <span className="truncate max-w-[100px]">{station.booking.customerName}</span>
                                                </div>
                                                <p className={`text-xl font-bold font-mono ${timerColor}`}>
                                                    {formatMinutes(timeRemaining)}
                                                </p>
                                            </div>
                                            {!isOngoing && (
                                                <div className="text-right">
                                                    <p className="text-xs text-[#6b7280] mb-0.5">Ends At</p>
                                                    <p className="text-sm font-semibold text-white">{station.booking.endTime}</p>
                                                </div>
                                            )}
                                        </div>
                                    ) : isOff ? (
                                        <div className="flex items-center gap-1.5 text-slate-500 text-sm">
                                            <AlertCircle size={15} />
                                            <span>Powered Off</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-1.5 text-emerald-500 text-sm">
                                            <MonitorPlay size={15} />
                                            <span>Available</span>
                                        </div>
                                    )}

                                    {/* Progress bar */}
                                    {(station.booking || isFree) && (
                                        <div className="absolute bottom-0 left-0 w-full h-1 bg-[#ffffff10]">
                                            <div className={`h-full ${barColor}`} style={{ width: isFree ? '100%' : `${progressPct}%` }} />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}
