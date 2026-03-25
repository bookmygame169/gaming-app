'use client';

import { useEffect, useState, useMemo } from 'react';
import { CONSOLE_LABELS, CONSOLE_ICONS } from '@/lib/constants';
import { Card, StatusBadge, Button, LoadingSpinner, EmptyState } from './ui';
import { MonitorPlay, Clock, User, Calendar, AlertCircle } from 'lucide-react';

// Helper function to get local date string (YYYY-MM-DD) instead of UTC
const getLocalDateString = (date: Date = new Date()): string => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

// Types
type ConsoleId = "ps5" | "ps4" | "xbox" | "pc" | "pool" | "arcade" | "snooker" | "vr" | "steering" | "racing_sim";

type CafeConsoleCounts = {
    ps5_count: number;
    ps4_count: number;
    xbox_count: number;
    pc_count: number;
    pool_count: number;
    arcade_count: number;
    snooker_count: number;
    vr_count: number;
    steering_wheel_count: number;
    racing_sim_count: number;
};

type BookingData = {
    id: string;
    start_time: string;
    duration: number;
    customer_name: string | null;
    user_id: string | null;
    booking_items: Array<{
        console: ConsoleId;
        quantity: number;
    }>;
    profile?: {
        name: string;
    } | null;
};

type ConsoleStatus = {
    id: string;
    consoleNumber: number;
    status: "free" | "busy" | "ending_soon" | "inactive";
    booking?: {
        customerName: string;
        startTime: string;
        endTime: string;
        timeRemaining: number;
        controllerCount?: number;
    };
};

type ConsoleSummary = {
    type: ConsoleId;
    label: string;
    icon: string;
    total: number;
    free: number;
    busy: number;
    statuses: ConsoleStatus[];
};

interface LiveStatusProps {
    cafeId: string;
    isMobile?: boolean;
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

            if (!cafe) {
                setLoading(false);
                return;
            }

            // Build summaries
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
            { id: "ps5", key: "ps5_count" },
            { id: "ps4", key: "ps4_count" },
            { id: "xbox", key: "xbox_count" },
            { id: "pc", key: "pc_count" },
            { id: "pool", key: "pool_count" },
            { id: "arcade", key: "arcade_count" },
            { id: "snooker", key: "snooker_count" },
            { id: "vr", key: "vr_count" },
            { id: "steering", key: "steering_wheel_count" },
            { id: "racing_sim", key: "racing_sim_count" },
        ];

        const summaries: ConsoleSummary[] = [];
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        // Helper: Parse HH:MM (AM/PM) to minutes
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

        consoleTypes.forEach(({ id, key }) => {
            const total = cafe[key as keyof CafeConsoleCounts] || 0;
            if (total === 0) return;

            // Prepare bookings for this console type
            const consoleBookings: Array<BookingData & { quantity: number; controllerCount: number }> = [];
            activeBookings.forEach(b => {
                const matchingItems = b.booking_items?.filter(item => {
                    const rawConsole = item.console as string;
                    const itemConsole = rawConsole === 'steering_wheel' ? 'steering' : rawConsole;
                    return itemConsole === id;
                }) || [];
                matchingItems.forEach(item => {
                    consoleBookings.push({
                        ...b,
                        quantity: 1,
                        controllerCount: item.quantity || 1
                    });
                });
            });

            const statuses: ConsoleStatus[] = [];
            let busyCount = 0;

            // Memberships
            const consoleTypeMap: Record<string, ConsoleId> = {
                'PC': 'pc', 'PS5': 'ps5', 'PS4': 'ps4', 'Xbox': 'xbox',
                'Pool': 'pool', 'Snooker': 'snooker', 'Arcade': 'arcade', 'VR': 'vr', 'Steering': 'steering', 'Racing Sim': 'racing_sim'
            };

            const consoleMemberships = memberships.filter(m => {
                const type = m.membership_plans?.console_type;
                return type && consoleTypeMap[type] === id;
            });

            // Assign units
            for (let unit = 1; unit <= total; unit++) {
                const stationId = `${id}-${unit.toString().padStart(2, '0')}`;
                
                // Check if station is powered off in database
                const pricingInfo = stationPricing.find((p: any) => p.station_name === stationId);
                const isInactive = pricingInfo && pricingInfo.is_active === false;

                if (isInactive) {
                    statuses.push({ id: stationId, consoleNumber: unit, status: 'inactive' });
                    continue; // Skip further checks for this unit
                }

                // Check membership

                // Check membership
                const membership = consoleMemberships.find(m => m.assigned_console_station === stationId);

                if (membership) {
                    const startTime = new Date(membership.timer_start_time);
                    const elapsed = Math.floor((now.getTime() - startTime.getTime()) / 60000);
                    statuses.push({
                        id: stationId, consoleNumber: unit, status: 'busy',
                        booking: {
                            customerName: (membership.customer_name || 'Member') + ' (Sub)',
                            startTime: startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
                            endTime: 'Ongoing',
                            timeRemaining: elapsed, // elapsed
                        }
                    });
                    busyCount++;
                } else {
                    // Check booking
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
                type: id,
                label: CONSOLE_LABELS[id] || id,
                icon: CONSOLE_ICONS[id] || "🎮",
                total,
                free: total - busyCount,
                busy: busyCount,
                statuses
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
        const interval = setInterval(loadConsoleStatus, 5000); // 5s refresh
        return () => clearInterval(interval);
    }, [cafeId]);

    if (loading && consoleData.length === 0) return <LoadingSpinner size="lg" />;

    if (consoleData.length === 0) {
        return (
            <EmptyState
                icon="🎮"
                title="No Stations Found"
                description="Configure your cafe stations in Settings to see them here."
                action={
                    <Button variant="primary">Go to Settings</Button>
                }
            />
        );
    }

    const totalFree = consoleData.reduce((sum, c) => sum + c.free, 0);
    const totalStations = consoleData.reduce((sum, c) => sum + c.total, 0);

    return (
        <div className="space-y-8">
            {/* Header Summary */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                        </span>
                        Live Status
                    </h2>
                    <p className="text-slate-400 text-sm mt-1">
                        {totalFree} / {totalStations} Stations Available
                    </p>
                </div>
                <div className="flex gap-4 text-xs font-semibold uppercase tracking-wider">
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span className="text-emerald-500">Free</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-500"></span>
                        <span className="text-red-500">Busy</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                        <span className="text-amber-500">Ending Soon</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                        <span className="text-slate-500">Powered Off</span>
                    </div>
                </div>
            </div>

            {/* Grid Sections */}
            {consoleData.map((group) => (
                <div key={group.type}>
                    <div className="flex items-center justify-between mb-4 px-1">
                        <div className="flex items-center gap-2">
                            <span className="text-2xl">{group.icon}</span>
                            <span className="text-lg font-bold text-white capitalize">{group.label}</span>
                            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-xs text-slate-400 font-medium">
                                {group.total}
                            </span>
                        </div>
                        <div className="text-sm font-medium">
                            <span className="text-emerald-500">{group.free} Free</span>
                            <span className="text-slate-600 mx-2">•</span>
                            <span className="text-red-500">{group.busy} Busy</span>
                        </div>
                    </div>

                    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 ${isMobile ? 'gap-3' : ''}`}>
                        {group.statuses.map((station) => {
                            const isFree = station.status === 'free';
                            const isEnding = station.status === 'ending_soon';

                            return (
                                <Card padding="sm" key={station.id} className={`
                                    relative overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-lg
                                    ${isFree ? 'border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/40' : ''}
                                    ${isEnding ? 'border-amber-500/20 bg-amber-500/5 hover:border-amber-500/40' : ''}
                                    ${station.status === 'inactive' ? 'border-slate-500/20 bg-slate-500/5 grayscale opacity-60' : ''}
                                    ${!isFree && !isEnding && station.status !== 'inactive' ? 'border-red-500/20 bg-red-500/5 hover:border-red-500/40' : ''}
                                `}>
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className={`
                                                w-10 h-10 rounded-xl flex items-center justify-center text-xl
                                                ${isFree ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-800 text-slate-400'}
                                            `}>
                                                {group.icon}
                                            </div>
                                            <div>
                                                <div className="font-bold text-white leading-none">
                                                    #{String(station.consoleNumber).padStart(2, '0')}
                                                </div>
                                                <div className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mt-1">
                                                    {group.label}
                                                </div>
                                            </div>
                                        </div>
                                        <Badge status={station.status} />
                                    </div>

                                    {station.booking ? (
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 text-sm text-slate-300">
                                                <User size={14} className="text-slate-500" />
                                                <span className="truncate flex-1 font-medium">{station.booking.customerName}</span>
                                            </div>

                                            <div className={`
                                                p-2 rounded-lg border flex items-center justify-between
                                                ${isEnding ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' : 'bg-slate-800/50 border-slate-700/50 text-slate-400'}
                                            `}>
                                                <div className="flex items-center gap-2">
                                                    <Clock size={14} />
                                                    <span className="text-xs font-bold">
                                                        {station.booking.endTime === 'Ongoing' ?
                                                            `${station.booking.timeRemaining}m elapsed` :
                                                            `${station.booking.timeRemaining}m left`
                                                        }
                                                    </span>
                                                </div>
                                                <span className="text-[10px] opacity-70">
                                                    {station.booking.endTime === 'Ongoing' ? 'SUB' : 'Ends ' + station.booking.endTime.split(' ')[0]}
                                                </span>
                                            </div>
                                        </div>
                                    ) : station.status === 'inactive' ? (
                                        <div className="py-4 flex flex-col items-center justify-center text-slate-500/50">
                                            <AlertCircle size={32} strokeWidth={1.5} />
                                            <span className="text-xs font-medium text-slate-500 mt-2">Powered Off</span>
                                        </div>
                                    ) : (
                                        <div className="py-4 flex flex-col items-center justify-center text-emerald-500/50">
                                            <MonitorPlay size={32} strokeWidth={1.5} />
                                            <span className="text-xs font-medium text-emerald-500 mt-2">Available</span>
                                        </div>
                                    )}
                                </Card>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}

function Badge({ status }: { status: 'free' | 'busy' | 'ending_soon' | 'inactive' }) {
    if (status === 'free') {
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 uppercase">Free</span>;
    }
    if (status === 'busy') {
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-500 border border-red-500/20 uppercase">Busy</span>;
    }
    if (status === 'inactive') {
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-500/10 text-slate-500 border border-slate-500/20 uppercase">Off</span>;
    }
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 uppercase">Ending</span>;
}
