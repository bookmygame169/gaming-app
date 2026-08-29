'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { StationExitPassword } from './StationExitPassword';
import { StationPlayRequests } from './StationPlayRequests';
import React, { useState } from 'react';
import { getBookingItemDurationMinutes, isBookingActiveNow, isBookingItemActiveNow } from '@/lib/bookingFilters';
import { isBillableRevenueBooking } from '@/lib/ownerRevenue';
import { WhatToFix, type Insight } from './consoleUi';
import { CafeRow, BookingRow } from '../types';

interface StationsTabProps {
    currentCafe: CafeRow | null;
    bookings: BookingRow[];
    stationPricing: Record<string, any>;
    poweredOffStations: Set<string>;
    maintenanceStations?: Set<string>;
    isMobile?: boolean;
    onTogglePower: (stationName: string) => void;
    onToggleMaintenance?: (stationName: string) => void;
    onEditPricing: (station: any) => void;
    onDeleteStation: (station: { name: string; displayName: string; type: string }) => void;
    onAddStation: () => void;
    onSetupLock?: (station: { name: string; displayName: string; type: string }) => void;
    theme: any;
}

function parseStartMinutes(startTime: string): number | null {
    const m = startTime.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if (!m) return null;
    let h = parseInt(m[1]);
    const min = parseInt(m[2]);
    const p = m[3]?.toLowerCase();
    if (p === 'pm' && h !== 12) h += 12;
    else if (p === 'am' && h === 12) h = 0;
    return h * 60 + min;
}

function formatEndTime(startMin: number, duration: number): string {
    const endMin = (startMin + duration) % 1440;
    const h = Math.floor(endMin / 60);
    const m = endMin % 60;
    const p = h >= 12 ? 'pm' : 'am';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${m.toString().padStart(2, '0')} ${p}`;
}

function getAssignedStations(title: string | null | undefined): string[] {
    const stationPart = title?.split('|')[1]?.trim();
    if (!stationPart) return [];

    return stationPart
        .split(',')
        .map((station) => station.trim().toLowerCase())
        .filter(Boolean);
}

function getOccupiedUnits(consoleType: string, quantity: number | null | undefined): number {
    const normalized = consoleType.toLowerCase();
    if (normalized === 'ps5' || normalized === 'ps4' || normalized === 'xbox') {
        return 1;
    }

    return Math.max(1, quantity || 1);
}

export function StationsTab({
    currentCafe,
    bookings,
    stationPricing,
    poweredOffStations,
    maintenanceStations = new Set(),
    onTogglePower,
    onToggleMaintenance,
    onEditPricing,
    onDeleteStation,
    onAddStation,
    onSetupLock,
}: StationsTabProps) {
    const [stationSearch, setStationSearch] = useState('');
    const [stationTypeFilter, setStationTypeFilter] = useState('all');
    const [stationStatusFilter] = useState('all');

    if (!currentCafe) return null;

    const consoleTypes = [
        { id: 'pc', key: 'pc_count', name: 'PC', icon: '🖥️', bgColor: 'rgba(216, 255, 60, 0.15)', color: '#d8ff3c' },
        { id: 'ps5', key: 'ps5_count', name: 'PS5', icon: '🎮', bgColor: 'rgba(216, 255, 60, 0.15)', color: '#d8ff3c' },
        { id: 'ps4', key: 'ps4_count', name: 'PS4', icon: '🎮', bgColor: 'rgba(216, 255, 60, 0.15)', color: '#d8ff3c' },
        { id: 'xbox', key: 'xbox_count', name: 'Xbox', icon: '🎮', bgColor: 'rgba(216, 255, 60, 0.15)', color: '#d8ff3c' },
        { id: 'vr', key: 'vr_count', name: 'VR', icon: '🥽', bgColor: 'rgba(236, 72, 153, 0.15)', color: '#ec4899' },
        { id: 'steering', key: 'steering_wheel_count', name: 'Steering Wheel', icon: '🏎️', bgColor: 'rgba(251, 146, 60, 0.15)', color: '#fb923c' },
        { id: 'racing_sim', key: 'racing_sim_count', name: 'Racing Sim', icon: '🏁', bgColor: 'rgba(255, 69, 0, 0.15)', color: '#ff4500' },
        { id: 'pool', key: 'pool_count', name: 'Pool', icon: '🎱', bgColor: 'rgba(255,165,60,.15)', color: '#ffa53c' },
        { id: 'snooker', key: 'snooker_count', name: 'Snooker', icon: '🎱', bgColor: 'rgba(132, 204, 22, 0.15)', color: '#84cc16' },
        { id: 'arcade', key: 'arcade_count', name: 'Arcade', icon: '🕹️', bgColor: 'rgba(255, 92, 43, 0.15)', color: '#ff5c2b' },
    ];

    // --- Real-time occupancy ---
    // Build stationOccupancy: stationId → { customerName, endTime }
    // based on today's in-progress bookings only
    const activeByConsole = new Map<string, { customerName: string; endTime: string }[]>();
    const stationOccupancy = new Map<string, { customerName: string; endTime: string }>();

    bookings
        .filter(b => isBookingActiveNow(b))
        .forEach(b => {
            const customerName = b.customer_name || b.user_name || 'Customer';
            (b.booking_items || []).forEach(item => {
                if (!isBookingItemActiveNow(b, item)) return;
                if (!item.console) return;
                const ct = item.console.toLowerCase();
                const itemDuration = getBookingItemDurationMinutes(item, b.duration || 60);
                let endTimeStr = '';
                if (b.start_time) {
                    const startMin = parseStartMinutes(b.start_time);
                    if (startMin !== null) endTimeStr = formatEndTime(startMin, itemDuration);
                }

                const assignedStations = getAssignedStations(item.title);
                if (assignedStations.length > 0) {
                    assignedStations.forEach((stationName) => {
                        stationOccupancy.set(stationName, { customerName, endTime: endTimeStr });
                    });
                    return;
                }

                const qty = getOccupiedUnits(ct, item.quantity);
                const existing = activeByConsole.get(ct) || [];
                for (let i = 0; i < qty; i++) {
                    existing.push({ customerName, endTime: endTimeStr });
                }
                activeByConsole.set(ct, existing);
            });
        });

    // Map stationId (e.g. "ps5-01") → session info
    activeByConsole.forEach((sessions, consoleType) => {
        const consoleMeta = consoleTypes.find((entry) => entry.id === consoleType);
        const totalStationsForType = consoleMeta ? ((currentCafe as any)[consoleMeta.key] || 0) : 0;
        let sessionIndex = 0;

        for (let index = 1; index <= totalStationsForType && sessionIndex < sessions.length; index += 1) {
            const stationId = `${consoleType}-${String(index).padStart(2, '0')}`;
            if (stationOccupancy.has(stationId)) continue;

            stationOccupancy.set(stationId, sessions[sessionIndex]);
            sessionIndex += 1;
        }
    });

    // ── seven days of earning, per station ──
    //
    // Attribution is honest about what it can know. A booking that named its
    // machine is credited to that machine. One that did not — every booking
    // before Billing started sending a station — is spread evenly across the
    // stations of its console type, because that is what physically happened:
    // somebody sat at one of them and there is no record of which.
    const OPEN_HOURS_PER_DAY = (() => {
        const match = (currentCafe as any)?.opening_hours?.match(
            /(\d{1,2})(?::\d{2})?\s*(AM|PM)\s*[-–]\s*(\d{1,2})(?::\d{2})?\s*(AM|PM)/i
        );
        if (!match) return 12;
        let open = parseInt(match[1], 10);
        let close = parseInt(match[3], 10);
        if (match[2].toUpperCase() === 'PM' && open !== 12) open += 12;
        else if (match[2].toUpperCase() === 'AM' && open === 12) open = 0;
        if (match[4].toUpperCase() === 'PM' && close !== 12) close += 12;
        else if (match[4].toUpperCase() === 'AM' && close === 12) close = 0;
        const span = close - open;
        return span > 0 ? span : 12;
    })();

    // Both ends. Without an upper bound an advance booking for next Friday
    // counts as revenue this station has already earned.
    const todayIso = new Date().toISOString().slice(0, 10);
    const weekAgoIso = (() => {
        const d = new Date();
        d.setDate(d.getDate() - 6);
        return d.toISOString().slice(0, 10);
    })();

    const stationWeek = new Map<string, { minutes: number; revenue: number }>();
    const typeWeek = new Map<string, { minutes: number; revenue: number }>();

    bookings
        // The same filter Reports counts revenue through. Without it these two
        // screens quote different figures for the same week, and the one that
        // is wrong is whichever the owner is not looking at.
        .filter((b) => isBillableRevenueBooking(b)
            && !b.deleted_at
            && (b.booking_date || '') >= weekAgoIso
            && (b.booking_date || '') <= todayIso
            && b.status !== 'cancelled')
        .forEach((b) => {
            (b.booking_items || []).forEach((item) => {
                if (!item.console) return;
                const minutes = getBookingItemDurationMinutes(item, b.duration || 60);
                // A membership session holds the machine but was paid for on the
                // plan, not at the station — Reports leaves it out of console
                // revenue for that reason. It still occupies the hours.
                const revenue = b.source === 'membership' ? 0 : Number(item.price) || 0;
                const named = getAssignedStations(item.title);
                if (named.length > 0) {
                    named.forEach((name) => {
                        const bucket = stationWeek.get(name) || { minutes: 0, revenue: 0 };
                        bucket.minutes += minutes / named.length;
                        bucket.revenue += revenue / named.length;
                        stationWeek.set(name, bucket);
                    });
                } else {
                    const key = item.console.toLowerCase();
                    const bucket = typeWeek.get(key) || { minutes: 0, revenue: 0 };
                    bucket.minutes += minutes;
                    bucket.revenue += revenue;
                    typeWeek.set(key, bucket);
                }
            });
        });

    // Generate stations list
    const allStations: any[] = [];
    consoleTypes.forEach((consoleType) => {
        const count = (currentCafe as any)[consoleType.key] || 0;
        for (let i = 1; i <= count; i++) {
            const stationName = `${consoleType.id}-${String(i).padStart(2, '0')}`;
            allStations.push({
                id: stationName,
                name: stationName,
                displayName: `${consoleType.name}-${String(i).padStart(2, '0')}`,
                type: consoleType.name,
                icon: consoleType.icon,
                bgColor: consoleType.bgColor,
                color: consoleType.color,
            });
        }
    });

    /** This station's week: what it was named on, plus its share of the rest. */
    const weekFor = (stationName: string, consoleType: string) => {
        const named = stationWeek.get(stationName) || { minutes: 0, revenue: 0 };
        const pool = typeWeek.get(consoleType.toLowerCase());
        const peers = allStations.filter(
            (st) => String(st.name).split('-')[0] === consoleType.toLowerCase()
        ).length || 1;
        const minutes = named.minutes + (pool ? pool.minutes / peers : 0);
        const revenue = named.revenue + (pool ? pool.revenue / peers : 0);
        const openHours = OPEN_HOURS_PER_DAY * 7;
        return {
            hours: minutes / 60,
            revenue,
            util: openHours > 0 ? Math.min(100, Math.round((minutes / 60 / openHours) * 100)) : 0,
            perOpenHour: openHours > 0 ? revenue / openHours : 0,
        };
    };

    /** Each console type's earning per hour the café is open. */
    const yieldByType = (() => {
        const byType = new Map<string, { label: string; count: number; revenue: number }>();
        allStations.forEach((st) => {
            const key = String(st.name).split('-')[0];
            const entry = byType.get(key) || { label: st.type, count: 0, revenue: 0 };
            entry.count += 1;
            entry.revenue += weekFor(st.name, key).revenue;
            byType.set(key, entry);
        });
        const openHours = OPEN_HOURS_PER_DAY * 7;
        return [...byType.entries()]
            .map(([type, v]) => ({
                type,
                ...v,
                // Per open hour of the whole type, not per station: two idle PCs
                // and one busy one is a worse business than one busy PC.
                perOpenHour: openHours > 0 && v.count > 0 ? v.revenue / (openHours * v.count) : 0,
            }))
            .filter((r) => r.count > 0)
            .sort((a, b) => b.perOpenHour - a.perOpenHour);
    })();
    const bestYield = Math.max(1, ...yieldByType.map((r) => r.perOpenHour));


    const exportStationsCsv = () => {
        const header = ['Station', 'Type', 'Rate', 'Status', 'Hours 7d', 'Utilisation %', 'Revenue 7d', 'Per open hour'];
        const rows = filteredStations.map((st) => {
            const w = weekFor(st.name, String(st.name).split('-')[0]);
            const state = poweredOffStations.has(st.name) ? 'off'
                : maintenanceStations.has(st.name) ? 'maintenance'
                : stationOccupancy.has(st.name) ? 'in use' : 'free';
            return [
                String(st.name).toUpperCase(),
                st.type,
                String(hourlyRateFor(st) || ''),
                state,
                w.hours.toFixed(1),
                String(w.util),
                String(Math.round(w.revenue)),
                String(Math.round(w.perOpenHour)),
            ];
        });
        const escape = (cell: string) => `"${String(cell).replace(/"/g, '""')}"`;
        const csv = [header, ...rows].map((cols) => cols.map(escape).join(',')).join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `stations-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    // Summary counts for header. Use a union so a powered-off occupied station
    // is not subtracted twice.
    const stationIds = new Set(allStations.map((station) => station.name));
    const occupiedStationIds = new Set([...stationOccupancy.keys()].filter((name) => stationIds.has(name)));
    const maintenanceStationIds = new Set([...maintenanceStations].filter((name) => stationIds.has(name)));
    const poweredOffStationIds = new Set([...poweredOffStations].filter((name) => stationIds.has(name)));
    const unavailableStationIds = new Set([
        ...occupiedStationIds,
        ...maintenanceStationIds,
        ...poweredOffStationIds,
    ]);
    const totalStations = allStations.length;
    const occupiedCount = occupiedStationIds.size;
    const maintenanceCount = maintenanceStationIds.size;
    const offCount = poweredOffStationIds.size;
    const freeCount = Math.max(0, totalStations - unavailableStationIds.size);

    const filteredStations = allStations.filter(station => {
        const matchesSearch =
            station.name.toLowerCase().includes(stationSearch.toLowerCase()) ||
            station.type.toLowerCase().includes(stationSearch.toLowerCase());
        const matchesType = stationTypeFilter === 'all' || station.type === stationTypeFilter;

        const isOff = poweredOffStations.has(station.name);
        const isMaintenance = maintenanceStations.has(station.name);
        const isOccupied = stationOccupancy.has(station.name);

        const matchesStatus =
            stationStatusFilter === 'all' ||
            (stationStatusFilter === 'occupied' && !isOff && !isMaintenance && isOccupied) ||
            (stationStatusFilter === 'free' && !isOff && !isMaintenance && !isOccupied) ||
            (stationStatusFilter === 'maintenance' && isMaintenance) ||
            (stationStatusFilter === 'inactive' && isOff);

        return matchesSearch && matchesType && matchesStatus;
    });


    /** The hourly rate for a station, whatever shape its pricing row takes. */
    const hourlyRateFor = (station: any) => {
        const saved = stationPricing[station.name];
        if (!saved) return null;
        if (['PS5', 'Xbox'].includes(station.type)) return saved.controller_1_full_hour ?? null;
        if (station.type === 'PS4') return saved.single_player_rate ?? null;
        return saved.hourly_rate ?? null;
    };

    const notEarning = allStations.filter(
        (station) => poweredOffStations.has(station.name) || maintenanceStations.has(station.name)
    );

    /** What this week's numbers say about the floor, when they say anything. */
    const insights: Insight[] = (() => {
        const out: Insight[] = [];
        const ranked = yieldByType.filter((r) => r.revenue > 0 || r.count > 0);

        // The gap between the best and worst kind of machine, per hour open.
        if (ranked.length >= 2) {
            const best = ranked[0];
            const worst = ranked[ranked.length - 1];
            if (best.perOpenHour > 0 && best.perOpenHour >= worst.perOpenHour * 3) {
                out.push({
                    id: 'yield-gap',
                    tone: 'orange',
                    title: `${worst.label} earns ₹${Math.round(worst.perOpenHour)} an open hour against ${best.label}'s ₹${Math.round(best.perOpenHour)}`,
                    // A multiple against zero is not a multiple. Say it plainly
                    // instead of dividing by a guard and reporting the guard.
                    detail: worst.perOpenHour < 1
                        ? `${worst.count} ${worst.count === 1 ? 'machine' : 'machines'} took nothing at all in seven days, while ${best.label} returned ₹${Math.round(best.perOpenHour)} for every hour the doors were open.`
                        : `${worst.count} ${worst.count === 1 ? 'machine' : 'machines'} taking ₹${Math.round(worst.revenue).toLocaleString('en-IN')} in seven days. The floor space earns ${Math.round(best.perOpenHour / worst.perOpenHour)}× more as ${best.label}.`,
                });
            }
        }

        // Busy and still not paying for itself — usually a membership sitting on it.
        const soaked = filteredStations
            .map((st) => ({ st, w: weekFor(st.name, String(st.name).split('-')[0]) }))
            .filter(({ w }) => w.util >= 40 && w.perOpenHour < 10)
            .sort((a, b) => b.w.util - a.w.util)[0];
        if (soaked) {
            out.push({
                id: 'busy-not-earning',
                tone: 'orange',
                title: `${String(soaked.st.name).toUpperCase()} is occupied ${soaked.w.util}% of opening hours and returns ₹${Math.round(soaked.w.perOpenHour)} an hour`,
                detail: `${soaked.w.hours.toFixed(0)} hours used for ₹${Math.round(soaked.w.revenue).toLocaleString('en-IN')}. Usually an unlimited pass holding a machine that walk-ins would pay for.`,
            });
        }

        // Machines that took nothing at all.
        const idle = filteredStations.filter(
            (st) => weekFor(st.name, String(st.name).split('-')[0]).revenue === 0
        );
        if (idle.length > 0) {
            out.push({
                id: 'idle',
                tone: idle.length > 2 ? 'orange' : 'ink',
                title: `${idle.length} ${idle.length === 1 ? 'station' : 'stations'} took nothing in seven days`,
                detail: `${idle.slice(0, 4).map((st) => String(st.name).toUpperCase()).join(', ')}${idle.length > 4 ? ` and ${idle.length - 4} more` : ''}. Worth knowing whether they are broken, off the booking list, or simply never chosen.`,
            });
        }

        // Not earning because somebody switched them off.
        if (notEarning.length > 0) {
            out.push({
                id: 'off-floor',
                tone: 'orange',
                title: `${notEarning.length} ${notEarning.length === 1 ? 'machine is' : 'machines are'} off the floor`,
                detail: 'Powered off or in maintenance, so they cannot be booked. Every hour one stays down is an hour of rent it does not pay.',
            });
        }

        return out;
    })();

    const typeCounts = consoleTypes
        .map((entry) => ({
            id: entry.name,
            label: entry.name.toUpperCase(),
            n: allStations.filter((station) => station.type === entry.name).length,
        }))
        .filter((entry) => entry.n > 0);

    const kpis = [
        { k: 'STATIONS', v: String(totalStations), c: '#f2f0ea', sub: `${consoleTypes.filter((t) => allStations.some((s) => s.type === t.name)).length} kinds on the floor` },
        { k: 'IN USE', v: String(occupiedCount), c: occupiedCount > 0 ? '#d8ff3c' : '#f2f0ea', sub: occupiedCount > 0 ? 'earning right now' : 'nobody playing' },
        { k: 'FREE', v: String(freeCount), c: '#f2f0ea', sub: 'ready to seat someone' },
        {
            k: 'NOT EARNING',
            v: String(maintenanceCount + offCount),
            c: maintenanceCount + offCount > 0 ? '#ff5c2b' : '#f2f0ea',
            sub: `${maintenanceCount} in maintenance · ${offCount} switched off`,
        },
    ];

    return (
        <div className="flex flex-col gap-[18px]">
            {/* First on the page: everything else here can wait, and a person
                sat at a locked PC cannot. Renders nothing when the queue is
                empty. */}
            {currentCafe?.id && <StationPlayRequests cafeId={currentCafe.id} />}

            <section className="grid grid-cols-2 gap-px border border-[#f2f0ea]/10 bg-[#f2f0ea]/10 xl:grid-cols-4">
                {kpis.map((kpi) => (
                    <div key={kpi.k} className="flex flex-col gap-[9px] bg-[#111113] px-[18px] py-4">
                        <span className="truncate font-mono text-[9.5px] tracking-[0.18em] text-[#f2f0ea]/[0.42]">
                            {kpi.k}
                        </span>
                        <span
                            className="text-[30px] font-black leading-[0.9] tracking-[-0.025em]"
                            style={{ color: kpi.c }}
                        >
                            {kpi.v}
                        </span>
                        <span className="truncate font-mono text-[10.5px] text-[#f2f0ea]/40">
                            {kpi.sub}
                        </span>
                    </div>
                ))}
            </section>

            {notEarning.length > 0 && (
                <div className="flex flex-wrap items-center gap-[9px] border border-[#ff5c2b]/[0.28] bg-[#ff5c2b]/[0.06] px-[15px] py-[13px]">
                    <span className="whitespace-nowrap font-mono text-[10px] tracking-[0.16em] text-[#ff5c2b]">
                        NOT EARNING · {notEarning.length}
                    </span>
                    {notEarning.slice(0, 6).map((station) => {
                        const isMaintenance = maintenanceStations.has(station.name);
                        return (
                            <button
                                key={station.name}
                                type="button"
                                onClick={() =>
                                    isMaintenance
                                        ? onToggleMaintenance?.(station.name)
                                        : onTogglePower(station.name)
                                }
                                className="flex items-center gap-2 border border-[#f2f0ea]/[0.14] bg-[#111113] px-2.5 py-[7px] transition-colors hover:border-[#d8ff3c]"
                            >
                                <span className="whitespace-nowrap font-mono text-xs font-semibold tracking-[0.04em] text-[#f2f0ea]">
                                    {station.name.toUpperCase()}
                                </span>
                                <span className="whitespace-nowrap font-mono text-[10px] text-[#f2f0ea]/45">
                                    {isMaintenance ? 'MAINTENANCE' : 'OFF'}
                                </span>
                                <span className="font-mono text-[9.5px] tracking-[0.1em] text-[#d8ff3c]">
                                    {isMaintenance ? 'BACK IN' : 'TURN ON'}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-[9px]">
                <div className="flex flex-wrap gap-1.5">
                    {[{ id: 'all', label: 'ALL', n: allStations.length }, ...typeCounts].map((entry) => {
                        const on = stationTypeFilter === entry.id;
                        return (
                            <button
                                key={entry.id}
                                type="button"
                                onClick={() => setStationTypeFilter(entry.id)}
                                className="flex items-center gap-[7px] border px-3 py-2.5 font-mono text-[10.5px] tracking-[0.1em] transition-colors"
                                style={
                                    on
                                        ? { borderColor: '#d8ff3c', background: 'rgba(216,255,60,.10)', color: '#d8ff3c' }
                                        : { borderColor: 'rgba(242,240,234,.14)', color: 'rgba(242,240,234,.5)' }
                                }
                            >
                                {entry.label}
                                <span className="opacity-50">{entry.n}</span>
                            </button>
                        );
                    })}
                </div>

                <span className="h-px min-w-[20px] flex-1 bg-[#f2f0ea]/10" />

                <input
                    value={stationSearch}
                    onChange={(e) => setStationSearch(e.target.value)}
                    placeholder="FIND A STATION"
                    className="h-[38px] w-[190px] border border-[#f2f0ea]/[0.14] bg-transparent px-3 font-mono text-[10.5px] tracking-[0.1em] text-[#f2f0ea] outline-none transition-colors placeholder:text-[#f2f0ea]/30 focus:border-[#d8ff3c]"
                />

                <button
                    onClick={onAddStation}
                    className="h-[38px] whitespace-nowrap bg-[#d8ff3c] px-4 font-mono text-[10.5px] font-semibold tracking-[0.14em] text-[#0b0b0c] transition-transform hover:-translate-y-px"
                >
                    + ADD STATION
                </button>
            </div>

            <div className="border border-[#f2f0ea]/10 bg-[#111113]">
                <div className="hidden gap-2.5 border-b border-[#f2f0ea]/10 px-4 py-2.5 font-mono text-[9px] tracking-[0.14em] text-[#f2f0ea]/35 lg:grid lg:grid-cols-[minmax(140px,1.2fr)_104px_100px_minmax(96px,1fr)_96px_82px_104px]">
                    <span>STATION</span>
                    <span>RATE</span>
                    <span>STATUS</span>
                    <span>UTILISATION · 7D</span>
                    <span className="text-right">REVENUE 7D</span>
                    <span className="text-right">₹/OPEN HR</span>
                    <span className="text-right">ACTIONS</span>
                </div>

                {filteredStations.length === 0 ? (
                    <div className="px-4 py-8 font-mono text-[11.5px] text-[#f2f0ea]/45">
                        No station matches that filter.
                    </div>
                ) : (
                    filteredStations.map((station) => {
                        const isPoweredOff = poweredOffStations.has(station.name);
                        const isMaintenance = maintenanceStations.has(station.name);
                        const occupancy = stationOccupancy.get(station.name);
                        const isOccupied = !!occupancy && !isPoweredOff && !isMaintenance;
                        const rate = hourlyRateFor(station);
                        const week = weekFor(station.name, String(station.name).split('-')[0]);

                        const status = isPoweredOff
                            ? { label: 'OFF', fg: 'rgba(242,240,234,.45)', bg: 'rgba(242,240,234,.07)', edge: 'rgba(242,240,234,.2)' }
                            : isMaintenance
                                ? { label: 'MAINTENANCE', fg: '#ff5c2b', bg: 'rgba(255,92,43,.12)', edge: '#ff5c2b' }
                                : isOccupied
                                    ? { label: 'IN USE', fg: '#d8ff3c', bg: 'rgba(216,255,60,.12)', edge: '#d8ff3c' }
                                    : { label: 'FREE', fg: 'rgba(242,240,234,.7)', bg: 'rgba(242,240,234,.07)', edge: 'transparent' };

                        return (
                            <div
                                key={station.name}
                                className="grid grid-cols-1 items-center gap-2.5 border-b border-[#f2f0ea]/[0.05] px-4 py-3 transition-colors hover:bg-[#17171a] lg:grid-cols-[minmax(140px,1.2fr)_104px_100px_minmax(96px,1fr)_96px_82px_104px]"
                                style={{ borderLeft: `2px solid ${status.edge}` }}
                            >
                                <div className="flex min-w-0 items-center gap-[9px]">
                                    <span
                                        className="h-[7px] w-[7px] shrink-0"
                                        style={{ background: status.fg }}
                                    />
                                    <div className="flex min-w-0 flex-col gap-[3px]">
                                        <span className="truncate font-mono text-[12.5px] font-semibold tracking-[0.04em] text-[#f2f0ea]">
                                            {station.name.toUpperCase()}
                                        </span>
                                        <span className="truncate font-mono text-[10px] tracking-[0.1em] text-[#f2f0ea]/35">
                                            {station.type}
                                        </span>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => onEditPricing(station)}
                                    className="text-left"
                                    title="Edit this station's rate"
                                >
                                    {rate ? (
                                        <span className="whitespace-nowrap text-[13px] font-extrabold text-[#f2f0ea]">
                                            ₹{rate}
                                            <span className="font-mono text-[10px] font-medium text-[#f2f0ea]/35"> /hr</span>
                                        </span>
                                    ) : (
                                        <span className="font-mono text-[10.5px] text-[#ff5c2b]">SET A RATE</span>
                                    )}
                                </button>

                                <span
                                    className="justify-self-start px-2 py-1 font-mono text-[9.5px] tracking-[0.1em]"
                                    style={{ background: status.bg, color: status.fg }}
                                >
                                    {status.label}
                                </span>

                                {/* Utilisation, then what it earned, then what an
                                    open hour on it is worth. A machine can be busy
                                    and still be the wrong machine to own. */}
                                <div className="flex min-w-0 flex-col gap-[5px]">
                                    <div className="flex items-center gap-2">
                                        <span
                                            className="whitespace-nowrap font-mono text-[11.5px]"
                                            style={{ color: week.util >= 40 ? '#d8ff3c' : week.util > 0 ? 'rgba(242,240,234,.7)' : 'rgba(242,240,234,.3)' }}
                                        >
                                            {week.hours >= 1 ? `${week.hours.toFixed(1)}h` : week.hours > 0 ? '<1h' : '0h'}
                                        </span>
                                        <span className="flex-1" />
                                        <span className="whitespace-nowrap font-mono text-[10px] text-[#f2f0ea]/35">
                                            {week.util}%
                                        </span>
                                    </div>
                                    <div className="h-[5px] bg-[#f2f0ea]/[0.08]">
                                        <div
                                            className="h-[5px]"
                                            style={{
                                                width: `${week.util}%`,
                                                background: week.util >= 40 ? '#d8ff3c' : week.util >= 15 ? '#ffa53c' : '#ff5c2b',
                                            }}
                                        />
                                    </div>
                                    {isOccupied && (
                                        <span className="truncate font-mono text-[10px] text-[#f2f0ea]/40">
                                            NOW · {occupancy!.customerName} TILL {occupancy!.endTime.toUpperCase()}
                                        </span>
                                    )}
                                </div>

                                <span
                                    className="whitespace-nowrap text-right text-[13px] font-extrabold"
                                    style={{ color: week.revenue > 0 ? '#f2f0ea' : 'rgba(242,240,234,.3)' }}
                                >
                                    ₹{Math.round(week.revenue).toLocaleString('en-IN')}
                                </span>

                                <span
                                    className="whitespace-nowrap text-right font-mono text-[11.5px]"
                                    style={{ color: week.perOpenHour >= 20 ? '#d8ff3c' : week.perOpenHour > 0 ? 'rgba(242,240,234,.6)' : 'rgba(242,240,234,.3)' }}
                                >
                                    ₹{Math.round(week.perOpenHour)}
                                </span>

                                <div className="flex justify-end gap-[5px]">
                                    {onToggleMaintenance && (
                                        <button
                                            type="button"
                                            title={isMaintenance ? 'Put back in service' : 'Mark for maintenance'}
                                            onClick={() => onToggleMaintenance(station.name)}
                                            className="flex h-[26px] w-[26px] items-center justify-center border font-mono text-[11px] transition-colors hover:border-[#f2f0ea]"
                                            style={{
                                                borderColor: isMaintenance ? '#ff5c2b' : 'rgba(242,240,234,.14)',
                                                color: isMaintenance ? '#ff5c2b' : 'rgba(242,240,234,.55)',
                                            }}
                                        >
                                            ⚒
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        title={isPoweredOff ? 'Switch on' : 'Switch off'}
                                        onClick={() => onTogglePower(station.name)}
                                        className="flex h-[26px] w-[26px] items-center justify-center border font-mono text-[11px] transition-colors hover:border-[#f2f0ea]"
                                        style={{
                                            borderColor: isPoweredOff ? 'rgba(242,240,234,.4)' : 'rgba(242,240,234,.14)',
                                            color: isPoweredOff ? '#f2f0ea' : 'rgba(242,240,234,.55)',
                                        }}
                                    >
                                        ⏻
                                    </button>
                                    {onSetupLock && (
                                        <button
                                            type="button"
                                            title="Set up the lock on this PC"
                                            onClick={() => onSetupLock({ name: station.name, displayName: station.displayName, type: station.type })}
                                            className="flex h-[26px] w-[26px] items-center justify-center border border-[#f2f0ea]/[0.14] font-mono text-[11px] text-[#f2f0ea]/55 transition-colors hover:border-[#d8ff3c] hover:text-[#d8ff3c]"
                                        >
                                            ⌘
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        title="Remove this station"
                                        onClick={() => onDeleteStation({ name: station.name, displayName: station.displayName, type: station.type })}
                                        className="flex h-[26px] w-[26px] items-center justify-center border border-[#f2f0ea]/[0.14] font-mono text-[11px] text-[#f2f0ea]/55 transition-colors hover:border-[#ff5c2b] hover:text-[#ff5c2b]"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}

                <div className="flex items-center gap-3.5 border-t border-[#f2f0ea]/10 px-4 py-3 font-mono text-[10.5px] text-[#f2f0ea]/40">
                    <span className="truncate">
                        {filteredStations.length} of {totalStations} stations · {OPEN_HOURS_PER_DAY}h open a day
                    </span>
                    <span className="flex-1" />
                    <button
                        type="button"
                        onClick={exportStationsCsv}
                        className="whitespace-nowrap tracking-[0.14em] transition-colors hover:text-[#d8ff3c]"
                    >
                        EXPORT CSV →
                    </button>
                </div>
            </div>

            {/* Which kind of machine earns per hour it is open. Counts and even
                revenue flatter whatever there is most of; this does not. */}
            {yieldByType.length > 0 && (
                <section>
                    <div className="mb-3 flex items-center gap-3">
                        <span className="whitespace-nowrap font-mono text-[10px] tracking-[0.2em] text-[#f2f0ea]/50">
                            YIELD BY TYPE · ₹ PER OPEN HOUR
                        </span>
                        <span className="h-px flex-1 bg-[#f2f0ea]/10" />
                        <span className="whitespace-nowrap font-mono text-[10px] text-[#f2f0ea]/40">
                            last 7 days
                        </span>
                    </div>
                    <div className="flex flex-col gap-px border border-[#f2f0ea]/10 bg-[#f2f0ea]/10">
                        {yieldByType.map((row) => {
                            const tone = row.perOpenHour >= 20 ? '#d8ff3c' : row.perOpenHour >= 8 ? 'rgba(242,240,234,.7)' : '#ff5c2b';
                            return (
                                <div
                                    key={row.type}
                                    className="grid items-center gap-3 bg-[#111113] px-4 py-3"
                                    style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,100px) 96px' }}
                                >
                                    <div className="flex min-w-0 flex-col gap-[3px]">
                                        <span className="truncate text-[13px] font-bold text-[#f2f0ea]">{row.label}</span>
                                        <span className="truncate font-mono text-[10px] text-[#f2f0ea]/35">
                                            {row.count} {row.count === 1 ? 'station' : 'stations'} · ₹{Math.round(row.revenue).toLocaleString('en-IN')} in 7d
                                        </span>
                                    </div>
                                    <div className="h-1.5 bg-[#f2f0ea]/[0.08]">
                                        <div
                                            className="h-1.5"
                                            style={{ width: `${Math.min(100, (row.perOpenHour / bestYield) * 100)}%`, background: tone }}
                                        />
                                    </div>
                                    <span className="whitespace-nowrap text-right font-mono text-[11.5px]" style={{ color: tone }}>
                                        ₹{Math.round(row.perOpenHour)}/hr
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            <WhatToFix items={insights} />

            {/* One password for every station here, rather than a script run
                at each PC. Café-level, so it sits below the grid. */}
            {currentCafe?.id && <StationExitPassword cafeId={currentCafe.id} />}
        </div>
    );
}
