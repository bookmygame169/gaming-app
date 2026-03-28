'use client';

import React, { useState } from 'react';
import { CafeRow, BookingRow } from '../types';

interface StationsTabProps {
    currentCafe: CafeRow | null;
    bookings: BookingRow[];
    stationPricing: Record<string, any>;
    poweredOffStations: Set<string>;
    onTogglePower: (stationName: string) => void;
    onEditPricing: (station: any) => void;
    onDeleteStation: (station: { name: string; displayName: string; type: string }) => void;
    onAddStation: () => void;
    theme: any;
}

export function StationsTab({
    currentCafe,
    bookings,
    stationPricing,
    poweredOffStations,
    onTogglePower,
    onEditPricing,
    onDeleteStation,
    onAddStation,
    theme,
}: StationsTabProps) {
    const [stationSearch, setStationSearch] = useState('');
    const [stationTypeFilter, setStationTypeFilter] = useState('all');
    const [stationStatusFilter, setStationStatusFilter] = useState('all');

    if (!currentCafe) return null;

    // Console type configurations
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

    // Calculate session count per station from bookings
    const stationSessionCounts = new Map<string, number>();
    bookings.forEach(booking => {
        booking.booking_items?.forEach(item => {
            if (item.console) {
                stationSessionCounts.set(item.console.toLowerCase(), (stationSessionCounts.get(item.console.toLowerCase()) || 0) + 1);
            }
        });
    });

    // Generate stations for each console type
    let allStations: any[] = [];
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
                sessions: stationSessionCounts.get(stationName) || 0,
            });
        }
    });

    // Filtering
    const filteredStations = allStations.filter(station => {
        const matchesSearch = station.name.toLowerCase().includes(stationSearch.toLowerCase()) || 
                             station.type.toLowerCase().includes(stationSearch.toLowerCase());
        const matchesType = stationTypeFilter === 'all' || station.type === stationTypeFilter;
        
        const isOff = poweredOffStations.has(station.name);
        const matchesStatus = stationStatusFilter === 'all' || 
                             (stationStatusFilter === 'active' && !isOff) || 
                             (stationStatusFilter === 'inactive' && isOff);
        
        return matchesSearch && matchesType && matchesStatus;
    });

    return (
        <div>
            {/* Header with Stats and Add Button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h2 style={{ fontSize: 28, fontWeight: 700, color: theme.textPrimary, margin: 0, marginBottom: 8 }}>
                        Gaming Stations
                    </h2>
                    <p style={{ fontSize: 14, color: theme.textMuted, margin: 0 }}>
                        Configure pricing for all your gaming stations
                    </p>
                </div>

                <button
                    onClick={onAddStation}
                    style={{
                        padding: '12px 24px',
                        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                        border: 'none',
                        borderRadius: 12,
                        color: '#ffffff',
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        transition: 'all 0.2s',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                    }}
                >
                    <span style={{ fontSize: 18 }}>+</span>
                    Add New Station
                </button>
            </div>

            {/* Search and Filters */}
            <div
                style={{
                    background: theme.cardBackground,
                    borderRadius: 16,
                    border: `1px solid ${theme.border}`,
                    padding: '20px',
                    marginBottom: 24,
                }}
            >
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <input
                            type="text"
                            placeholder="Search stations..."
                            value={stationSearch}
                            onChange={(e) => setStationSearch(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '12px 16px 12px 44px',
                                background: 'rgba(15,23,42,0.6)',
                                border: `1px solid ${theme.border}`,
                                borderRadius: 10,
                                color: theme.textPrimary,
                                fontSize: 14,
                                outline: 'none',
                            }}
                        />
                        <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 18, opacity: 0.5 }}>🔍</span>
                    </div>

                    <select
                        value={stationTypeFilter}
                        onChange={(e) => setStationTypeFilter(e.target.value)}
                        style={{
                            padding: '12px 16px',
                            background: 'rgba(15,23,42,0.6)',
                            border: `1px solid ${theme.border}`,
                            borderRadius: 10,
                            color: theme.textPrimary,
                            fontSize: 14,
                            cursor: 'pointer',
                            minWidth: 140,
                        }}
                    >
                        <option value="all">All Types</option>
                        {consoleTypes.map(t => (
                            <option key={t.name} value={t.name}>{t.name}</option>
                        ))}
                    </select>

                    <select
                        value={stationStatusFilter}
                        onChange={(e) => setStationStatusFilter(e.target.value)}
                        style={{
                            padding: '12px 16px',
                            background: 'rgba(15,23,42,0.6)',
                            border: `1px solid ${theme.border}`,
                            borderRadius: 10,
                            color: theme.textPrimary,
                            fontSize: 14,
                            cursor: 'pointer',
                            minWidth: 140,
                        }}
                    >
                        <option value="all">All Status</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </select>
                </div>
            </div>

            {/* Stations Table */}
            <div
                style={{
                    background: theme.cardBackground,
                    borderRadius: 16,
                    border: `1px solid ${theme.border}`,
                    overflow: 'hidden',
                }}
            >
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: 'rgba(15,23,42,0.8)', borderBottom: `1px solid ${theme.border}` }}>
                            <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Station</th>
                            <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Type</th>
                            <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Rate</th>
                            <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Sessions</th>
                            <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Status</th>
                            <th style={{ padding: '16px 20px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredStations.length === 0 ? (
                            <tr>
                                <td colSpan={6} style={{ padding: '60px 20px', textAlign: 'center' }}>
                                    <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>🎮</div>
                                    <p style={{ fontSize: 16, color: theme.textSecondary, marginBottom: 6, fontWeight: 500 }}>
                                        No stations found
                                    </p>
                                </td>
                            </tr>
                        ) : (
                            filteredStations.map((station, index) => {
                                const isPoweredOff = poweredOffStations.has(station.name);
                                const savedPricing = stationPricing[station.name];
                                const stationStatus = isPoweredOff ? 'Inactive' : 'Active';

                                return (
                                    <tr key={station.id} style={{ borderBottom: index < filteredStations.length - 1 ? `1px solid ${theme.border}` : 'none' }}>
                                        <td style={{ padding: '16px 20px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <div
                                                    style={{
                                                        width: 40,
                                                        height: 40,
                                                        borderRadius: 10,
                                                        background: station.bgColor,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: 20,
                                                        opacity: isPoweredOff ? 0.4 : 1,
                                                    }}
                                                >
                                                    {station.icon}
                                                </div>
                                                <span style={{ fontSize: 15, fontWeight: 600, color: theme.textPrimary, opacity: isPoweredOff ? 0.5 : 1 }}>{station.displayName}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px 20px' }}>
                                            <span
                                                style={{
                                                    display: 'inline-block',
                                                    padding: '6px 12px',
                                                    borderRadius: 6,
                                                    background: station.bgColor,
                                                    color: station.color,
                                                    fontSize: 12,
                                                    fontWeight: 600,
                                                    opacity: isPoweredOff ? 0.5 : 1,
                                                }}
                                            >
                                                {station.type}
                                            </span>
                                        </td>
                                        <td style={{ padding: '16px 20px' }}>
                                            <div style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 1.6, opacity: isPoweredOff ? 0.5 : 1 }}>
                                                {(() => {
                                                    if (!savedPricing) {
                                                        return <span style={{ color: theme.textMuted, fontStyle: 'italic' }}>Not configured</span>;
                                                    }
                                                    if (['PS5', 'Xbox'].includes(station.type)) {
                                                        const c1Half = savedPricing.controller_1_half_hour;
                                                        const c1Full = savedPricing.controller_1_full_hour;
                                                        if (!c1Half && !c1Full) return <span style={{ color: theme.textMuted, fontStyle: 'italic' }}>Not configured</span>;
                                                        return (
                                                            <div>
                                                                <span style={{ fontWeight: 600 }}>₹{c1Half}/30m · ₹{c1Full}/hr</span>
                                                                {savedPricing.controller_2_full_hour && (
                                                                    <div style={{ fontSize: 10, color: theme.textMuted }}>Multi-controller rates set</div>
                                                                )}
                                                            </div>
                                                        );
                                                    } else if (['PS4'].includes(station.type)) {
                                                        const singleHalf = savedPricing.single_player_half_hour_rate;
                                                        const singleFull = savedPricing.single_player_rate;
                                                        if (!singleHalf && !singleFull) return <span style={{ color: theme.textMuted, fontStyle: 'italic' }}>Not configured</span>;
                                                        return (
                                                            <div style={{ fontWeight: 600 }}>₹{singleHalf}/30m · ₹{singleFull}/hr</div>
                                                        );
                                                    } else {
                                                        const half = savedPricing.half_hour_rate;
                                                        const full = savedPricing.hourly_rate;
                                                        if (!half && !full) return <span style={{ color: theme.textMuted, fontStyle: 'italic' }}>Not configured</span>;
                                                        return <div style={{ fontWeight: 600 }}>₹{half}/30m · ₹{full}/hr</div>;
                                                    }
                                                })()}
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px 20px', fontSize: 14, color: theme.textSecondary, opacity: isPoweredOff ? 0.5 : 1 }}>
                                            {station.sessions}
                                        </td>
                                        <td style={{ padding: '16px 20px' }}>
                                            <span
                                                style={{
                                                    display: 'inline-block',
                                                    padding: '6px 12px',
                                                    borderRadius: 6,
                                                    background: stationStatus === 'Active' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                                    color: stationStatus === 'Active' ? '#10b981' : '#ef4444',
                                                    fontSize: 12,
                                                    fontWeight: 600,
                                                }}
                                            >
                                                {stationStatus}
                                            </span>
                                        </td>
                                        <td style={{ padding: '16px 20px' }}>
                                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                                <button
                                                    style={{ padding: '8px', background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 6, cursor: 'pointer' }}
                                                    onClick={() => onEditPricing(station)}
                                                    title="Edit Pricing"
                                                >✏️</button>
                                                <button
                                                    style={{ padding: '8px', background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 6, cursor: 'pointer', color: isPoweredOff ? '#ef4444' : '#10b981' }}
                                                    onClick={() => onTogglePower(station.name)}
                                                    title={isPoweredOff ? "Power On" : "Power Off"}
                                                >🔌</button>
                                                <button
                                                    style={{ padding: '8px', background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 6, cursor: 'pointer', color: '#ef4444' }}
                                                    onClick={() => onDeleteStation({ name: station.name, displayName: station.displayName, type: station.type })}
                                                    title="Delete"
                                                >🗑️</button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
