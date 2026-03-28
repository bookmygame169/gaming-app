'use client';

import { useEffect, useState } from 'react';
import { CONSOLE_LABELS, CONSOLE_ICONS } from '@/lib/constants';
import { Button, LoadingSpinner, EmptyState } from './ui';
import { MonitorPlay, Clock, User, AlertCircle, Wifi } from 'lucide-react';

// Types
type ConsoleId = "ps5" | "ps4" | "xbox" | "pc" | "pool" | "arcade" | "snooker" | "vr" | "steering" | "racing_sim";

type CafeConsoleCounts = {
    ps5_count: number; ps4_count: number; xbox_count: number; pc_count: number;
    pool_count: number; arcade_count: number; snooker_count: number; vr_count: number;
    steering_wheel_count: number; racing_sim_count: number;
};

type BookingData = {
    id: string; start_time: string; duration: number; customer_name: string | null;
    user_id: string | null;
    booking_items: Array<{ console: ConsoleId; quantity: number }>;
    profile?: { name: string } | null;
};

type ConsoleStatus = {
    id: string; consoleNumber: number;
    status: "free" | "busy" | "ending_soon" | "inactive";
    booking?: {
        customerName: string; startTime: string; endTime: string;
        timeRemaining: number; controllerCount?: number;
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
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

export function LiveStatus({ cafeId, isMobile = false }: LiveStatusProps) {
    const [consoleData, setConsoleData] = useState<ConsoleSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(new Date());

    const loadConsoleStatus = async () => {
        try {
            const res = await fetch(`/api/owner/live-status?cafeId=${cafeId}`);
            if (!res.ok) throw new Error('Failed to fetch live status');
            const { cafe, bookings, activeSubscriptions, stationPricing } = await res.json();
            if (!cafe) { setLoading(false); return; }
            const summaries = buildConsoleSummaries(cafe, bookings || [], activeSubscriptions || [], stationPricing || []);
            setConsoleData(summaries);
            setLastUpdated(new Date());
        } catch (error) {
            console.error("Error loading status:", error);
        } finally {
            setLoading(false);
        }
    };

    const buildConsoleSummaries = (cafe: CafeConsoleCounts, bookings: BookingData[], memberships: any[], stationPricing: any[]): ConsoleSummary[] => {
        const consoleTypes: Array<{ id: ConsoleId; key: string }> = [
            { id: "ps5", key: "ps5_count" }, { id: "ps4", key: "ps4_count" },
            { id: "xbox", key: "xbox_count" }, { id: "pc", key: "pc_count" },
            { id: "pool", key: "pool_count" }, { id: "arcade", key: "arcade_count" },
            { id: "snooker", key: "snooker_count" }, { id: "vr", key: "vr_count" },
            { id: "steering", key: "steering_wheel_count" }, { id: "racing_sim", key: "racing_sim_count" },
        ];

        const summaries: ConsoleSummary[] = [];
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

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

        const activeBookings = bookings.filter(b => {
            if (!b.start_time || !b.duration) return false;
            const endMinutes = parseTimeToMinutes(b.start_time) + b.duration;
            return currentMinutes < endMinutes;
        });

        const consoleTypeMap: Record<string, ConsoleId> = {
            'PC': 'pc', 'PS5': 'ps5', 'PS4': 'ps4', 'Xbox': 'xbox',
            'Pool': 'pool', 'Snooker': 'snooker', 'Arcade': 'arcade',
            'VR': 'vr', 'Steering': 'steering', 'Racing Sim': 'racing_sim'
        };

        consoleTypes.forEach(({ id, key }) => {
            const total = cafe[key as keyof CafeConsoleCounts] || 0;
            if (total === 0) return;

            const consoleBookings: Array<BookingData & { quantity: number; controllerCount: number }> = [];
            activeBookings.forEach(b => {
                const matchingItems = b.booking_items?.filter(item => {
                    const rawConsole = item.console as string;
                    const itemConsole = rawConsole === 'steering_wheel' ? 'steering' : rawConsole;
                    return itemConsole === id;
                }) || [];
                matchingItems.forEach(item => {
                    consoleBookings.push({ ...b, quantity: 1, controllerCount: item.quantity || 1 });
                });
            });

            const consoleMemberships = memberships.filter(m => {
                const type = m.membership_plans?.console_type;
                return type && consoleTypeMap[type] === id;
            });

            const statuses: ConsoleStatus[] = [];
            let busyCount = 0;

            for (let unit = 1; unit <= total; unit++) {
                const stationId = `${id}-${unit.toString().padStart(2, '0')}`;
                const pricingInfo = stationPricing.find((p: any) => p.station_name === stationId);
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
                    const booking = findBookingForUnit(unit, consoleBookings);
                    if (booking) {
                        const startMinutes = parseTimeToMinutes(booking.start_time);
                        const endMinutes = startMinutes + booking.duration;
                        const timeRemaining = endMinutes - currentMinutes;
                        const hasStarted = currentMinutes >= startMinutes;
                        statuses.push({
                            id: stationId, consoleNumber: unit,
                            status: timeRemaining <= 15 ? 'ending_soon' : 'busy',
                            booking: {
                                customerName: booking.customer_name || booking.profile?.name || 'Guest',
                                startTime: booking.start_time,
                                endTime: formatEndTime(startMinutes, booking.duration),
                                timeRemaining: hasStarted ? timeRemaining : (startMinutes - currentMinutes),
                                controllerCount: booking.controllerCount
                            }
                        });
                        busyCount++;
                    } else {
                        statuses.push({ id: stationId, consoleNumber: unit, status: 'free' });
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

    const findBookingForUnit = (unit: number, bookings: any[]) => {
        let current = 1;
        for (const b of bookings) {
            const end = current + b.quantity - 1;
            if (unit >= current && unit <= end) return b;
            current += b.quantity;
        }
        return null;
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
                icon="🎮"
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
    const totalStations = consoleData.reduce((sum, c) => sum + c.total, 0);

    const activeSessions = consoleData.flatMap(group =>
        group.statuses
            .filter(s => s.status === 'busy' || s.status === 'ending_soon')
            .map(s => ({ ...s, groupLabel: group.label, groupIcon: group.icon }))
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
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

                {/* Stat chips */}
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
                    <div className="bg-slate-700/30 border border-slate-700/50 rounded-xl p-3 text-center">
                        <div className="text-2xl font-bold text-slate-400">{totalOff}</div>
                        <div className="text-xs text-slate-600 font-semibold uppercase tracking-wide mt-0.5">Powered Off</div>
                    </div>
                </div>
            </div>

            {/* Active Sessions */}
            {activeSessions.length > 0 && (
                <div>
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">
                        Active Sessions ({activeSessions.length})
                    </h3>
                    <div className={`grid grid-cols-1 ${isMobile ? '' : 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'} gap-3`}>
                        {activeSessions.map(session => {
                            const isEnding = session.status === 'ending_soon';
                            const isOngoing = session.booking?.endTime === 'Ongoing';
                            return (
                                <div key={session.id} className={`rounded-xl border p-4 flex items-center gap-3
                                    ${isEnding ? 'bg-amber-500/5 border-amber-500/25' : 'bg-red-500/5 border-red-500/20'}`}>
                                    <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 bg-slate-800/80">
                                        {session.groupIcon}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-1 mb-0.5">
                                            <span className="font-bold text-white text-sm">
                                                {session.groupLabel} #{String(session.consoleNumber).padStart(2, '0')}
                                            </span>
                                            {isEnding
                                                ? <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/25 uppercase">Ending Soon</span>
                                                : <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/15 text-red-400 border border-red-500/25 uppercase">Busy</span>
                                            }
                                        </div>
                                        <div className="flex items-center gap-1 text-slate-400 text-xs mb-1">
                                            <User size={11} />
                                            <span className="truncate">{session.booking?.customerName || '—'}</span>
                                        </div>
                                        <div className={`flex items-center gap-1 text-xs font-semibold ${isEnding ? 'text-amber-400' : 'text-slate-300'}`}>
                                            <Clock size={11} />
                                            {isOngoing
                                                ? <span>{formatMinutes(session.booking?.timeRemaining || 0)} elapsed (Membership)</span>
                                                : <span>{formatMinutes(session.booking?.timeRemaining || 0)} left · Ends {session.booking?.endTime}</span>
                                            }
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Station Grid by Type */}
            {consoleData.map((group) => (
                <div key={group.type}>
                    {/* Group Header */}
                    <div className="flex items-center justify-between mb-3 px-1">
                        <div className="flex items-center gap-2">
                            <span className="text-xl">{group.icon}</span>
                            <span className="text-base font-bold text-white">{group.label}</span>
                            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-xs text-slate-400 font-medium">{group.total}</span>
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

                    {/* Station Cards */}
                    <div className={`grid grid-cols-2 ${isMobile ? 'gap-2' : 'sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3'}`}>
                        {group.statuses.map((station) => {
                            const isFree = station.status === 'free';
                            const isEnding = station.status === 'ending_soon';
                            const isBusy = station.status === 'busy';
                            const isOff = station.status === 'inactive';
                            const isOngoing = station.booking?.endTime === 'Ongoing';

                            return (
                                <div key={station.id} className={`
                                    relative rounded-xl border p-3 transition-all duration-200
                                    ${isFree ? 'border-emerald-500/20 bg-emerald-500/5' : ''}
                                    ${isEnding ? 'border-amber-500/30 bg-amber-500/5' : ''}
                                    ${isBusy && !isEnding ? 'border-red-500/20 bg-red-500/5' : ''}
                                    ${isOff ? 'border-slate-700/40 bg-slate-800/20 opacity-50' : ''}
                                `}>
                                    {/* Station Label */}
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-base">{group.icon}</span>
                                            <span className="font-bold text-white text-sm">#{String(station.consoleNumber).padStart(2, '0')}</span>
                                        </div>
                                        <StationBadge status={station.status} />
                                    </div>

                                    {/* Content */}
                                    {station.booking ? (
                                        <div>
                                            <div className="flex items-center gap-1 text-slate-300 text-xs mb-2">
                                                <User size={11} className="text-slate-500 flex-shrink-0" />
                                                <span className="truncate font-medium">{station.booking.customerName}</span>
                                            </div>
                                            <div className={`rounded-lg px-2 py-1.5 border text-xs font-bold flex items-center justify-between
                                                ${isEnding ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-slate-800/60 border-slate-700/50 text-slate-300'}`}>
                                                <span className="flex items-center gap-1">
                                                    <Clock size={11} />
                                                    {isOngoing
                                                        ? `${formatMinutes(station.booking.timeRemaining)} elapsed`
                                                        : `${formatMinutes(station.booking.timeRemaining)} left`
                                                    }
                                                </span>
                                                <span className="text-[10px] opacity-60 ml-1">
                                                    {isOngoing ? 'SUB' : station.booking.endTime}
                                                </span>
                                            </div>
                                        </div>
                                    ) : isOff ? (
                                        <div className="flex items-center gap-1.5 text-slate-600 text-xs mt-1">
                                            <AlertCircle size={13} />
                                            <span>Powered Off</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-1.5 text-emerald-600 text-xs mt-1">
                                            <MonitorPlay size={13} />
                                            <span>Available</span>
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

function StationBadge({ status }: { status: 'free' | 'busy' | 'ending_soon' | 'inactive' }) {
    if (status === 'free') return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 uppercase">Free</span>;
    if (status === 'busy') return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/10 text-red-500 border border-red-500/20 uppercase">Busy</span>;
    if (status === 'inactive') return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-500/10 text-slate-500 border border-slate-500/20 uppercase">Off</span>;
    return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 uppercase">Ending</span>;
}
