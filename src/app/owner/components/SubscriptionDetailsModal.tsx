/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { theme } from '../utils/theme';

type SubscriptionDetailsModalProps = {
    subscription: any;
    usageHistory: any[];
    loadingUsageHistory: boolean;
    isMobile: boolean;
    onClose: () => void;
    onViewCustomer: (customer: any) => void;
    onDelete: (id: string) => Promise<void>;
};

export default function SubscriptionDetailsModal({
    subscription: sub,
    usageHistory,
    loadingUsageHistory,
    isMobile,
    onClose,
    onViewCustomer,
    onDelete
}: SubscriptionDetailsModalProps) {
    if (!sub) return null;

    const planDetails = sub.membership_plans || {};
    const hoursRemaining = sub.hours_remaining || 0;
    const hoursPurchased = sub.hours_purchased || 1;
    const hoursUsed = hoursPurchased - hoursRemaining;
    const progressPercent = (hoursRemaining / hoursPurchased) * 100;
    const expiryDate = sub.expiry_date ? new Date(sub.expiry_date) : null;
    const purchaseDate = sub.purchase_date ? new Date(sub.purchase_date) : null;
    const daysRemaining = expiryDate ? Math.max(0, Math.ceil((expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))) : 0;
    const statusColor = sub.status === 'active' ? '#d8ff3c' : sub.status === 'expired' ? '#ff5c2b' : '#6b7280';

    // Get initials for avatar
    const nameParts = sub.customer_name?.split(' ') || [];
    const initials = nameParts.length >= 2
        ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
        : (sub.customer_name?.[0] || 'U').toUpperCase();

    return (
        <div
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(0, 0, 0, 0.7)",
                backdropFilter: "blur(4px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
                padding: isMobile ? "16px" : "20px",
                overflowY: 'auto',
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: theme.cardBackground,
                    borderRadius: isMobile ? 16 : 24,
                    border: `1px solid ${theme.border}`,
                    maxWidth: 900,
                    width: "100%",
                    maxHeight: '90vh',
                    overflowY: 'auto',
                    boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header with Back Button */}
                <div style={{
                    padding: isMobile ? "20px 24px" : "28px 32px",
                    borderBottom: `1px solid ${theme.border}`,
                    background: "rgba(16, 185, 129, 0.05)",
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: theme.textMuted,
                            fontSize: isMobile ? 14 : 15,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            marginBottom: 16,
                            padding: 0,
                        }}
                    >
                        ← Back to Subscriptions
                    </button>
                </div>

                {/* Customer Info Card */}
                <div style={{ padding: isMobile ? "24px" : "32px" }}>
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: `1px solid ${theme.border}`,
                        borderRadius: 16,
                        padding: isMobile ? "20px" : "24px",
                        marginBottom: 24,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                <div style={{
                                    width: isMobile ? 60 : 72,
                                    height: isMobile ? 60 : 72,
                                    borderRadius: '50%',
                                    background: '#d8ff3c',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: isMobile ? 24 : 32,
                                    fontWeight: 700,
                                    color: '#fff',
                                }}>
                                    {initials}
                                </div>
                                <div>
                                    <h2 style={{ fontSize: isMobile ? 20 : 28, fontWeight: 700, color: theme.textPrimary, margin: 0, marginBottom: 4 }}>
                                        {sub.customer_name}
                                    </h2>
                                    <p style={{ fontSize: isMobile ? 14 : 16, color: theme.textSecondary, margin: 0 }}>
                                        {sub.customer_phone}
                                    </p>
                                </div>
                            </div>
                            <span style={{
                                padding: isMobile ? '8px 16px' : '10px 20px',
                                background: `${statusColor}20`,
                                color: statusColor,
                                borderRadius: 20,
                                fontSize: isMobile ? 13 : 15,
                                fontWeight: 600,
                                textTransform: 'capitalize',
                            }}>
                                {sub.status}
                            </span>
                        </div>

                        {/* Plan Details Grid */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
                            gap: isMobile ? 16 : 20,
                            padding: isMobile ? '16px 0' : '20px 0',
                            borderTop: `1px solid ${theme.border}`,
                        }}>
                            <div>
                                <p style={{ fontSize: isMobile ? 11 : 12, color: theme.textMuted, margin: '0 0 6px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Plan
                                </p>
                                <p style={{ fontSize: isMobile ? 14 : 16, fontWeight: 600, color: theme.textPrimary, margin: 0 }}>
                                    {planDetails.name || 'N/A'}
                                </p>
                            </div>
                            <div>
                                <p style={{ fontSize: isMobile ? 11 : 12, color: theme.textMuted, margin: '0 0 6px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Purchased
                                </p>
                                <p style={{ fontSize: isMobile ? 14 : 16, fontWeight: 600, color: theme.textPrimary, margin: 0 }}>
                                    {purchaseDate ? purchaseDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                                </p>
                            </div>
                            <div>
                                <p style={{ fontSize: isMobile ? 11 : 12, color: theme.textMuted, margin: '0 0 6px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Expires
                                </p>
                                <p style={{ fontSize: isMobile ? 14 : 16, fontWeight: 600, color: theme.textPrimary, margin: 0 }}>
                                    {expiryDate ? expiryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                                    {daysRemaining > 0 && (
                                        <span style={{ fontSize: isMobile ? 11 : 12, color: theme.textMuted, marginLeft: 4 }}>
                                            ({daysRemaining} days)
                                        </span>
                                    )}
                                </p>
                            </div>
                            <div>
                                <p style={{ fontSize: isMobile ? 11 : 12, color: theme.textMuted, margin: '0 0 6px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Amount Paid
                                </p>
                                <p style={{ fontSize: isMobile ? 16 : 18, fontWeight: 700, color: '#d8ff3c', margin: 0 }}>
                                    ₹{sub.amount_paid}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Time Balance Card */}
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: `1px solid ${theme.border}`,
                        borderRadius: 16,
                        padding: isMobile ? "20px" : "24px",
                        marginBottom: 24,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                            <h3 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, color: theme.textPrimary, margin: 0 }}>
                                Time Balance
                            </h3>
                            <button
                                style={{
                                    padding: isMobile ? '8px 16px' : '10px 20px',
                                    background: '#d8ff3c',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: 10,
                                    fontSize: isMobile ? 13 : 14,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                }}
                            >
                                + Add Time
                            </button>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
                            <div>
                                <p style={{ fontSize: isMobile ? 36 : 48, fontWeight: 700, color: theme.textPrimary, margin: 0, lineHeight: 1 }}>
                                    {Math.floor(hoursRemaining)}h {Math.round((hoursRemaining % 1) * 60)}m
                                </p>
                                <p style={{ fontSize: isMobile ? 13 : 14, color: theme.textMuted, margin: '8px 0 0 0' }}>
                                    remaining
                                </p>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <p style={{ fontSize: isMobile ? 20 : 24, fontWeight: 600, color: theme.textSecondary, margin: 0, lineHeight: 1 }}>
                                    {hoursPurchased} Hours
                                </p>
                                <p style={{ fontSize: isMobile ? 13 : 14, color: theme.textMuted, margin: '8px 0 0 0' }}>
                                    total
                                </p>
                            </div>
                        </div>

                        {/* Progress Bar */}
                        <div style={{
                            width: '100%',
                            height: 12,
                            background: 'rgba(255, 255, 255, 0.05)',
                            borderRadius: 6,
                            overflow: 'hidden',
                            marginBottom: 12,
                        }}>
                            <div style={{
                                width: `${progressPercent}%`,
                                height: '100%',
                                background: progressPercent > 50 ? '#d8ff3c' : progressPercent > 20 ? '#ff5c2b' : '#ff5c2b',
                                transition: 'width 0.3s',
                            }} />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: isMobile ? 12 : 13, color: theme.textMuted }}>
                            <span>Used: {Math.floor(hoursUsed)}h {Math.round((hoursUsed % 1) * 60)}m ({Math.round((hoursUsed / hoursPurchased) * 100)}%)</span>
                            <span style={{ color: progressPercent > 50 ? '#d8ff3c' : progressPercent > 20 ? '#ff5c2b' : '#ff5c2b', fontWeight: 600 }}>
                                {Math.round(progressPercent)}% remaining
                            </span>
                        </div>
                    </div>

                    {/* Usage History */}
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: `1px solid ${theme.border}`,
                        borderRadius: 16,
                        padding: isMobile ? "20px" : "24px",
                        marginBottom: 24,
                    }}>
                        <h3 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, color: theme.textPrimary, margin: '0 0 20px 0' }}>
                            Usage History
                        </h3>

                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: isMobile ? 11 : 12, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase' }}>DATE & TIME</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: isMobile ? 11 : 12, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase' }}>SESSION</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: isMobile ? 11 : 12, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase' }}>DURATION</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loadingUsageHistory ? (
                                        <tr>
                                            <td colSpan={3} style={{ padding: '40px 16px', textAlign: 'center', color: theme.textMuted, fontSize: isMobile ? 13 : 14 }}>
                                                Loading usage history...
                                            </td>
                                        </tr>
                                    ) : usageHistory.length === 0 ? (
                                        <tr>
                                            <td colSpan={3} style={{ padding: '40px 16px', textAlign: 'center', color: theme.textMuted, fontSize: isMobile ? 13 : 14 }}>
                                                No usage history yet
                                            </td>
                                        </tr>
                                    ) : (
                                        usageHistory.map((history, index) => {
                                            const startTime = new Date(history.start_time);
                                            const endTime = new Date(history.end_time);
                                            const durationHours = history.duration_hours;
                                            const hours = Math.floor(durationHours);
                                            const minutes = Math.round((durationHours % 1) * 60);

                                            return (
                                                <tr key={history.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                                                    <td style={{ padding: '16px', fontSize: isMobile ? 13 : 14, color: theme.textPrimary }}>
                                                        <div>{startTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                                                        <div style={{ fontSize: isMobile ? 11 : 12, color: theme.textMuted, marginTop: 2 }}>
                                                            {startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })} - {endTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '16px', fontSize: isMobile ? 13 : 14, color: '#d8ff3c', fontWeight: 600 }}>
                                                        #{usageHistory.length - index}
                                                    </td>
                                                    <td style={{ padding: '16px', fontSize: isMobile ? 13 : 14, color: '#d8ff3c', fontWeight: 600 }}>
                                                        {hours}h {minutes}m
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <button
                            onClick={() => {
                                onViewCustomer({
                                    name: sub.customer_name,
                                    phone: sub.customer_phone,
                                    email: sub.customer_email,
                                    subscription: sub
                                });
                            }}
                            style={{
                                flex: isMobile ? '1 1 100%' : '1',
                                padding: isMobile ? "12px 20px" : "14px 24px",
                                background: 'transparent',
                                border: `2px solid ${theme.border}`,
                                borderRadius: 10,
                                color: theme.textPrimary,
                                fontSize: isMobile ? 14 : 15,
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                            }}
                        >
                            <span>👤</span> View Customer
                        </button>
                        <button
                            style={{
                                flex: isMobile ? '1 1 100%' : '1',
                                padding: isMobile ? "12px 20px" : "14px 24px",
                                background: 'transparent',
                                border: `2px solid rgba(251, 191, 36, 0.4)`,
                                borderRadius: 10,
                                color: '#ff5c2b',
                                fontSize: isMobile ? 14 : 15,
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                            }}
                        >
                            <span>⛔</span> Suspend
                        </button>
                        <button
                            onClick={async () => {
                                if (confirm('Are you sure you want to delete this subscription?')) {
                                    await onDelete(sub.id);
                                }
                            }}
                            style={{
                                flex: isMobile ? '1 1 100%' : '1',
                                padding: isMobile ? "12px 20px" : "14px 24px",
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: `2px solid rgba(239, 68, 68, 0.4)`,
                                borderRadius: 10,
                                color: '#ff5c2b',
                                fontSize: isMobile ? 14 : 15,
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                            }}
                        >
                            <span>🗑️</span> Delete
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
