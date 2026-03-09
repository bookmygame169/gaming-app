import React from 'react';
import { BookingRow } from '../../types';
import { convertTo12Hour, getLocalDateString } from '../../utils';
import { getEndTime } from '@/lib/timeUtils';

type SessionsTabProps = {
  theme: any;
  isMobile: boolean;
  loadingData: boolean;
  flattenedFilteredBookings: BookingRow[];
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  dateFilter: string;
  setDateFilter: (v: string) => void;
  bookingPage: number;
  setBookingPage: React.Dispatch<React.SetStateAction<number>>;
  bookingsPerPage: number;
  totalBookingsCount: number;
  handleConfirmBooking: (booking: BookingRow) => void;
  handleStartBooking: (booking: BookingRow) => void;
  handleEditBooking: (booking: BookingRow) => void;
};

export default function SessionsTab({
  theme,
  isMobile,
  loadingData,
  flattenedFilteredBookings,
  searchQuery,
  setSearchQuery,
  statusFilter,
  setStatusFilter,
  dateFilter,
  setDateFilter,
  bookingPage,
  setBookingPage,
  bookingsPerPage,
  totalBookingsCount,
  handleConfirmBooking,
  handleStartBooking,
  handleEditBooking,
}: SessionsTabProps) {
  const isBookingEnded = (booking: BookingRow) => {
    try {
      const bookingDate = booking.booking_date || '';
      const startTime = booking.start_time || '';
      const duration = booking.duration || 60;
      if (!bookingDate || !startTime) return false;
      const now = new Date();
      const todayStr = getLocalDateString(now);
      if (bookingDate < todayStr) return true;
      if (bookingDate > todayStr) return false;
      const timeParts = startTime.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
      if (!timeParts) return false;
      let hours = parseInt(timeParts[1]);
      const minutes = parseInt(timeParts[2]);
      const period = timeParts[3]?.toLowerCase();
      if (period) {
        if (period === 'pm' && hours !== 12) hours += 12;
        else if (period === 'am' && hours === 12) hours = 0;
      }
      const endMinutes = hours * 60 + minutes + duration;
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      return currentMinutes > endMinutes;
    } catch { return false; }
  };

  const getDisplayStatus = (booking: BookingRow) => {
    const ended = isBookingEnded(booking);
    return ended && (booking.status === 'confirmed' || booking.status === 'in-progress')
      ? 'completed'
      : (booking.status || 'pending');
  };

  const statusColors: Record<string, { bg: string; text: string }> = {
    pending: { bg: 'rgba(234, 179, 8, 0.15)', text: '#eab308' },
    confirmed: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6' },
    'in-progress': { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981' },
    completed: { bg: 'rgba(100, 116, 139, 0.15)', text: '#64748b' },
    cancelled: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444' },
  };

  const getPaymentIcon = (mode: string) => {
    switch (mode) {
      case 'cash': return '💵';
      case 'upi': return '📱';
      default: return '💵';
    }
  };

  return (
    <div>
      {/* Header with search and filters */}
      <div style={{ marginBottom: isMobile ? 16 : 24 }}>
        <div style={{ marginBottom: isMobile ? 12 : 20 }}>
          <h2 style={{ fontSize: isMobile ? 18 : 24, fontWeight: 700, color: theme.textPrimary, margin: 0, marginBottom: isMobile ? 2 : 4 }}>Bookings</h2>
          <p style={{ fontSize: isMobile ? 12 : 14, color: theme.textMuted, margin: 0 }}>Manage gaming bookings</p>
        </div>

        {/* Search and filters row */}
        <div style={{ display: 'flex', gap: isMobile ? 8 : 12, alignItems: 'center', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
          <div style={{ flex: isMobile ? '1 1 100%' as const : 1, position: 'relative' }}>
            <input
              type="text"
              placeholder={isMobile ? 'Search...' : 'Search customer name or phone...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: isMobile ? '10px 12px 10px 36px' : '12px 16px 12px 44px',
                background: theme.cardBackground,
                border: `1px solid ${theme.border}`,
                borderRadius: isMobile ? 8 : 10,
                color: theme.textPrimary,
                fontSize: isMobile ? 13 : 14,
                outline: 'none',
              }}
            />
            <span style={{ position: 'absolute', left: isMobile ? 12 : 16, top: '50%', transform: 'translateY(-50%)', fontSize: isMobile ? 16 : 18, opacity: 0.5 }}>🔍</span>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: isMobile ? '10px 12px' : '12px 16px',
              background: theme.cardBackground,
              border: `1px solid ${theme.border}`,
              borderRadius: isMobile ? 8 : 10,
              color: theme.textPrimary,
              fontSize: isMobile ? 12 : 14,
              cursor: 'pointer',
              minWidth: isMobile ? 'auto' : 140,
              flex: isMobile ? '1' : 'auto',
            }}
          >
            <option value="all">All Status</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            style={{
              padding: isMobile ? '10px 12px' : '12px 16px',
              background: theme.cardBackground,
              border: `1px solid ${theme.border}`,
              borderRadius: isMobile ? 8 : 10,
              color: theme.textPrimary,
              fontSize: isMobile ? 12 : 14,
              cursor: 'pointer',
              minWidth: isMobile ? 'auto' : 160,
              flex: isMobile ? '1 1 100%' as const : 'auto',
            }}
          />
        </div>
      </div>

      {/* Bookings Table */}
      <div style={{ background: theme.cardBackground, borderRadius: isMobile ? 12 : 16, border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
        {loadingData ? (
          <div style={{ padding: isMobile ? 40 : 60, textAlign: 'center' }}>
            <div style={{ fontSize: isMobile ? 32 : 48, marginBottom: isMobile ? 8 : 12, opacity: 0.3 }}>⏳</div>
            <p style={{ color: theme.textMuted, fontSize: isMobile ? 12 : 14 }}>Loading bookings...</p>
          </div>
        ) : flattenedFilteredBookings.length === 0 ? (
          <div style={{ padding: isMobile ? 40 : 60, textAlign: 'center' }}>
            <div style={{ fontSize: isMobile ? 32 : 48, marginBottom: isMobile ? 8 : 12, opacity: 0.3 }}>📅</div>
            <p style={{ fontSize: isMobile ? 14 : 16, color: theme.textSecondary, marginBottom: isMobile ? 4 : 6, fontWeight: 500 }}>No bookings yet</p>
            <p style={{ color: theme.textMuted, fontSize: isMobile ? 12 : 14 }}>Bookings will appear here once created</p>
          </div>
        ) : isMobile ? (
          // Mobile Card Layout
          <div>
            {flattenedFilteredBookings.map((booking, index) => {
              const isWalkIn = booking.source === 'walk-in';
              const customerName = isWalkIn ? booking.customer_name : booking.user_name || booking.user_email;
              const customerPhone = isWalkIn ? (booking.customer_phone || booking.user_phone || '-') : (booking.user_phone || '-');
              const consoleInfo = booking.booking_items?.[0];
              const displayStatus = getDisplayStatus(booking);
              const statusColor = statusColors[displayStatus] || statusColors.pending;

              const formattedStarted = booking.booking_date && booking.start_time
                ? `${new Date(booking.booking_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} at ${convertTo12Hour(booking.start_time)}`
                : '-';

              return (
                <div
                  key={booking.id}
                  style={{
                    padding: '12px 16px',
                    borderBottom: index < flattenedFilteredBookings.length - 1 ? `1px solid ${theme.border}` : 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: theme.textPrimary }}>{customerName || 'Unknown'}</div>
                      <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>{customerPhone || 'No phone'}</div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#22c55e' }}>₹{booking.total_amount || 0}</div>
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11 }}>
                    <span style={{ padding: '4px 8px', borderRadius: 5, background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', fontWeight: 600 }}>
                      {consoleInfo?.console?.toUpperCase() || 'N/A'}
                    </span>
                    <span style={{ padding: '4px 8px', borderRadius: 5, background: 'rgba(168, 85, 247, 0.1)', color: '#a855f7', fontWeight: 600 }}>
                      {formattedStarted}
                    </span>
                    <span style={{ padding: '4px 8px', borderRadius: 5, background: 'rgba(249, 115, 22, 0.1)', color: '#f97316', fontWeight: 600 }}>
                      {booking.duration}m
                    </span>
                    <span style={{ padding: '4px 8px', borderRadius: 5, background: statusColor.bg, color: statusColor.text, fontWeight: 600, textTransform: 'capitalize' }}>
                      {displayStatus.replace('-', ' ')}
                    </span>
                    <span style={{ padding: '4px 8px', borderRadius: 5, background: 'rgba(168, 85, 247, 0.1)', color: '#a855f7', fontWeight: 600 }}>
                      {getPaymentIcon(booking.payment_mode || 'cash')} {booking.payment_mode || 'cash'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    {displayStatus === 'pending' && booking.source === 'online' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleConfirmBooking(booking); }}
                        style={{ flex: 1, padding: '8px 12px', background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Confirm
                      </button>
                    )}
                    {displayStatus === 'confirmed' && !isWalkIn && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleStartBooking(booking); }}
                        style={{ flex: 1, padding: '8px 12px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Start
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEditBooking(booking); }}
                      style={{ padding: '8px 12px', background: 'transparent', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: 6, fontSize: 16, cursor: 'pointer' }}
                      title="View details"
                    >
                      👁️
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          // Desktop Table Layout
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(15,23,42,0.8)', borderBottom: `1px solid ${theme.border}` }}>
                {['Customer', 'Phone', 'Station', 'Duration', 'Started', 'Ends', 'Payment', 'Source', 'Amount', 'Status', 'Actions'].map(col => (
                  <th key={col} style={{ padding: '16px 20px', textAlign: col === 'Actions' ? 'center' : 'left', fontSize: 11, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {flattenedFilteredBookings.map((booking, index) => {
                const isWalkIn = booking.source === 'walk-in';
                const customerName = isWalkIn ? booking.customer_name : booking.user_name || booking.user_email;
                const customerPhone = isWalkIn ? (booking.customer_phone || booking.user_phone || '-') : (booking.user_phone || '-');
                const consoleInfo = booking.booking_items?.[0];
                const displayStatus = getDisplayStatus(booking);
                const statusColor = statusColors[displayStatus] || statusColors.pending;
                const formattedStarted = booking.booking_date && booking.start_time
                  ? `${new Date(booking.booking_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} at ${convertTo12Hour(booking.start_time)}`
                  : '-';

                return (
                  <tr
                    key={booking.id}
                    style={{ borderBottom: index < flattenedFilteredBookings.length - 1 ? `1px solid ${theme.border}` : 'none', transition: 'background 0.15s ease' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(51,65,85,0.2)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '16px 20px' }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: theme.textPrimary }}>{customerName || 'Unknown'}</div>
                    </td>
                    <td style={{ padding: '16px 20px', fontSize: 13, color: theme.textSecondary }}>{customerPhone || '-'}</td>
                    <td style={{ padding: '16px 20px', fontSize: 14, fontWeight: 500, color: theme.textPrimary }}>{consoleInfo?.console || '-'}</td>
                    <td style={{ padding: '16px 20px', fontSize: 14, color: theme.textSecondary }}>{booking.duration ? `${booking.duration}m` : '-'}</td>
                    <td style={{ padding: '16px 20px', fontSize: 14, color: theme.textSecondary }}>{formattedStarted}</td>
                    <td style={{ padding: '16px 20px', fontSize: 14, color: theme.textSecondary }}>
                      {booking.start_time && booking.duration ? getEndTime(booking.start_time, booking.duration) : '-'}
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      <span style={{ display: 'inline-block', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, textTransform: 'capitalize', background: 'rgba(168, 85, 247, 0.1)', color: '#a855f7' }}>
                        {getPaymentIcon(booking.payment_mode || 'cash')} {booking.payment_mode || 'cash'}
                      </span>
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      <span style={{ display: 'inline-block', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: booking.source?.toLowerCase() === 'walk-in' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)', color: booking.source?.toLowerCase() === 'walk-in' ? '#ef4444' : '#3b82f6' }}>
                        {booking.source?.toLowerCase() === 'walk-in' ? '🚶 Walk-in' : '💻 Online'}
                      </span>
                    </td>
                    <td style={{ padding: '16px 20px', fontSize: 15, fontWeight: 600, color: theme.textPrimary }}>₹{booking.total_amount || 0}</td>
                    <td style={{ padding: '16px 20px' }}>
                      <span style={{ display: 'inline-block', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, textTransform: 'capitalize', background: statusColor.bg, color: statusColor.text }}>
                        {displayStatus.replace('-', ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
                        {displayStatus === 'pending' && booking.source === 'online' && (
                          <button onClick={(e) => { e.stopPropagation(); handleConfirmBooking(booking); }}
                            style={{ padding: '6px 14px', background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            Confirm
                          </button>
                        )}
                        {displayStatus === 'confirmed' && !isWalkIn && (
                          <button onClick={(e) => { e.stopPropagation(); handleStartBooking(booking); }}
                            style={{ padding: '6px 14px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            Start
                          </button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); handleEditBooking(booking); }}
                          style={{ padding: '8px 12px', background: 'transparent', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: 6, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          title="View details">
                          👁️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Controls */}
      {flattenedFilteredBookings.length > 0 && (
        <div style={{ marginTop: 24, padding: '16px 20px', background: theme.cardBackground, border: `1px solid ${theme.border}`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ fontSize: 13, color: theme.textSecondary, fontWeight: 500 }}>
            Showing {((bookingPage - 1) * bookingsPerPage) + 1}–{Math.min(bookingPage * bookingsPerPage, totalBookingsCount)} of {totalBookingsCount} bookings
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => setBookingPage(prev => Math.max(1, prev - 1))}
              disabled={bookingPage === 1}
              style={{ padding: '8px 16px', background: bookingPage === 1 ? 'rgba(100,116,139,0.1)' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', color: bookingPage === 1 ? theme.textMuted : 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: bookingPage === 1 ? 'not-allowed' : 'pointer', opacity: bookingPage === 1 ? 0.5 : 1 }}
            >
              ← Previous
            </button>
            <div style={{ padding: '8px 16px', background: 'rgba(59,130,246,0.1)', border: `1px solid rgba(59,130,246,0.3)`, borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#3b82f6' }}>
              Page {bookingPage} of {Math.ceil(totalBookingsCount / bookingsPerPage)}
            </div>
            <button
              onClick={() => setBookingPage(prev => Math.min(Math.ceil(totalBookingsCount / bookingsPerPage), prev + 1))}
              disabled={bookingPage >= Math.ceil(totalBookingsCount / bookingsPerPage)}
              style={{ padding: '8px 16px', background: bookingPage >= Math.ceil(totalBookingsCount / bookingsPerPage) ? 'rgba(100,116,139,0.1)' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', color: bookingPage >= Math.ceil(totalBookingsCount / bookingsPerPage) ? theme.textMuted : 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: bookingPage >= Math.ceil(totalBookingsCount / bookingsPerPage) ? 'not-allowed' : 'pointer', opacity: bookingPage >= Math.ceil(totalBookingsCount / bookingsPerPage) ? 0.5 : 1 }}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
