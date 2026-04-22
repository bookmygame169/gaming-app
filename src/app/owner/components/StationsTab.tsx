'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState } from 'react';
import { CafeRow, BookingRow } from '../types';
import { getLocalDateString } from '../utils';

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
    isMobile = false,
    onTogglePower,
    onToggleMaintenance,
    onEditPricing,
    onDeleteStation,
    onAddStation,
    theme,
}: StationsTabProps) {
    const [stationSearch, setStationSearch] = useState('');
    const [stationTypeFilter, setStationTypeFilter] = useState('all');
    const [stationStatusFilter, setStationStatusFilter] = useState('all');

    if (!currentCafe) return null;

    const consoleTypes = [
        { id: 'pc', key: 'pc_count', name: 'PC', icon: '🖥️', bgColor: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' },
        { id: 'ps5', key: 'ps5_count', name: 'PS5', icon: '🎮', bgColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981' },
        { id: 'ps4', key: 'ps4_count', name: 'PS4', icon: '🎮', bgColor: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6' },
        { id: 'xbox', key: 'xbox_count', name: 'Xbox', icon: '🎮', bgColor: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' },
        { id: 'vr', key: 'vr_count', name: 'VR', icon: '🥽', bgColor: 'rgba(236, 72, 153, 0.15)', color: '#ec4899' },
        { id: 'steering', key: 'steering_wheel_count', name: 'Steering Wheel', icon: '🏎️', bgColor: 'rgba(251, 146, 60, 0.15)', color: '#fb923c' },
        { id: 'racing_sim', key: 'racing_sim_count', name: 'Racing Sim', icon: '🏁', bgColor: 'rgba(255, 69, 0, 0.15)', color: '#ff4500' },
        { id: 'pool', key: 'pool_count', name: 'Pool', icon: '🎱', bgColor: 'rgba(14, 165, 233, 0.15)', color: '#0ea5e9' },
        { id: 'snooker', key: 'snooker_count', name: 'Snooker', icon: '🎱', bgColor: 'rgba(132, 204, 22, 0.15)', color: '#84cc16' },
        { id: 'arcade', key: 'arcade_count', name: 'Arcade', icon: '🕹️', bgColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' },
    ];

    // --- Real-time occupancy ---
    // Build stationOccupancy: stationId → { customerName, endTime }
    // based on today's in-progress bookings only
    const todayStr = getLocalDateString();
    const activeByConsole = new Map<string, { customerName: string; endTime: string }[]>();
    const stationOccupancy = new Map<string, { customerName: string; endTime: string }>();

    bookings
        .filter(b => b.status === 'in-progress' && b.booking_date === todayStr)
        .forEach(b => {
            const customerName = b.customer_name || b.user_name || 'Customer';
            let endTimeStr = '';
            if (b.start_time && b.duration) {
                const startMin = parseStartMinutes(b.start_time);
                if (startMin !== null) endTimeStr = formatEndTime(startMin, b.duration);
            }
            (b.booking_items || []).forEach(item => {
                if (!item.console) return;
                const ct = item.console.toLowerCase();

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

    // Summary counts for header
    const totalStations = Object.values(consoleTypes).reduce(
        (sum, ct) => sum + ((currentCafe as any)[ct.key] || 0), 0
    );
    const occupiedCount = stationOccupancy.size;
    const maintenanceCount = maintenanceStations.size;
    const freeCount = totalStations - occupiedCount - maintenanceCount - poweredOffStations.size;

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

    const thStyle = { padding: '16px 20px', textAlign: 'left' as const, fontSize: 11, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.8px' };

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 16 : 0, marginBottom: 16 }}>
                <div>
                    <h2 style={{ fontSize: isMobile ? 24 : 28, fontWeight: 700, color: theme.textPrimary, margin: 0, marginBottom: 8 }}>
                        Gaming Stations
                    </h2>
                    <p style={{ fontSize: 14, color: theme.textMuted, margin: 0 }}>
                        Real-time occupancy · {freeCount} free · {occupiedCount} occupied · {maintenanceCount} maintenance
                    </p>
                </div>
                <button
                    onClick={onAddStation}
                    style={{
                        padding: '12px 24px', background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                        border: 'none', borderRadius: 12, color: '#ffffff', fontSize: 14, fontWeight: 700,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        width: isMobile ? '100%' : 'auto',
                    }}
                >
                    <span style={{ fontSize: 18 }}>+</span> Add New Station
                </button>
            </div>

            {/* Quick occupancy summary pills */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
                {[
                    { label: 'Free', count: freeCount, bg: 'rgba(16,185,129,0.1)', color: '#10b981', border: 'rgba(16,185,129,0.3)' },
                    { label: 'Occupied', count: occupiedCount, bg: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'rgba(239,68,68,0.3)' },
                    { label: 'Maintenance', count: maintenanceCount, bg: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
                    { label: 'Off', count: poweredOffStations.size, bg: 'rgba(100,116,139,0.1)', color: '#64748b', border: 'rgba(100,116,139,0.3)' },
                ].map(pill => (
                    <div key={pill.label} style={{
                        padding: '6px 14px', borderRadius: 20, background: pill.bg,
                        border: `1px solid ${pill.border}`, color: pill.color, fontSize: 12, fontWeight: 700,
                        cursor: 'pointer',
                    }} onClick={() => setStationStatusFilter(
                        stationStatusFilter === pill.label.toLowerCase() ? 'all' : pill.label.toLowerCase()
                    )}>
                        {pill.count} {pill.label}
                    </div>
                ))}
            </div>

            {/* Search and Filters */}
            <div style={{ background: theme.cardBackground, borderRadius: 16, border: `1px solid ${theme.border}`, padding: '20px', marginBottom: 24 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: isMobile ? 'stretch' : 'center', flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
                    <div style={{ flex: 1, minWidth: 180, position: 'relative', width: isMobile ? '100%' : 'auto' }}>
                        <input
                            type="text"
                            placeholder="Search stations..."
                            value={stationSearch}
                            onChange={(e) => setStationSearch(e.target.value)}
                            style={{ width: '100%', padding: '12px 16px 12px 44px', background: 'rgba(15,23,42,0.6)', border: `1px solid ${theme.border}`, borderRadius: 10, color: theme.textPrimary, fontSize: 14, outline: 'none' }}
                        />
                        <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 18, opacity: 0.5 }}>🔍</span>
                    </div>
                    <select value={stationTypeFilter} onChange={(e) => setStationTypeFilter(e.target.value)}
                        style={{ padding: '12px 16px', background: 'rgba(15,23,42,0.6)', border: `1px solid ${theme.border}`, borderRadius: 10, color: theme.textPrimary, fontSize: 14, cursor: 'pointer', minWidth: 140, width: isMobile ? '100%' : 'auto' }}>
                        <option value="all">All Types</option>
                        {consoleTypes.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                    </select>
                    <select value={stationStatusFilter} onChange={(e) => setStationStatusFilter(e.target.value)}
                        style={{ padding: '12px 16px', background: 'rgba(15,23,42,0.6)', border: `1px solid ${theme.border}`, borderRadius: 10, color: theme.textPrimary, fontSize: 14, cursor: 'pointer', minWidth: 160, width: isMobile ? '100%' : 'auto' }}>
                        <option value="all">All Status</option>
                        <option value="free">Free Now</option>
                        <option value="occupied">Occupied Now</option>
                        <option value="maintenance">Maintenance</option>
                        <option value="inactive">Powered Off</option>
                    </select>
                </div>
            </div>

            {/* Stations mobile cards */}
            {isMobile ? (
                <div style={{ display: 'grid', gap: 12 }}>
                    {filteredStations.length === 0 ? (
                        <div style={{ background: theme.cardBackground, borderRadius: 16, border: `1px solid ${theme.border}`, padding: '48px 20px', textAlign: 'center' }}>
                            <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>🎮</div>
                            <p style={{ fontSize: 16, color: theme.textSecondary, marginBottom: 6, fontWeight: 500 }}>No stations found</p>
                        </div>
                    ) : (
                        filteredStations.map((station) => {
                            const isPoweredOff = poweredOffStations.has(station.name);
                            const isMaintenance = maintenanceStations.has(station.name);
                            const occupancy = stationOccupancy.get(station.name);
                            const isOccupied = !!occupancy && !isPoweredOff && !isMaintenance;
                            const savedPricing = stationPricing[station.name];
                            const dimmed = isPoweredOff || isMaintenance;

                            let statusBadge: { label: string; bg: string; color: string };
                            if (isPoweredOff) {
                                statusBadge = { label: 'OFF', bg: 'rgba(100,116,139,0.15)', color: '#64748b' };
                            } else if (isMaintenance) {
                                statusBadge = { label: 'MAINTENANCE', bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' };
                            } else if (isOccupied) {
                                statusBadge = { label: 'OCCUPIED', bg: 'rgba(239,68,68,0.15)', color: '#ef4444' };
                            } else {
                                statusBadge = { label: 'FREE', bg: 'rgba(16,185,129,0.15)', color: '#10b981' };
                            }

                            const pricingContent = (() => {
                                if (!savedPricing) return <span style={{ color: theme.textMuted, fontStyle: 'italic' }}>Not configured</span>;
                                if (['PS5', 'Xbox'].includes(station.type)) {
                                    const c1Half = savedPricing.controller_1_half_hour;
                                    const c1Full = savedPricing.controller_1_full_hour;
                                    if (!c1Half && !c1Full) return <span style={{ color: theme.textMuted, fontStyle: 'italic' }}>Not configured</span>;
                                    return <span style={{ fontWeight: 600 }}>₹{c1Half}/30m · ₹{c1Full}/hr</span>;
                                }
                                if (station.type === 'PS4') {
                                    const sh = savedPricing.single_player_half_hour_rate;
                                    const sf = savedPricing.single_player_rate;
                                    if (!sh && !sf) return <span style={{ color: theme.textMuted, fontStyle: 'italic' }}>Not configured</span>;
                                    return <span style={{ fontWeight: 600 }}>₹{sh}/30m · ₹{sf}/hr</span>;
                                }
                                const half = savedPricing.half_hour_rate;
                                const full = savedPricing.hourly_rate;
                                if (!half && !full) return <span style={{ color: theme.textMuted, fontStyle: 'italic' }}>Not configured</span>;
                                return <span style={{ fontWeight: 600 }}>₹{half}/30m · ₹{full}/hr</span>;
                            })();

                            return (
                                <div key={station.id} style={{ background: theme.cardBackground, borderRadius: 16, border: `1px solid ${theme.border}`, padding: 16 }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                                            <div style={{ width: 42, height: 42, borderRadius: 12, background: station.bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, opacity: dimmed ? 0.4 : 1, flexShrink: 0 }}>
                                                {station.icon}
                                            </div>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontSize: 15, fontWeight: 700, color: theme.textPrimary, opacity: dimmed ? 0.5 : 1 }}>{station.displayName}</div>
                                                <div style={{ marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                    <span style={{ display: 'inline-block', padding: '5px 10px', borderRadius: 999, background: station.bgColor, color: station.color, fontSize: 11, fontWeight: 700, opacity: dimmed ? 0.5 : 1 }}>
                                                        {station.type}
                                                    </span>
                                                    <span style={{ display: 'inline-block', padding: '5px 10px', borderRadius: 999, background: statusBadge.bg, color: statusBadge.color, fontSize: 11, fontWeight: 700 }}>
                                                        {statusBadge.label}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                        <div style={{ padding: '12px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${theme.border}` }}>
                                            <div style={{ fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Rate</div>
                                            <div style={{ marginTop: 6, fontSize: 13, color: theme.textSecondary }}>{pricingContent}</div>
                                        </div>
                                        <div style={{ padding: '12px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${theme.border}` }}>
                                            <div style={{ fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Now</div>
                                            {isOccupied && occupancy ? (
                                                <div style={{ marginTop: 6 }}>
                                                    <div style={{ fontSize: 13, color: theme.textPrimary, fontWeight: 600 }}>{occupancy.customerName}</div>
                                                    {occupancy.endTime && <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>until {occupancy.endTime}</div>}
                                                </div>
                                            ) : (
                                                <div style={{ marginTop: 6, fontSize: 13, color: theme.textSecondary }}>{statusBadge.label === 'FREE' ? 'Ready to use' : statusBadge.label.toLowerCase()}</div>
                                            )}
                                        </div>
                                    </div>

                                    <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                                        <button style={{ padding: '10px 12px', background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 10, cursor: 'pointer', color: theme.textPrimary, fontSize: 13, fontWeight: 600 }} onClick={() => onEditPricing(station)}>✏️ Edit</button>
                                        {onToggleMaintenance ? (
                                            <button
                                                style={{ padding: '10px 12px', background: isMaintenance ? 'rgba(245,158,11,0.15)' : 'transparent', border: `1px solid ${isMaintenance ? '#f59e0b' : theme.border}`, borderRadius: 10, cursor: 'pointer', color: isMaintenance ? '#f59e0b' : theme.textPrimary, fontSize: 13, fontWeight: 600 }}
                                                onClick={() => onToggleMaintenance(station.name)}
                                            >🔧 {isMaintenance ? 'Clear' : 'Maintain'}</button>
                                        ) : <div />}
                                        <button
                                            style={{ padding: '10px 12px', background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 10, cursor: 'pointer', color: isPoweredOff ? '#ef4444' : '#10b981', fontSize: 13, fontWeight: 600 }}
                                            onClick={() => onTogglePower(station.name)}
                                        >🔌 {isPoweredOff ? 'Power On' : 'Power Off'}</button>
                                        <button style={{ padding: '10px 12px', background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 10, cursor: 'pointer', color: '#ef4444', fontSize: 13, fontWeight: 600 }} onClick={() => onDeleteStation({ name: station.name, displayName: station.displayName, type: station.type })}>🗑️ Delete</button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            ) : (
            <div style={{ background: theme.cardBackground, borderRadius: 16, border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: 'rgba(15,23,42,0.8)', borderBottom: `1px solid ${theme.border}` }}>
                            <th style={thStyle}>Station</th>
                            <th style={thStyle}>Type</th>
                            <th style={thStyle}>Rate</th>
                            <th style={thStyle}>Now</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredStations.length === 0 ? (
                            <tr>
                                <td colSpan={5} style={{ padding: '60px 20px', textAlign: 'center' }}>
                                    <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>🎮</div>
                                    <p style={{ fontSize: 16, color: theme.textSecondary, marginBottom: 6, fontWeight: 500 }}>No stations found</p>
                                </td>
                            </tr>
                        ) : (
                            filteredStations.map((station, index) => {
                                const isPoweredOff = poweredOffStations.has(station.name);
                                const isMaintenance = maintenanceStations.has(station.name);
                                const occupancy = stationOccupancy.get(station.name);
                                const isOccupied = !!occupancy && !isPoweredOff && !isMaintenance;
                                const savedPricing = stationPricing[station.name];
                                const dimmed = isPoweredOff || isMaintenance;

                                let statusBadge: { label: string; bg: string; color: string };
                                if (isPoweredOff) {
                                    statusBadge = { label: 'OFF', bg: 'rgba(100,116,139,0.15)', color: '#64748b' };
                                } else if (isMaintenance) {
                                    statusBadge = { label: 'MAINTENANCE', bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' };
                                } else if (isOccupied) {
                                    statusBadge = { label: 'OCCUPIED', bg: 'rgba(239,68,68,0.15)', color: '#ef4444' };
                                } else {
                                    statusBadge = { label: 'FREE', bg: 'rgba(16,185,129,0.15)', color: '#10b981' };
                                }

                                return (
                                    <tr key={station.id} style={{ borderBottom: index < filteredStations.length - 1 ? `1px solid ${theme.border}` : 'none' }}>
                                        {/* Station name */}
                                        <td style={{ padding: '16px 20px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <div style={{ width: 40, height: 40, borderRadius: 10, background: station.bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, opacity: dimmed ? 0.4 : 1 }}>
                                                    {station.icon}
                                                </div>
                                                <span style={{ fontSize: 15, fontWeight: 600, color: theme.textPrimary, opacity: dimmed ? 0.5 : 1 }}>{station.displayName}</span>
                                            </div>
                                        </td>
                                        {/* Type */}
                                        <td style={{ padding: '16px 20px' }}>
                                            <span style={{ display: 'inline-block', padding: '6px 12px', borderRadius: 6, background: station.bgColor, color: station.color, fontSize: 12, fontWeight: 600, opacity: dimmed ? 0.5 : 1 }}>
                                                {station.type}
                                            </span>
                                        </td>
                                        {/* Rate */}
                                        <td style={{ padding: '16px 20px' }}>
                                            <div style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 1.6, opacity: dimmed ? 0.5 : 1 }}>
                                                {(() => {
                                                    if (!savedPricing) return <span style={{ color: theme.textMuted, fontStyle: 'italic' }}>Not configured</span>;
                                                    if (['PS5', 'Xbox'].includes(station.type)) {
                                                        const c1Half = savedPricing.controller_1_half_hour;
                                                        const c1Full = savedPricing.controller_1_full_hour;
                                                        if (!c1Half && !c1Full) return <span style={{ color: theme.textMuted, fontStyle: 'italic' }}>Not configured</span>;
                                                        return <div><span style={{ fontWeight: 600 }}>₹{c1Half}/30m · ₹{c1Full}/hr</span>{savedPricing.controller_2_full_hour && <div style={{ fontSize: 10, color: theme.textMuted }}>Multi-controller rates set</div>}</div>;
                                                    } else if (station.type === 'PS4') {
                                                        const sh = savedPricing.single_player_half_hour_rate;
                                                        const sf = savedPricing.single_player_rate;
                                                        if (!sh && !sf) return <span style={{ color: theme.textMuted, fontStyle: 'italic' }}>Not configured</span>;
                                                        return <div style={{ fontWeight: 600 }}>₹{sh}/30m · ₹{sf}/hr</div>;
                                                    } else {
                                                        const half = savedPricing.half_hour_rate;
                                                        const full = savedPricing.hourly_rate;
                                                        if (!half && !full) return <span style={{ color: theme.textMuted, fontStyle: 'italic' }}>Not configured</span>;
                                                        return <div style={{ fontWeight: 600 }}>₹{half}/30m · ₹{full}/hr</div>;
                                                    }
                                                })()}
                                            </div>
                                        </td>
                                        {/* Now (real-time status) */}
                                        <td style={{ padding: '16px 20px' }}>
                                            <div>
                                                <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 6, background: statusBadge.bg, color: statusBadge.color, fontSize: 11, fontWeight: 700, letterSpacing: '0.5px' }}>
                                                    {statusBadge.label}
                                                </span>
                                                {isOccupied && occupancy && (
                                                    <div style={{ marginTop: 4 }}>
                                                        <div style={{ fontSize: 12, color: theme.textPrimary, fontWeight: 600 }}>{occupancy.customerName}</div>
                                                        {occupancy.endTime && <div style={{ fontSize: 11, color: theme.textMuted }}>until {occupancy.endTime}</div>}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        {/* Actions */}
                                        <td style={{ padding: '16px 20px' }}>
                                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                                <button style={{ padding: '8px', background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 6, cursor: 'pointer' }} onClick={() => onEditPricing(station)} title="Edit Pricing">✏️</button>
                                                {onToggleMaintenance && (
                                                    <button
                                                        style={{ padding: '8px', background: isMaintenance ? 'rgba(245,158,11,0.15)' : 'transparent', border: `1px solid ${isMaintenance ? '#f59e0b' : theme.border}`, borderRadius: 6, cursor: 'pointer' }}
                                                        onClick={() => onToggleMaintenance(station.name)}
                                                        title={isMaintenance ? 'Clear Maintenance' : 'Mark Maintenance'}
                                                    >🔧</button>
                                                )}
                                                <button
                                                    style={{ padding: '8px', background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 6, cursor: 'pointer', color: isPoweredOff ? '#ef4444' : '#10b981' }}
                                                    onClick={() => onTogglePower(station.name)}
                                                    title={isPoweredOff ? 'Power On' : 'Power Off'}
                                                >🔌</button>
                                                <button style={{ padding: '8px', background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 6, cursor: 'pointer', color: '#ef4444' }} onClick={() => onDeleteStation({ name: station.name, displayName: station.displayName, type: station.type })} title="Delete">🗑️</button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
            )}
        </div>
    );
}
