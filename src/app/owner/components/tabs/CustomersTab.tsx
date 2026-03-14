import React, { useMemo } from 'react';
import { BookingRow } from '../../types';
import { getLocalDateString } from '../../utils';

type CustomerSortBy = 'name' | 'sessions' | 'totalSpent' | 'lastVisit';

type CustomerSubscription = {
  amount_paid?: number | string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  expiry_date?: string | null;
  hours_purchased?: number | null;
  hours_remaining?: number | null;
  id: string;
  membership_plans?: {
    hours?: number | null;
    name?: string | null;
  } | null;
  purchase_date?: string | null;
  status?: string | null;
};

type Customer = {
  activeSubscription: CustomerSubscription | null;
  email: string | null;
  hasActiveSubscription: boolean;
  hasMembership: boolean;
  id: string;
  lastVisit: string;
  name: string;
  phone: string | null;
  sessions: number;
  source: 'membership' | 'online' | 'walk-in';
  totalSpent: number;
};

type CustomersTabProps = {
  theme: Record<string, string>;
  bookings: BookingRow[];
  customerSearch: string;
  setCustomerSearch: (v: string) => void;
  hasSubscription: boolean;
  setHasSubscription: (v: boolean) => void;
  hasMembership: boolean;
  setHasMembership: (v: boolean) => void;
  customerSortBy: CustomerSortBy;
  setCustomerSortBy: (v: CustomerSortBy) => void;
  customerSortOrder: 'asc' | 'desc';
  setCustomerSortOrder: (v: 'asc' | 'desc') => void;
  subscriptions: CustomerSubscription[];
  handleViewCustomer: (customer: Customer) => void;
};

function getCustomerKey({
  email,
  name,
  phone,
  userId,
}: {
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  userId?: string | null;
}) {
  if (userId) return `user:${userId}`;
  if (phone) return `phone:${phone}`;
  if (email) return `email:${email.toLowerCase()}`;
  if (name) return `name:${name.trim().toLowerCase()}`;
  return 'unknown';
}

function getSubscriptionAmount(amountPaid?: number | string | null) {
  if (typeof amountPaid === 'number') return amountPaid;
  return parseFloat(amountPaid ?? '0') || 0;
}

function getActiveSubscription(subscription: CustomerSubscription | null) {
  if (!subscription || subscription.status !== 'active') {
    return null;
  }

  if (!subscription.expiry_date) {
    return subscription;
  }

  return new Date(subscription.expiry_date) > new Date() ? subscription : null;
}

function getStatusBadge(customer: Customer) {
  if (customer.hasActiveSubscription) {
    return {
      background: 'rgba(16, 185, 129, 0.12)',
      color: '#10b981',
      label: 'Active Plan',
    };
  }

  if (customer.hasMembership) {
    return {
      background: 'rgba(168, 85, 247, 0.12)',
      color: '#a855f7',
      label: 'Member',
    };
  }

  if (customer.source === 'walk-in') {
    return {
      background: 'rgba(239, 68, 68, 0.1)',
      color: '#ef4444',
      label: 'Walk-in',
    };
  }

  return {
    background: 'rgba(59, 130, 246, 0.1)',
    color: '#3b82f6',
    label: 'Online',
  };
}

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
  handleViewCustomer,
}: CustomersTabProps) {
  const customers = useMemo(() => {
    const customerMap = new Map<string, Customer>();

    bookings.forEach((booking) => {
      const customerId = getCustomerKey({
        userId: booking.user_id,
        phone: booking.customer_phone || booking.user_phone,
        email: booking.user_email,
        name: booking.customer_name || booking.user_name,
      });
      const customerName = booking.customer_name || booking.user_name || 'Unknown';
      const customerPhone = booking.customer_phone || booking.user_phone || null;
      const customerEmail = booking.user_email || null;
      const bookingDate = booking.booking_date || '';

      if (customerMap.has(customerId)) {
        const existing = customerMap.get(customerId)!;
        existing.sessions += 1;
        existing.totalSpent += booking.total_amount || 0;
        if (bookingDate && new Date(bookingDate) > new Date(existing.lastVisit || 0)) {
          existing.lastVisit = bookingDate;
        }
        if (!existing.phone && customerPhone) existing.phone = customerPhone;
        if (!existing.email && customerEmail) existing.email = customerEmail;
        if (existing.name === 'Unknown' && customerName !== 'Unknown') existing.name = customerName;
        if (booking.source === 'walk_in') existing.source = 'walk-in';
        if (booking.source === 'online' && existing.source === 'membership') existing.source = 'online';
      } else {
        customerMap.set(customerId, {
          activeSubscription: null,
          email: customerEmail,
          hasActiveSubscription: false,
          hasMembership: false,
          id: customerId,
          lastVisit: bookingDate,
          name: customerName,
          phone: customerPhone,
          sessions: 1,
          source: booking.source === 'walk_in' ? 'walk-in' : 'online',
          totalSpent: booking.total_amount || 0,
        });
      }
    });

    subscriptions.forEach((subscription) => {
      const customerId = getCustomerKey({
        phone: subscription.customer_phone,
        name: subscription.customer_name,
      });
      const activeSubscription = getActiveSubscription(subscription);
      const purchaseDate = subscription.purchase_date
        ? getLocalDateString(new Date(subscription.purchase_date))
        : '';

      if (customerMap.has(customerId)) {
        const existing = customerMap.get(customerId)!;
        existing.hasMembership = true;
        existing.hasActiveSubscription = existing.hasActiveSubscription || Boolean(activeSubscription);
        existing.totalSpent += getSubscriptionAmount(subscription.amount_paid);
        if (!existing.phone && subscription.customer_phone) existing.phone = subscription.customer_phone;
        if (
          (!existing.lastVisit || (purchaseDate && new Date(purchaseDate) > new Date(existing.lastVisit))) &&
          purchaseDate
        ) {
          existing.lastVisit = purchaseDate;
        }
        if (existing.name === 'Unknown' && subscription.customer_name) {
          existing.name = subscription.customer_name;
        }
        if (!existing.activeSubscription && activeSubscription) {
          existing.activeSubscription = activeSubscription;
        }
      } else {
        customerMap.set(customerId, {
          activeSubscription,
          email: null,
          hasActiveSubscription: Boolean(activeSubscription),
          hasMembership: true,
          id: customerId,
          lastVisit: purchaseDate,
          name: subscription.customer_name || 'Unknown',
          phone: subscription.customer_phone || null,
          sessions: 0,
          source: 'membership',
          totalSpent: getSubscriptionAmount(subscription.amount_paid),
        });
      }
    });

    let filteredCustomers = Array.from(customerMap.values());

    if (customerSearch) {
      const search = customerSearch.toLowerCase();
      filteredCustomers = filteredCustomers.filter((customer) =>
        customer.name.toLowerCase().includes(search) ||
        (customer.phone && customer.phone.includes(search)) ||
        (customer.email && customer.email.toLowerCase().includes(search))
      );
    }

    if (hasSubscription) {
      filteredCustomers = filteredCustomers.filter((customer) => customer.hasActiveSubscription);
    }

    if (hasMembership) {
      filteredCustomers = filteredCustomers.filter((customer) => customer.hasMembership);
    }

    filteredCustomers.sort((a, b) => {
      let comparison = 0;

      switch (customerSortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'sessions':
          comparison = a.sessions - b.sessions;
          break;
        case 'totalSpent':
          comparison = a.totalSpent - b.totalSpent;
          break;
        case 'lastVisit':
          comparison = new Date(a.lastVisit || 0).getTime() - new Date(b.lastVisit || 0).getTime();
          break;
      }

      return customerSortOrder === 'asc' ? comparison : -comparison;
    });

    return filteredCustomers;
  }, [
    bookings,
    customerSearch,
    customerSortBy,
    customerSortOrder,
    hasMembership,
    hasSubscription,
    subscriptions,
  ]);

  const handleSort = (column: CustomerSortBy) => {
    if (customerSortBy === column) {
      setCustomerSortOrder(customerSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setCustomerSortBy(column);
      setCustomerSortOrder('desc');
    }
  };

  const getSortIcon = (column: CustomerSortBy) => {
    if (customerSortBy !== column) return '↕';
    return customerSortOrder === 'asc' ? '↑' : '↓';
  };

  const today = getLocalDateString();
  const getLastVisitDisplay = (date: string) => {
    if (!date) return '-';
    if (date === today) return 'Today';

    const visitDate = new Date(date);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - visitDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) return 'Yesterday';
    if (diffDays <= 7) return `${diffDays} days ago`;

    return visitDate.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const sortBtnStyle = (column: CustomerSortBy) => ({
    alignItems: 'center' as const,
    background: 'transparent',
    border: 'none',
    color: customerSortBy === column ? theme.textPrimary : theme.textMuted,
    cursor: 'pointer',
    display: 'flex',
    fontSize: 12,
    fontWeight: 700 as const,
    gap: 6,
    letterSpacing: '0.5px',
    padding: 0,
    textAlign: 'left' as const,
    textTransform: 'uppercase' as const,
  });

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, boxShadow: '0 4px 16px rgba(102, 126, 234, 0.3)' }}>
              👥
            </div>
            <div>
              <h2 style={{ fontSize: 32, fontWeight: 800, color: theme.textPrimary, margin: 0, marginBottom: 4, letterSpacing: '-0.5px' }}>Customers</h2>
              <p style={{ fontSize: 15, color: theme.textMuted, margin: 0 }}>
                Manage your customer database • {customers.length} customers shown
              </p>
            </div>
          </div>
        </div>

        <div style={{ background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(168, 85, 247, 0.05) 100%)', borderRadius: 18, border: '1px solid rgba(99, 102, 241, 0.1)', padding: 24, boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)' }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 300, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', fontSize: 20 }}>🔍</span>
              <input
                type="text"
                placeholder="Search by name, phone, email..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                style={{ width: '100%', padding: '14px 18px 14px 52px', background: theme.cardBackground, border: `2px solid ${theme.border}`, borderRadius: 12, color: theme.textPrimary, fontSize: 15, outline: 'none', transition: 'all 0.2s' }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#6366f1';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = theme.border;
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none', padding: '10px 16px', borderRadius: 10, background: hasSubscription ? 'rgba(99, 102, 241, 0.15)' : theme.cardBackground, border: `2px solid ${hasSubscription ? '#6366f1' : theme.border}`, transition: 'all 0.2s' }}>
              <input type="checkbox" checked={hasSubscription} onChange={(e) => setHasSubscription(e.target.checked)} style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#6366f1' }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: hasSubscription ? '#6366f1' : theme.textSecondary }}>Has Active Subscription</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none', padding: '10px 16px', borderRadius: 10, background: hasMembership ? 'rgba(168, 85, 247, 0.15)' : theme.cardBackground, border: `2px solid ${hasMembership ? '#a855f7' : theme.border}`, transition: 'all 0.2s' }}>
              <input type="checkbox" checked={hasMembership} onChange={(e) => setHasMembership(e.target.checked)} style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#a855f7' }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: hasMembership ? '#a855f7' : theme.textSecondary }}>Has Membership</span>
            </label>
          </div>
        </div>
      </div>

      <div style={{ background: theme.cardBackground, borderRadius: 18, border: `1px solid ${theme.border}`, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '200px 120px 180px 120px 100px 130px 150px 60px', gap: 16, padding: '18px 28px', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(168, 85, 247, 0.08) 100%)', borderBottom: '2px solid rgba(99, 102, 241, 0.15)' }}>
          <button onClick={() => handleSort('name')} style={sortBtnStyle('name')}>CUSTOMER {getSortIcon('name')}</button>
          <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>PHONE</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>EMAIL</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>STATUS</div>
          <button onClick={() => handleSort('sessions')} style={sortBtnStyle('sessions')}>SESSIONS {getSortIcon('sessions')}</button>
          <button onClick={() => handleSort('totalSpent')} style={sortBtnStyle('totalSpent')}>TOTAL SPENT {getSortIcon('totalSpent')}</button>
          <button onClick={() => handleSort('lastVisit')} style={sortBtnStyle('lastVisit')}>LAST VISIT {getSortIcon('lastVisit')}</button>
          <div />
        </div>

        {customers.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>👥</div>
            <p style={{ fontSize: 16, color: theme.textSecondary, marginBottom: 8 }}>No customers found</p>
            <p style={{ fontSize: 14, color: theme.textMuted }}>
              {customerSearch || hasSubscription || hasMembership
                ? 'Try adjusting your filters'
                : 'Customers will appear here after bookings or memberships'}
            </p>
          </div>
        ) : (
          customers.map((customer, index) => {
            const statusBadge = getStatusBadge(customer);

            return (
              <div
                key={customer.id}
                style={{ display: 'grid', gridTemplateColumns: '200px 120px 180px 120px 100px 130px 150px 60px', gap: 16, padding: '20px 28px', borderBottom: index < customers.length - 1 ? '1px solid rgba(71, 85, 105, 0.15)' : 'none', transition: 'all 0.2s ease', cursor: 'pointer' }}
                onClick={() => handleViewCustomer(customer)}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(99, 102, 241, 0.04)';
                  e.currentTarget.style.transform = 'translateX(4px)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.transform = 'translateX(0)';
                }}
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
                  <span style={{ padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: statusBadge.background, color: statusBadge.color }}>
                    {statusBadge.label}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', fontSize: 15, fontWeight: 600, color: theme.textPrimary }}>{customer.sessions}</div>
                <div style={{ display: 'flex', alignItems: 'center', fontSize: 15, fontWeight: 600, color: theme.textPrimary }}>₹{customer.totalSpent}</div>
                <div style={{ display: 'flex', alignItems: 'center', fontSize: 14, color: theme.textSecondary }}>{getLastVisitDisplay(customer.lastVisit)}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      handleViewCustomer(customer);
                    }}
                    style={{ width: 40, height: 40, background: 'rgba(99, 102, 241, 0.1)', border: '2px solid rgba(99, 102, 241, 0.2)', borderRadius: 10, color: '#6366f1', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease', boxShadow: '0 2px 6px rgba(99, 102, 241, 0.15)' }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = 'rgba(99, 102, 241, 0.2)';
                      e.currentTarget.style.borderColor = '#6366f1';
                      e.currentTarget.style.transform = 'scale(1.1)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)';
                      e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.2)';
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                    title="View customer details"
                  >
                    👁️
                  </button>
                </div>
              </div>
            );
          })
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
