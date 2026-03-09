import React from 'react';
import { BookingRow } from '../../types';
import { getLocalDateString } from '../../utils';

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  sessions: number;
  totalSpent: number;
  lastVisit: string;
  source: string;
};

type Subscription = {
  customer_phone?: string | null;
  customer_name?: string | null;
  [key: string]: unknown;
};

type CustomersTabProps = {
  theme: any;
  bookings: BookingRow[];
  customerSearch: string;
  setCustomerSearch: (v: string) => void;
  hasSubscription: boolean;
  setHasSubscription: (v: boolean) => void;
  hasMembership: boolean;
  setHasMembership: (v: boolean) => void;
  customerSortBy: 'name' | 'sessions' | 'totalSpent' | 'lastVisit';
  setCustomerSortBy: (v: 'name' | 'sessions' | 'totalSpent' | 'lastVisit') => void;
  customerSortOrder: 'asc' | 'desc';
  setCustomerSortOrder: (v: 'asc' | 'desc') => void;
  subscriptions: Subscription[];
  setViewingCustomer: (c: any) => void;
  handleViewCustomer: (customer: Customer) => void;
};

export default function CustomersTab({
  theme,
  bookings,
  customerSearch,
  setCustomerSearch,
  hasSubscription,
  setHasSubscription,
  hasMembership,
  setHasMembership,
  customerSortBy,
  setCustomerSortBy,
  customerSortOrder,
  setCustomerSortOrder,
  subscriptions,
  setViewingCustomer,
}: CustomersTabProps) {
  const customerMap = new Map<string, Customer>();

  bookings.forEach(booking => {
    const customerId = booking.user_id || booking.customer_phone || booking.customer_name || 'unknown';
    const customerName = booking.customer_name || booking.user_name || 'Unknown';
    const customerPhone = booking.customer_phone || booking.user_phone || null;
    const customerEmail = booking.user_email || null;

    if (customerMap.has(customerId)) {
      const existing = customerMap.get(customerId)!;
      existing.sessions += 1;
      existing.totalSpent += booking.total_amount || 0;
      if (new Date(booking.booking_date || '') > new Date(existing.lastVisit)) {
        existing.lastVisit = booking.booking_date || '';
      }
    } else {
      customerMap.set(customerId, {
        id: customerId,
        name: customerName,
        phone: customerPhone,
        email: customerEmail,
        sessions: 1,
        totalSpent: booking.total_amount || 0,
        lastVisit: booking.booking_date || '',
        source: booking.source || 'online'
      });
    }
  });

  let customers = Array.from(customerMap.values());

  if (customerSearch) {
    const search = customerSearch.toLowerCase();
    customers = customers.filter(c =>
      c.name.toLowerCase().includes(search) ||
      (c.phone && c.phone.includes(search)) ||
      (c.email && c.email.toLowerCase().includes(search))
    );
  }

  customers.sort((a, b) => {
    let comparison = 0;
    switch (customerSortBy) {
      case 'name': comparison = a.name.localeCompare(b.name); break;
      case 'sessions': comparison = a.sessions - b.sessions; break;
      case 'totalSpent': comparison = a.totalSpent - b.totalSpent; break;
      case 'lastVisit': comparison = new Date(a.lastVisit).getTime() - new Date(b.lastVisit).getTime(); break;
    }
    return customerSortOrder === 'asc' ? comparison : -comparison;
  });

  const handleSort = (column: 'name' | 'sessions' | 'totalSpent' | 'lastVisit') => {
    if (customerSortBy === column) {
      setCustomerSortOrder(customerSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setCustomerSortBy(column);
      setCustomerSortOrder('desc');
    }
  };

  const getSortIcon = (column: 'name' | 'sessions' | 'totalSpent' | 'lastVisit') => {
    if (customerSortBy !== column) return '↕';
    return customerSortOrder === 'asc' ? '↑' : '↓';
  };

  const today = getLocalDateString();
  const getLastVisitDisplay = (date: string) => {
    if (date === today) return 'Today';
    const visitDate = new Date(date);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - visitDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays === 1) return 'Yesterday';
    if (diffDays <= 7) return `${diffDays} days ago`;
    return visitDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const sortBtnStyle = (col: 'name' | 'sessions' | 'totalSpent' | 'lastVisit') => ({
    fontSize: 12,
    fontWeight: 700 as const,
    color: customerSortBy === col ? theme.textPrimary : theme.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    display: 'flex',
    alignItems: 'center' as const,
    gap: 6,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    textAlign: 'left' as const,
  });

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, boxShadow: '0 4px 16px rgba(102, 126, 234, 0.3)' }}>
              👥
            </div>
            <div>
              <h2 style={{ fontSize: 32, fontWeight: 800, color: theme.textPrimary, margin: 0, marginBottom: 4, letterSpacing: '-0.5px' }}>Customers</h2>
              <p style={{ fontSize: 15, color: theme.textMuted, margin: 0 }}>
                Manage your customer database • {customers.length} total customers
              </p>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div style={{ background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(168, 85, 247, 0.05) 100%)', borderRadius: 18, border: `1px solid rgba(99, 102, 241, 0.1)`, padding: 24, boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)' }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 300, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', fontSize: 20 }}>🔍</span>
              <input
                type="text"
                placeholder="Search by name, phone, email..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                style={{ width: '100%', padding: '14px 18px 14px 52px', background: theme.cardBackground, border: `2px solid ${theme.border}`, borderRadius: 12, color: theme.textPrimary, fontSize: 15, outline: 'none', transition: 'all 0.2s' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.1)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = theme.border; e.currentTarget.style.boxShadow = 'none'; }}
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none', padding: '10px 16px', borderRadius: 10, background: hasSubscription ? 'rgba(99, 102, 241, 0.15)' : theme.cardBackground, border: `2px solid ${hasSubscription ? '#6366f1' : theme.border}`, transition: 'all 0.2s' }}>
              <input type="checkbox" checked={hasSubscription} onChange={(e) => setHasSubscription(e.target.checked)} style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#6366f1' }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: hasSubscription ? '#6366f1' : theme.textSecondary }}>Has Subscription</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none', padding: '10px 16px', borderRadius: 10, background: hasMembership ? 'rgba(168, 85, 247, 0.15)' : theme.cardBackground, border: `2px solid ${hasMembership ? '#a855f7' : theme.border}`, transition: 'all 0.2s' }}>
              <input type="checkbox" checked={hasMembership} onChange={(e) => setHasMembership(e.target.checked)} style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#a855f7' }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: hasMembership ? '#a855f7' : theme.textSecondary }}>Has Membership</span>
            </label>
          </div>
        </div>
      </div>

      {/* Customer Table */}
      <div style={{ background: theme.cardBackground, borderRadius: 18, border: `1px solid ${theme.border}`, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)' }}>
        {/* Table Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '200px 120px 180px 120px 100px 130px 150px 60px', gap: 16, padding: '18px 28px', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(168, 85, 247, 0.08) 100%)', borderBottom: `2px solid rgba(99, 102, 241, 0.15)` }}>
          <button onClick={() => handleSort('name')} style={sortBtnStyle('name')}>CUSTOMER {getSortIcon('name')}</button>
          <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>PHONE</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>EMAIL</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>MODE</div>
          <button onClick={() => handleSort('sessions')} style={sortBtnStyle('sessions')}>SESSIONS {getSortIcon('sessions')}</button>
          <button onClick={() => handleSort('totalSpent')} style={sortBtnStyle('totalSpent')}>TOTAL SPENT {getSortIcon('totalSpent')}</button>
          <button onClick={() => handleSort('lastVisit')} style={sortBtnStyle('lastVisit')}>LAST VISIT {getSortIcon('lastVisit')}</button>
          <div></div>
        </div>

        {/* Table Body */}
        {customers.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>👥</div>
            <p style={{ fontSize: 16, color: theme.textSecondary, marginBottom: 8 }}>No customers found</p>
            <p style={{ fontSize: 14, color: theme.textMuted }}>
              {customerSearch ? 'Try adjusting your search criteria' : 'Customers will appear here after bookings'}
            </p>
          </div>
        ) : (
          customers.map((customer, index) => (
            <div
              key={customer.id}
              style={{ display: 'grid', gridTemplateColumns: '200px 120px 180px 120px 100px 130px 150px 60px', gap: 16, padding: '20px 28px', borderBottom: index < customers.length - 1 ? `1px solid rgba(71, 85, 105, 0.15)` : 'none', transition: 'all 0.2s ease', cursor: 'pointer' }}
              onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(99, 102, 241, 0.04)'; e.currentTarget.style.transform = 'translateX(4px)'; }}
              onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'translateX(0)'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700, color: 'white', flexShrink: 0, boxShadow: '0 2px 8px rgba(102, 126, 234, 0.25)' }}>
                  {customer.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: theme.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{customer.name}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', fontSize: 14, color: theme.textSecondary }}>{customer.phone || '-'}</div>
              <div style={{ display: 'flex', alignItems: 'center', fontSize: 14, color: theme.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customer.email || '-'}</div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: customer.source === 'walk-in' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)', color: customer.source === 'walk-in' ? '#ef4444' : '#3b82f6', textTransform: 'capitalize' }}>
                  {customer.source === 'walk-in' ? 'Walk-in' : 'Online'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', fontSize: 15, fontWeight: 600, color: theme.textPrimary }}>{customer.sessions}</div>
              <div style={{ display: 'flex', alignItems: 'center', fontSize: 15, fontWeight: 600, color: theme.textPrimary }}>₹{customer.totalSpent}</div>
              <div style={{ display: 'flex', alignItems: 'center', fontSize: 14, color: theme.textSecondary }}>{getLastVisitDisplay(customer.lastVisit)}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <button
                  onClick={async () => {
                    const customerSub = subscriptions.find(s => s.customer_phone === customer.phone || s.customer_name === customer.name);
                    setViewingCustomer({ name: customer.name, phone: customer.phone, email: customer.email, subscription: customerSub || null, totalVisits: customer.sessions, totalSpent: customer.totalSpent, lastVisit: customer.lastVisit });
                  }}
                  style={{ width: 40, height: 40, background: 'rgba(99, 102, 241, 0.1)', border: `2px solid rgba(99, 102, 241, 0.2)`, borderRadius: 10, color: '#6366f1', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease', boxShadow: '0 2px 6px rgba(99, 102, 241, 0.15)' }}
                  onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(99, 102, 241, 0.2)'; e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.transform = 'scale(1.1)'; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)'; e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.2)'; e.currentTarget.style.transform = 'scale(1)'; }}
                  title="View customer details"
                >
                  👁️
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {customers.length > 0 && (
        <div style={{ marginTop: 24, textAlign: 'center', color: theme.textSecondary, fontSize: 14 }}>
          Showing {customers.length} customer{customers.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
