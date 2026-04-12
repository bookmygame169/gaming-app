import React, { useMemo, useState, useEffect } from 'react';
import { BookingRow } from '../../types';
import { getLocalDateString } from '../../utils';
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

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

type Segment = 'all' | 'new' | 'regular' | 'vip' | 'lapsed';

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
  if (!subscription || subscription.status !== 'active') return null;
  if (!subscription.expiry_date) return subscription;
  return new Date(subscription.expiry_date) > new Date() ? subscription : null;
}

function getSegment(customer: Customer): 'new' | 'regular' | 'vip' | 'lapsed' {
  const daysSinceVisit = customer.lastVisit
    ? Math.floor((Date.now() - new Date(customer.lastVisit).getTime()) / 86400000)
    : 999;
  if (daysSinceVisit > 30 && customer.sessions > 0) return 'lapsed';
  if (customer.sessions >= 10 || customer.totalSpent >= 3000) return 'vip';
  if (customer.sessions >= 3) return 'regular';
  return 'new';
}

const SEGMENT_META: Record<string, { label: string; badge: string; chip: string; activeChip: string }> = {
  new:     { label: 'New',     badge: '🆕', chip: 'border-sky-500/20 text-sky-400/70 hover:bg-sky-500/10',     activeChip: 'bg-sky-600/20 text-sky-300 border-sky-500/40' },
  regular: { label: 'Regular', badge: '⭐', chip: 'border-amber-500/20 text-amber-400/70 hover:bg-amber-500/10', activeChip: 'bg-amber-600/20 text-amber-300 border-amber-500/40' },
  vip:     { label: 'VIP',     badge: '👑', chip: 'border-violet-500/20 text-violet-400/70 hover:bg-violet-500/10', activeChip: 'bg-violet-600/20 text-violet-300 border-violet-500/40' },
  lapsed:  { label: 'Lapsed',  badge: '💤', chip: 'border-red-500/20 text-red-400/70 hover:bg-red-500/10',      activeChip: 'bg-red-600/20 text-red-300 border-red-500/40' },
};

function WhatsAppBtn({ phone, name }: { phone: string; name: string }) {
  const msg = encodeURIComponent(`Hi ${name}! Hope you enjoyed your gaming session. Come back soon! 🎮`);
  const url = `https://wa.me/91${phone.replace(/\D/g, '')}?text=${msg}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      title="WhatsApp"
      className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors shrink-0"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
    </a>
  );
}

const PAGE_SIZE = 20;

export default function CustomersTab({
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
  const [currentPage, setCurrentPage] = useState(1);
  const [segment, setSegment] = useState<Segment>('all');

  const allCustomers = useMemo(() => {
    const customerMap = new Map<string, Customer>();

    bookings.forEach((booking) => {
      if (booking.source === 'membership') return;
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
        if ((!existing.lastVisit || (purchaseDate && new Date(purchaseDate) > new Date(existing.lastVisit))) && purchaseDate) {
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

    return Array.from(customerMap.values());
  }, [bookings, subscriptions]);

  // Segment counts
  const segmentCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allCustomers.length, new: 0, regular: 0, vip: 0, lapsed: 0 };
    allCustomers.forEach(c => { counts[getSegment(c)]++; });
    return counts;
  }, [allCustomers]);

  const customers = useMemo(() => {
    let filtered = allCustomers;

    if (customerSearch) {
      const search = customerSearch.toLowerCase();
      filtered = filtered.filter(c =>
        c.name.toLowerCase().includes(search) ||
        (c.phone && c.phone.includes(search)) ||
        (c.email && c.email.toLowerCase().includes(search))
      );
    }
    if (hasSubscription) filtered = filtered.filter(c => c.hasActiveSubscription);
    if (hasMembership) filtered = filtered.filter(c => c.hasMembership);
    if (segment !== 'all') filtered = filtered.filter(c => getSegment(c) === segment);

    filtered.sort((a, b) => {
      let cmp = 0;
      if (customerSortBy === 'name') cmp = a.name.localeCompare(b.name);
      else if (customerSortBy === 'sessions') cmp = a.sessions - b.sessions;
      else if (customerSortBy === 'totalSpent') cmp = a.totalSpent - b.totalSpent;
      else if (customerSortBy === 'lastVisit') cmp = new Date(a.lastVisit || 0).getTime() - new Date(b.lastVisit || 0).getTime();
      return customerSortOrder === 'asc' ? cmp : -cmp;
    });

    return filtered;
  }, [allCustomers, customerSearch, hasSubscription, hasMembership, segment, customerSortBy, customerSortOrder]);

  useEffect(() => { setCurrentPage(1); }, [customerSearch, hasSubscription, hasMembership, segment, customerSortBy, customerSortOrder]);

  const totalPages = Math.max(1, Math.ceil(customers.length / PAGE_SIZE));
  const pagedCustomers = customers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleSort = (col: CustomerSortBy) => {
    if (customerSortBy === col) setCustomerSortOrder(customerSortOrder === 'asc' ? 'desc' : 'asc');
    else { setCustomerSortBy(col); setCustomerSortOrder('desc'); }
  };

  const SortIcon = ({ col }: { col: CustomerSortBy }) => {
    if (customerSortBy !== col) return <ArrowUpDown size={11} className="text-slate-600" />;
    return customerSortOrder === 'asc' ? <ArrowUp size={11} className="text-blue-400" /> : <ArrowDown size={11} className="text-blue-400" />;
  };

  const today = getLocalDateString();
  const getLastVisitDisplay = (date: string) => {
    if (!date) return '-';
    if (date === today) return 'Today';
    const diffDays = Math.ceil((Date.now() - new Date(date).getTime()) / 86400000);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays <= 7) return `${diffDays}d ago`;
    return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="space-y-4">
      {/* Segment chips */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setSegment('all')}
          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors border ${segment === 'all' ? 'bg-white/[0.1] text-white border-white/20' : 'bg-white/[0.04] text-slate-400 border-white/[0.08] hover:text-white'}`}
        >
          All <span className="ml-1 text-slate-500">{segmentCounts.all}</span>
        </button>
        {(['new', 'regular', 'vip', 'lapsed'] as const).map(seg => (
          <button
            key={seg}
            onClick={() => setSegment(seg)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors border ${segment === seg ? SEGMENT_META[seg].activeChip : SEGMENT_META[seg].chip}`}
          >
            {SEGMENT_META[seg].badge} {SEGMENT_META[seg].label}
            {segmentCounts[seg] > 0 && (
              <span className="ml-1.5 opacity-70">{segmentCounts[seg]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Search + filters */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Name, phone, or email..."
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white/[0.04] border border-white/[0.09] rounded-lg text-white placeholder-slate-600 text-sm focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30"
          />
        </div>
        <button
          onClick={() => setHasSubscription(!hasSubscription)}
          className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${hasSubscription ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40' : 'bg-white/[0.04] text-slate-400 border-white/[0.08] hover:text-white'}`}
        >
          Active Plan
        </button>
        <button
          onClick={() => setHasMembership(!hasMembership)}
          className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${hasMembership ? 'bg-violet-600/20 text-violet-300 border-violet-500/40' : 'bg-white/[0.04] text-slate-400 border-white/[0.08] hover:text-white'}`}
        >
          Members
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] overflow-hidden">
        {/* Desktop header */}
        <div className="hidden md:grid grid-cols-[minmax(180px,1fr)_120px_80px_100px_90px_100px_80px] gap-3 px-4 py-3 bg-white/[0.03] border-b border-white/[0.06]">
          {[
            { col: 'name' as CustomerSortBy, label: 'Customer' },
            { col: null, label: 'Phone' },
            { col: 'sessions' as CustomerSortBy, label: 'Sessions' },
            { col: 'totalSpent' as CustomerSortBy, label: 'Spent' },
            { col: null, label: 'Tier' },
            { col: 'lastVisit' as CustomerSortBy, label: 'Last Visit' },
            { col: null, label: '' },
          ].map(({ col, label }, i) => (
            <div key={i} className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
              {col ? (
                <button onClick={() => handleSort(col)} className="flex items-center gap-1 hover:text-slate-300 transition-colors">
                  {label} <SortIcon col={col} />
                </button>
              ) : label}
            </div>
          ))}
        </div>

        {customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <span className="text-4xl opacity-20">👥</span>
            <p className="text-sm text-slate-400 font-medium">No customers found</p>
            <p className="text-xs text-slate-600">
              {customerSearch || hasSubscription || hasMembership || segment !== 'all'
                ? 'Try adjusting your filters'
                : 'Customers appear after bookings or memberships'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {pagedCustomers.map((customer) => {
              const seg = getSegment(customer);
              const meta = SEGMENT_META[seg];
              return (
                <div
                  key={customer.id}
                  onClick={() => handleViewCustomer(customer)}
                  className="group flex md:grid md:grid-cols-[minmax(180px,1fr)_120px_80px_100px_90px_100px_80px] gap-3 items-center px-4 py-3 hover:bg-white/[0.04] cursor-pointer transition-colors"
                >
                  {/* Customer name + avatar */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500/30 to-purple-500/30 flex items-center justify-center text-sm font-bold text-white shrink-0">
                      {customer.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate group-hover:text-blue-300 transition-colors">{customer.name}</p>
                      <p className="text-[11px] text-slate-500 truncate md:hidden">{customer.phone || customer.email || '-'}</p>
                    </div>
                  </div>
                  {/* Phone — desktop only */}
                  <p className="hidden md:block text-sm text-slate-400 truncate">{customer.phone || '-'}</p>
                  {/* Sessions */}
                  <p className="hidden md:block text-sm font-semibold text-white">{customer.sessions}</p>
                  {/* Spent */}
                  <p className="hidden md:block text-sm font-semibold text-emerald-400">₹{customer.totalSpent.toLocaleString('en-IN')}</p>
                  {/* Tier badge */}
                  <div className="hidden md:flex items-center">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${seg === 'new' ? 'bg-sky-500/10 border-sky-500/20 text-sky-400' : seg === 'regular' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : seg === 'vip' ? 'bg-violet-500/10 border-violet-500/20 text-violet-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                      {meta.badge} {meta.label}
                    </span>
                  </div>
                  {/* Last visit */}
                  <p className="hidden md:block text-xs text-slate-500">{getLastVisitDisplay(customer.lastVisit)}</p>
                  {/* Actions */}
                  <div className="ml-auto md:ml-0 flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                    {customer.phone && <WhatsAppBtn phone={customer.phone} name={customer.name} />}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleViewCustomer(customer); }}
                      className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 transition-colors"
                      title="View details"
                    >
                      <span className="text-sm">›</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {customers.length > PAGE_SIZE && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-slate-500">
            {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, customers.length)} of {customers.length}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/[0.08] bg-white/[0.04] text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >← Prev</button>
            <span className="px-3 py-1.5 text-xs text-slate-400">{currentPage}/{totalPages}</span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/[0.08] bg-white/[0.04] text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
