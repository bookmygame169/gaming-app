/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { getBookingRevenueTotal } from '@/lib/ownerRevenue';
import { theme } from '../utils/theme';
import { convertTo12Hour } from '../utils';
import { X, Phone, Mail, Clock, CreditCard, ChevronRight, Play, Star, History, Award } from 'lucide-react';

type CustomerDetailsModalProps = {
    customer: any;
    customerBookings: any[];
    isMobile: boolean;
    onClose: () => void;
};

export default function CustomerDetailsModal({
    customer,
    customerBookings,
    isMobile,
    onClose,
}: CustomerDetailsModalProps) {
    const [nowMs] = React.useState(() => Date.now());

    if (!customer) return null;

    // Get initials for avatar
    const nameParts = customer.name?.split(' ') || [];
    const initials = nameParts.length >= 2
        ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
        : (customer.name?.[0] || 'U').toUpperCase();

    const bookingsSpent = customerBookings.reduce((sum, b) => sum + getBookingRevenueTotal(b), 0);
    const totalSpent = typeof customer.totalSpent === 'number' ? customer.totalSpent : bookingsSpent;
    const totalHours = customerBookings.reduce((sum, b) => sum + (b.duration ? b.duration / 60 : 0), 0);

    // Visit frequency analytics
    const sortedDates = customerBookings
        .map((b: any) => b.booking_date as string)
        .filter(Boolean)
        .sort();
    const daysSinceLastVisit = sortedDates.length > 0
        ? Math.floor((nowMs - new Date(sortedDates[sortedDates.length - 1]).getTime()) / 86400000)
        : null;
    const avgDaysBetweenVisits = sortedDates.length >= 2
        ? Math.round(
            sortedDates.slice(1).reduce((sum: number, d: string, i: number) => {
                return sum + (new Date(d).getTime() - new Date(sortedDates[i]).getTime()) / 86400000;
            }, 0) / (sortedDates.length - 1)
          )
        : null;
    const churnRisk = daysSinceLastVisit !== null && (
        avgDaysBetweenVisits !== null
            ? daysSinceLastVisit > avgDaysBetweenVisits * 2
            : daysSinceLastVisit > 30
    );

    // Favorite console (most-used across booking_items)
    const consoleCounts: Record<string, number> = {};
    customerBookings.forEach((b: any) => {
        (b.booking_items || []).forEach((item: any) => {
            const c = item.console?.toUpperCase();
            if (c) consoleCounts[c] = (consoleCounts[c] || 0) + (item.quantity || 1);
        });
    });
    const favoriteConsole = Object.entries(consoleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const activeSubscription = customer.activeSubscription;
    const purchasedHours = Number(
        activeSubscription?.hours_purchased ??
        activeSubscription?.membership_plans?.hours ??
        0
    );
    const remainingHours = Number(activeSubscription?.hours_remaining ?? purchasedHours);
    const usedHours = Math.max(0, purchasedHours - remainingHours);
    const usagePercent = purchasedHours > 0 ? Math.min(100, (usedHours / purchasedHours) * 100) : 0;
    const expiryLabel = activeSubscription?.expiry_date
        ? new Date(activeSubscription.expiry_date).toLocaleDateString()
        : 'No expiry';

    return (
        <div
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(0, 0, 0, 0.8)",
                backdropFilter: "blur(8px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
                padding: isMobile ? "16px" : "20px",
                animation: 'fadeIn 0.2s ease-out'
            }}
            onClick={onClose}
        >
            <style jsx global>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `}</style>
            <div
                style={{
                    background: '#0e0e10', // Slate 950
                    border: '1px solid rgba(242,240,234,0.1)',
                    maxWidth: 1000,
                    width: "100%",
                    maxHeight: '90vh',
                    overflowY: 'auto',
                    position: 'relative',
                    animation: 'slideUp 0.3s ease-out'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Close Button */}
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: 20,
                        right: 20,
                        background: 'rgba(242,240,234,0.1)',
                        border: 'none',
                        borderRadius: '50%',
                        width: 36,
                        height: 36,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: theme.textMuted,
                        cursor: 'pointer',
                        zIndex: 10,
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(242,240,234,0.2)'; e.currentTarget.style.color = 'white'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(242,240,234,0.1)'; e.currentTarget.style.color = theme.textMuted; }}
                >
                    <X size={20} />
                </button>

                <div className="flex flex-col md:flex-row h-full">
                    {/* Left Sidebar - Profile & Actions */}
                    <div style={{
                        width: isMobile ? '100%' : '320px',
                        background: '#111113',
                        borderRight: isMobile ? 'none' : '1px solid rgba(242,240,234,0.05)',
                        borderBottom: isMobile ? '1px solid rgba(242,240,234,0.05)' : 'none',
                        padding: isMobile ? 24 : 32,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 24
                    }}>
                        {/* Profile Info */}
                        <div style={{ textAlign: 'center' }}>
                            <div style={{
                                width: 100,
                                height: 100,
                                margin: '0 auto 16px',
                                borderRadius: '50%',
                                background: '#111113',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 36,
                                fontWeight: 700,
                                color: '#f2f0ea',
                                border: '4px solid rgba(242,240,234,0.1)'
                            }}>
                                {initials}
                            </div>
                            <h2 style={{ fontSize: 24, fontWeight: 700, color: '#f2f0ea', marginBottom: 6 }}>
                                {customer.name}
                            </h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(242,240,234,.45)', fontSize: 14 }}>
                                    <Phone size={14} /> {customer.phone || 'No phone'}
                                </div>
                                {customer.email && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(242,240,234,.45)', fontSize: 14 }}>
                                        <Mail size={14} /> {customer.email}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Quick Stats Rows */}
                        <div style={{
                            background: 'rgba(242,240,234,0.03)',
                            padding: 16,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 16
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'rgba(242,240,234,.45)', fontSize: 13 }}>
                                    <History size={16} /> Sessions
                                </div>
                                <div style={{ color: '#f2f0ea', fontWeight: 600 }}>{customerBookings.length}</div>
                            </div>
                            <div style={{ width: '100%', height: 1, background: 'rgba(242,240,234,0.05)' }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'rgba(242,240,234,.45)', fontSize: 13 }}>
                                    <Clock size={16} /> Playtime
                                </div>
                                <div style={{ color: '#d8ff3c', fontWeight: 600 }}>
                                    {Math.floor(totalHours)}h {Math.round((totalHours % 1) * 60)}m
                                </div>
                            </div>
                            <div style={{ width: '100%', height: 1, background: 'rgba(242,240,234,0.05)' }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'rgba(242,240,234,.45)', fontSize: 13 }}>
                                    <Award size={16} /> Total Spent
                                </div>
                                <div style={{ color: '#d8ff3c', fontWeight: 600 }}>₹{totalSpent.toLocaleString()}</div>
                            </div>
                            {/* Divider */}
                            <div style={{ width: '100%', height: 1, background: 'rgba(242,240,234,0.05)' }} />
                            {/* Visit frequency */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'rgba(242,240,234,.45)', fontSize: 13 }}>
                                    <Clock size={16} /> Visits every
                                </div>
                                <div style={{ color: '#f2f0ea', fontWeight: 600, fontSize: 13 }}>
                                    {avgDaysBetweenVisits !== null ? `~${avgDaysBetweenVisits}d` : '—'}
                                </div>
                            </div>
                            {/* Last visit / churn signal */}
                            {daysSinceLastVisit !== null && (
                                <>
                                    <div style={{ width: '100%', height: 1, background: 'rgba(242,240,234,0.05)' }} />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'rgba(242,240,234,.45)', fontSize: 13 }}>
                                            <History size={16} /> Last seen
                                        </div>
                                        <div style={{
                                            fontWeight: 600, fontSize: 13,
                                            color: churnRisk ? '#ff5c2b' : daysSinceLastVisit > 14 ? '#ffa53c' : '#34d399'
                                        }}>
                                            {daysSinceLastVisit === 0 ? 'Today' : `${daysSinceLastVisit}d ago`}
                                            {churnRisk && <span style={{ fontSize: 10, marginLeft: 6, background: 'rgba(255,92,43,.12)', padding: '2px 6px' }}>At Risk</span>}
                                        </div>
                                    </div>
                                </>
                            )}
                            {/* Favorite console */}
                            {favoriteConsole && (
                                <>
                                    <div style={{ width: '100%', height: 1, background: 'rgba(242,240,234,0.05)' }} />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'rgba(242,240,234,.45)', fontSize: 13 }}>
                                            <Play size={16} /> Plays most
                                        </div>
                                        <div style={{ color: 'rgba(242,240,234,.6)', fontWeight: 600, fontSize: 13 }}>{favoriteConsole}</div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 'auto' }}>
                            <button style={{
                                width: '100%',
                                padding: '14px',
                                background: '#d8ff3c',
                                border: 'none',
                                color: '#f2f0ea',
                                fontWeight: 600,
                                fontSize: 14,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 10,
                                transition: 'transform 0.2s',
                            }}
                                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                                onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                            >
                                <Play size={16} fill="currentColor" /> START SESSION
                            </button>
                            <button style={{
                                width: '100%',
                                padding: '14px',
                                background: 'rgba(216, 255, 60, 0.1)',
                                border: '1px solid rgba(216, 255, 60, 0.2)',
                                color: 'rgba(242,240,234,.6)',
                                fontWeight: 600,
                                fontSize: 14,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 10,
                                transition: 'all 0.2s'
                            }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(216, 255, 60, 0.2)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(216, 255, 60, 0.1)'; }}
                            >
                                <Star size={16} /> NEW MEMBERSHIP
                            </button>
                        </div>
                    </div>

                    {/* Right Content */}
                    <div style={{ flex: 1, padding: isMobile ? 24 : 32, overflowY: 'auto' }}>

                        {/* Active Subscription Banner */}
                        {activeSubscription ? (
                            <div style={{
                                background: '#111113',
                                border: '1px solid rgba(216, 255, 60, 0.2)',
                                padding: 24,
                                marginBottom: 32,
                                position: 'relative',
                                overflow: 'hidden'
                            }}>
                                <div style={{ position: 'absolute', top: 0, right: 0, padding: 16 }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#d8ff3c', background: 'rgba(216,255,60,0.10)', padding: '4px 12px' }}>
                                        ACTIVE
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
                                    <div style={{
                                        width: 48, height: 48,
                                        background: '#111113',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: '#0b0b0c'
                                    }}>
                                        <CreditCard size={24} />
                                    </div>
                                    <div>
                                        <h3 style={{ fontSize: 18, fontWeight: 700, color: '#f2f0ea', marginBottom: 4 }}>
                                            {activeSubscription.membership_plans?.name || 'Membership'}
                                        </h3>
                                        <p style={{ fontSize: 13, color: 'rgba(242,240,234,.45)' }}>
                                            Expires {expiryLabel}
                                        </p>
                                    </div>
                                </div>

                                {/* Progress */}
                                <div style={{ marginBottom: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
                                        <span style={{ color: '#e2e8f0' }}>Usage</span>
                                        <span style={{ color: 'rgba(242,240,234,.45)' }}>
                                            {purchasedHours > 0
                                                ? `${usedHours.toFixed(1)}h used / ${purchasedHours}h`
                                                : 'Active pass'}
                                        </span>
                                    </div>
                                    <div style={{ height: 6, background: 'rgba(242,240,234,0.1)', overflow: 'hidden' }}>
                                        <div style={{
                                            width: `${usagePercent}%`,
                                            height: '100%',
                                            background: '#d8ff3c',
                                        }} />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div style={{
                                background: 'rgba(242,240,234,0.02)',
                                border: '1px dashed rgba(242,240,234,0.1)',
                                padding: 24,
                                marginBottom: 32,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                    <div style={{ width: 48, height: 48, background: 'rgba(242,240,234,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(242,240,234,.35)' }}>
                                        <CreditCard size={24} />
                                    </div>
                                    <div>
                                        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#f2f0ea', marginBottom: 4 }}>No active subscription</h3>
                                        <p style={{ fontSize: 13, color: 'rgba(242,240,234,.35)' }}>Customer doesn&apos;t have an active plan</p>
                                    </div>
                                </div>
                                <ChevronRight size={20} color="rgba(242,240,234,.35)" />
                            </div>
                        )}

                        {/* Recent Sessions */}
                        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontFamily: "var(--font-plex-mono), monospace", fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(242,240,234,.5)', fontWeight: 500 }}>Recent history</h3>
                        </div>

                        <div style={{
                            background: 'rgba(242,240,234,0.02)',
                            border: '1px solid rgba(242,240,234,0.05)',
                            overflow: 'hidden'
                        }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: 'rgba(242,240,234,0.02)', borderBottom: '1px solid rgba(242,240,234,0.05)' }}>
                                        <th style={{ padding: '16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'rgba(242,240,234,.45)', textTransform: 'uppercase' }}>Date</th>
                                        <th style={{ padding: '16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'rgba(242,240,234,.45)', textTransform: 'uppercase' }}>Details</th>
                                        <th style={{ padding: '16px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'rgba(242,240,234,.45)', textTransform: 'uppercase' }}>Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {customerBookings.slice(0, 5).map((booking) => {
                                        const bookingDate = new Date(booking.booking_date);
                                        const consoleInfo = booking.booking_items?.[0];
                                        const stationName = consoleInfo?.console?.toUpperCase() || 'N/A';

                                        return (
                                            <tr key={booking.id} style={{ borderBottom: '1px solid rgba(242,240,234,0.03)' }}>
                                                <td style={{ padding: '16px', color: '#f2f0ea', fontSize: 14 }}>
                                                    <div style={{ fontWeight: 500 }}>{bookingDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}</div>
                                                    <div style={{ fontSize: 12, color: 'rgba(242,240,234,.35)' }}>{convertTo12Hour(booking.start_time)}</div>
                                                </td>
                                                <td style={{ padding: '16px', color: '#f2f0ea', fontSize: 14 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        <span style={{
                                                            padding: '2px 8px', background: 'rgba(216,255,60,0.10)',
                                                            color: '#d8ff3c', fontSize: 12, fontWeight: 600
                                                        }}>
                                                            {booking.source === 'membership' ? 'Membership' : stationName}
                                                        </span>
                                                        <span style={{ color: 'rgba(242,240,234,.45)' }}>
                                                            {booking.source === 'membership'
                                                              ? (customer.activeSubscription?.membership_plans?.name || 'Plan')
                                                              : booking.duration ? `${Math.floor(booking.duration / 60)}h ${booking.duration % 60}m` : 'N/A'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '16px', textAlign: 'right', color: '#f2f0ea', fontWeight: 600, fontSize: 14 }}>
                                                    ₹{getBookingRevenueTotal(booking).toLocaleString('en-IN')}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {customerBookings.length === 0 && (
                                        <tr>
                                            <td colSpan={3} style={{ padding: '40px', textAlign: 'center', color: 'rgba(242,240,234,.35)' }}>
                                                No sessions found
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
