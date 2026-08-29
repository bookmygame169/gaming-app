import React, { useMemo, useState } from 'react';
import { getBookingRevenueTotal, isBillableRevenueBooking } from '@/lib/ownerRevenue';
import { phoneKey } from '@/lib/phone';
import { BookingRow } from '../../types';
import { getLocalDateString } from '../../utils';
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Kpis, WhatToFix, type Insight } from '../consoleUi';
import { buildWhatsAppUrl } from '../../utils';

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
    price?: number | string | null;
  } | null;
  purchase_date?: string | null;
  status?: string | null;
};

type Customer = {
  activeSubscription: CustomerSubscription | null;
  email: string | null;
  hasActiveSubscription: boolean;
  hasMembership: boolean;
  firstVisit: string;
  id: string;
  lastVisit: string;
  membershipSpendIncluded: boolean;
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
  const normalizedPhone = phoneKey(phone);
  if (normalizedPhone) return `phone:${normalizedPhone}`;
  if (userId) return `user:${userId}`;
  if (email) return `email:${email.toLowerCase()}`;
  if (name) return `name:${name.trim().toLowerCase()}`;
  return 'unknown';
}

function getSubscriptionAmount(subscription: CustomerSubscription) {
  if (typeof subscription.amount_paid === 'number') {
    return Number.isFinite(subscription.amount_paid) ? subscription.amount_paid : 0;
  }
  return parseFloat(String(subscription.amount_paid ?? '0')) || 0;
}

function isWalkInSource(source?: string | null): boolean {
  return source === 'walk-in' || source === 'walk_in';
}

function getActiveSubscription(subscription: CustomerSubscription | null) {
  if (!subscription || subscription.status !== 'active') return null;
  if (!subscription.expiry_date) return subscription;
  return new Date(subscription.expiry_date) > new Date() ? subscription : null;
}

/** The design's seven tracks for the customer table. */
const CUSTOMER_COLUMNS = 'minmax(140px,1.3fr) 112px 66px 96px 84px 90px 104px';

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
  new:     { label: 'New',     badge: 'NEW', chip: 'border-[#f2f0ea]/[0.14] text-[#f2f0ea]/50 hover:border-[#f2f0ea]/35 hover:text-[#f2f0ea]',     activeChip: 'border-[#d8ff3c] bg-[#d8ff3c]/[0.10] text-[#d8ff3c]' },
  regular: { label: 'Regular', badge: 'REG', chip: 'border-[#f2f0ea]/[0.14] text-[#f2f0ea]/50 hover:border-[#f2f0ea]/35 hover:text-[#f2f0ea]', activeChip: 'border-[#d8ff3c] bg-[#d8ff3c]/[0.10] text-[#d8ff3c]' },
  vip:     { label: 'VIP',     badge: 'VIP', chip: 'border-[#f2f0ea]/[0.14] text-[#f2f0ea]/50 hover:border-[#f2f0ea]/35 hover:text-[#f2f0ea]', activeChip: 'border-[#d8ff3c] bg-[#d8ff3c]/[0.10] text-[#d8ff3c]' },
  lapsed:  { label: 'Lapsed',  badge: 'OUT', chip: 'border-[#f2f0ea]/[0.14] text-[#f2f0ea]/50 hover:border-[#f2f0ea]/35 hover:text-[#f2f0ea]',      activeChip: 'border-[#ff5c2b] bg-[#ff5c2b]/[0.12] text-[#ff5c2b]' },
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
      className="flex h-7 w-7 shrink-0 items-center justify-center border border-[#d8ff3c]/[0.25] bg-[#d8ff3c]/[0.10] text-[#d8ff3c] transition-colors hover:bg-[#d8ff3c]/20"
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
      if (!isBillableRevenueBooking(booking)) return;
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
      const isMembershipBooking = booking.source === 'membership';

      if (customerMap.has(customerId)) {
        const existing = customerMap.get(customerId)!;
        if (!isMembershipBooking) existing.sessions += 1;
        existing.totalSpent += getBookingRevenueTotal(booking);
        if (isMembershipBooking) {
          existing.hasMembership = true;
          if (getBookingRevenueTotal(booking) > 0) existing.membershipSpendIncluded = true;
        }
        if (bookingDate && new Date(bookingDate) > new Date(existing.lastVisit || 0)) {
          existing.lastVisit = bookingDate;
        }
        // The design's "since" line — when this person first turned up.
        if (bookingDate && (!existing.firstVisit || new Date(bookingDate) < new Date(existing.firstVisit))) {
          existing.firstVisit = bookingDate;
        }
        if (!existing.phone && customerPhone) existing.phone = customerPhone;
        if (!existing.email && customerEmail) existing.email = customerEmail;
        if (existing.name === 'Unknown' && customerName !== 'Unknown') existing.name = customerName;
        if (isWalkInSource(booking.source)) existing.source = 'walk-in';
        if (booking.source === 'online' && existing.source === 'membership') existing.source = 'online';
      } else {
        customerMap.set(customerId, {
          activeSubscription: null,
          email: customerEmail,
          hasActiveSubscription: false,
          firstVisit: bookingDate,
          hasMembership: isMembershipBooking,
          id: customerId,
          lastVisit: bookingDate,
          membershipSpendIncluded: isMembershipBooking && getBookingRevenueTotal(booking) > 0,
          name: customerName,
          phone: customerPhone,
          sessions: isMembershipBooking ? 0 : 1,
          source: isMembershipBooking
            ? 'membership'
            : isWalkInSource(booking.source) ? 'walk-in' : 'online',
          totalSpent: getBookingRevenueTotal(booking),
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
      const membershipAmount = getSubscriptionAmount(subscription);

      if (customerMap.has(customerId)) {
        const existing = customerMap.get(customerId)!;
        existing.hasMembership = true;
        existing.hasActiveSubscription = existing.hasActiveSubscription || Boolean(activeSubscription);
        if (!existing.membershipSpendIncluded && membershipAmount > 0) {
          existing.totalSpent += membershipAmount;
          existing.membershipSpendIncluded = true;
        }
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
          firstVisit: purchaseDate,
          hasActiveSubscription: Boolean(activeSubscription),
          hasMembership: true,
          id: customerId,
          lastVisit: purchaseDate,
          membershipSpendIncluded: membershipAmount > 0,
          name: subscription.customer_name || 'Unknown',
          phone: subscription.customer_phone || null,
          sessions: 0,
          source: 'membership',
          totalSpent: membershipAmount,
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

  const totalPages = Math.max(1, Math.ceil(customers.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pagedCustomers = customers.slice((safeCurrentPage - 1) * PAGE_SIZE, safeCurrentPage * PAGE_SIZE);

  // ── the figures the design opens on, and the two lists under them ──
  const lifetimeTotal = allCustomers.reduce((sum, c) => sum + c.totalSpent, 0);
  const memberCount = allCustomers.filter((c) => c.hasMembership).length;
  const avgLifetime = allCustomers.length > 0 ? Math.round(lifetimeTotal / allCustomers.length) : 0;
  const biggestSpend = Math.max(1, ...allCustomers.map((c) => c.totalSpent));

  /** Regulars and VIPs who have not been in for a month — the ones worth a message. */
  const winBack = allCustomers
    .filter((c) => getSegment(c) === 'lapsed' && c.totalSpent > 0 && c.phone)
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, 4);

  /** What each segment is worth, which is not the same as how many are in it. */
  const segmentRevenue = (['vip', 'regular', 'new', 'lapsed'] as const).map((seg) => {
    const inSeg = allCustomers.filter((c) => getSegment(c) === seg);
    const revenue = inSeg.reduce((sum, c) => sum + c.totalSpent, 0);
    return {
      key: seg,
      label: SEGMENT_META[seg].label.toUpperCase(),
      people: inSeg.length,
      revenue,
      share: lifetimeTotal > 0 ? Math.round((revenue / lifetimeTotal) * 100) : 0,
    };
  }).sort((a, b) => b.revenue - a.revenue);

  /** What the segment split is saying, where it is worth saying. */
  const insights: Insight[] = (() => {
    const out: Insight[] = [];
    const vip = segmentRevenue.find((r) => r.key === 'vip');
    const lapsed = segmentRevenue.find((r) => r.key === 'lapsed');
    const fresh = segmentRevenue.find((r) => r.key === 'new');

    // A handful of people carrying a disproportionate share of the takings.
    if (vip && vip.people > 0 && vip.share >= 15) {
      out.push({
        id: 'vip-concentration',
        tone: 'lime',
        title: `${vip.people} ${vip.people === 1 ? 'customer is' : 'customers are'} ${vip.share}% of your revenue`,
        detail: `₹${vip.revenue.toLocaleString('en-IN')} between them. Losing one of these is worth roughly ${Math.round(vip.revenue / Math.max(1, vip.people) / Math.max(1, avgLifetime))} ordinary customers.`,
      });
    }

    // Money already earned, from people who have stopped coming.
    if (lapsed && lapsed.people > 0 && lapsed.revenue > 0) {
      out.push({
        id: 'lapsed-value',
        tone: 'orange',
        title: `${lapsed.people} lapsed ${lapsed.people === 1 ? 'customer holds' : 'customers hold'} ₹${lapsed.revenue.toLocaleString('en-IN')} of past spend`,
        detail: 'Nobody here has been in for a month. They already know the place and already paid once, which makes them cheaper to bring back than a stranger is to find.',
      });
    }

    // Lots of first-timers who never returned.
    if (fresh && fresh.people > 0 && allCustomers.length > 0) {
      const onceOnly = allCustomers.filter((c) => c.sessions <= 1).length;
      const pct = Math.round((onceOnly / allCustomers.length) * 100);
      if (pct >= 40) {
        out.push({
          id: 'one-visit',
          tone: 'orange',
          title: `${pct}% of customers have been in exactly once`,
          detail: `${onceOnly} of ${allCustomers.length}. A second visit is the one that decides whether somebody becomes a regular, and most are not making it.`,
        });
      }
    }

    return out;
  })();

  const exportCustomersCsv = () => {
    const header = ['Customer', 'Phone', 'Segment', 'Visits', 'Lifetime', 'Avg bill', 'Last seen', 'Member since'];
    const rows = customers.map((c) => [
      c.name,
      c.phone || '',
      SEGMENT_META[getSegment(c)].label,
      String(c.sessions),
      String(Math.round(c.totalSpent)),
      String(c.sessions > 0 ? Math.round(c.totalSpent / c.sessions) : 0),
      c.lastVisit || '',
      c.firstVisit || '',
    ]);
    const escape = (cell: string) => `"${String(cell).replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map((cols) => cols.map(escape).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `customers-${today}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleSort = (col: CustomerSortBy) => {
    setCurrentPage(1);
    if (customerSortBy === col) setCustomerSortOrder(customerSortOrder === 'asc' ? 'desc' : 'asc');
    else { setCustomerSortBy(col); setCustomerSortOrder('desc'); }
  };

  const SortIcon = ({ col }: { col: CustomerSortBy }) => {
    if (customerSortBy !== col) return <ArrowUpDown size={11} className="text-[#f2f0ea]/30" />;
    return customerSortOrder === 'asc' ? <ArrowUp size={11} className="text-[#d8ff3c]" /> : <ArrowDown size={11} className="text-[#d8ff3c]" />;
  };

  const today = getLocalDateString();
  const getLastVisitDisplay = (date: string) => {
    if (!date) return '-';
    if (date === today) return 'Today';
    const diffDays = Math.ceil((new Date(today).getTime() - new Date(date).getTime()) / 86400000);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays <= 7) return `${diffDays}d ago`;
    return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="flex flex-col gap-[18px]">
      {/* The design opens on four figures: how many people, how many of them
          come back, what they are worth, and what one visit is worth. */}
      <Kpis
        items={[
          { label: 'CUSTOMERS', value: String(allCustomers.length), sub: `${segmentCounts.new} new · ${segmentCounts.regular} regular` },
          {
            label: 'VIPS',
            value: String(segmentCounts.vip),
            tone: segmentCounts.vip > 0 ? 'lime' : 'ink',
            sub: `${memberCount} on a membership`,
          },
          {
            label: 'LAPSED',
            value: String(segmentCounts.lapsed),
            tone: segmentCounts.lapsed > 0 ? 'orange' : 'ink',
            sub: segmentCounts.lapsed > 0 ? 'not in for a month' : 'everyone still coming',
          },
          { label: 'AVG LIFETIME', value: `₹${avgLifetime.toLocaleString('en-IN')}`, sub: `₹${lifetimeTotal.toLocaleString('en-IN')} across everyone` },
        ]}
      />

      {/* The people worth a message today, with the message one tap away. */}
      {winBack.length > 0 && (
        <div className="flex flex-wrap items-center gap-[9px] border border-[#ff5c2b]/[0.28] bg-[#ff5c2b]/[0.06] px-[15px] py-[13px]">
          <span className="whitespace-nowrap font-mono text-[10px] tracking-[0.16em] text-[#ff5c2b]">
            WIN BACK · {segmentCounts.lapsed}
          </span>
          {winBack.map((c) => (
            <a
              key={c.id}
              href={buildWhatsAppUrl(c.phone || '', `Hi ${c.name}, we have not seen you at PlayTime in a while — your station is waiting.`)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 border border-[#f2f0ea]/[0.14] bg-[#111113] px-2.5 py-[7px] transition-colors hover:border-[#d8ff3c]"
            >
              <span className="whitespace-nowrap text-[12.5px] font-bold text-[#f2f0ea]">{c.name}</span>
              <span className="whitespace-nowrap font-mono text-[10px] text-[#f2f0ea]/45">
                {getLastVisitDisplay(c.lastVisit)}
              </span>
              <span className="font-mono text-[9.5px] tracking-[0.1em] text-[#d8ff3c]">WHATSAPP</span>
            </a>
          ))}
          <span className="min-w-[10px] flex-1" />
          <span className="whitespace-nowrap font-mono text-[10px] tracking-[0.14em] text-[#f2f0ea]/40">
            ₹{winBack.reduce((sum, c) => sum + c.totalSpent, 0).toLocaleString('en-IN')} AT RISK
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => { setCurrentPage(1); setSegment('all'); }}
          className={`border px-3 py-1 font-mono text-[10.5px] font-semibold tracking-[0.12em] transition-colors ${segment === 'all' ? 'border-[#d8ff3c] bg-[#d8ff3c]/[0.10] text-[#d8ff3c]' : 'border-[#f2f0ea]/[0.14] text-[#f2f0ea]/50 hover:border-[#f2f0ea]/35 hover:text-[#f2f0ea]'}`}
        >
          ALL <span className="ml-1 opacity-70">{segmentCounts.all}</span>
        </button>
        {(['new', 'regular', 'vip', 'lapsed'] as const).map(seg => (
          <button
            key={seg}
            onClick={() => { setCurrentPage(1); setSegment(seg); }}
            className={`border px-3 py-1 font-mono text-[10.5px] font-semibold tracking-[0.12em] transition-colors ${segment === seg ? SEGMENT_META[seg].activeChip : SEGMENT_META[seg].chip}`}
          >
            {SEGMENT_META[seg].label.toUpperCase()}
            {segmentCounts[seg] > 0 && (
              <span className="ml-1.5 opacity-70">{segmentCounts[seg]}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative w-full flex-1 sm:max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#f2f0ea]/35" />
          <input
            type="text"
            placeholder="Name, phone, or email..."
            value={customerSearch}
            onChange={(e) => { setCurrentPage(1); setCustomerSearch(e.target.value); }}
            className="h-[38px] w-full border border-[#f2f0ea]/[0.14] bg-transparent pl-9 pr-4 font-mono text-[12px] text-[#f2f0ea] outline-none placeholder:text-[#f2f0ea]/30 focus:border-[#d8ff3c]"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setCurrentPage(1); setHasSubscription(!hasSubscription); }}
            className={`h-[38px] border px-3 font-mono text-[10.5px] font-semibold tracking-[0.12em] transition-colors ${hasSubscription ? 'border-[#d8ff3c] bg-[#d8ff3c]/[0.10] text-[#d8ff3c]' : 'border-[#f2f0ea]/[0.14] text-[#f2f0ea]/50 hover:border-[#f2f0ea]/35 hover:text-[#f2f0ea]'}`}
          >
            ACTIVE PLAN
          </button>
          <button
            onClick={() => { setCurrentPage(1); setHasMembership(!hasMembership); }}
            className={`h-[38px] border px-3 font-mono text-[10.5px] font-semibold tracking-[0.12em] transition-colors ${hasMembership ? 'border-[#d8ff3c] bg-[#d8ff3c]/[0.10] text-[#d8ff3c]' : 'border-[#f2f0ea]/[0.14] text-[#f2f0ea]/50 hover:border-[#f2f0ea]/35 hover:text-[#f2f0ea]'}`}
          >
            MEMBERS
          </button>
        </div>
      </div>

      <div className="overflow-hidden border border-[#f2f0ea]/10 bg-[#111113]">
        <div
          className="hidden gap-[9px] border-b border-[#f2f0ea]/10 px-4 py-2.5 md:grid"
          style={{ gridTemplateColumns: CUSTOMER_COLUMNS }}
        >
          {[
            { col: 'name' as CustomerSortBy, label: 'CUSTOMER', align: '' },
            { col: null, label: 'SEGMENT', align: '' },
            { col: 'sessions' as CustomerSortBy, label: 'VISITS', align: 'justify-end' },
            { col: 'totalSpent' as CustomerSortBy, label: 'LIFETIME', align: 'justify-end' },
            { col: null, label: 'AVG BILL', align: 'justify-end' },
            { col: 'lastVisit' as CustomerSortBy, label: 'LAST SEEN', align: 'justify-end' },
            { col: null, label: 'ACTIONS', align: 'justify-end' },
          ].map(({ col, label, align }, i) => (
            <div key={i} className={`flex font-mono text-[9px] tracking-[0.14em] text-[#f2f0ea]/35 ${align}`}>
              {col ? (
                <button onClick={() => handleSort(col)} className="flex items-center gap-1 transition-colors hover:text-[#d8ff3c]">
                  {label} <SortIcon col={col} />
                </button>
              ) : label}
            </div>
          ))}
        </div>

        {customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16">
            <p className="text-sm font-medium text-[#f2f0ea]/70">No customers found</p>
            <p className="font-mono text-[11px] text-[#f2f0ea]/40">
              {customerSearch || hasSubscription || hasMembership || segment !== 'all'
                ? 'Try adjusting your filters'
                : 'Customers appear after bookings or memberships'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#f2f0ea]/10">
            {pagedCustomers.map((customer) => {
              const seg = getSegment(customer);
              const meta = SEGMENT_META[seg];
              const segTone = seg === 'lapsed'
                ? { background: 'rgba(255,92,43,.12)', color: '#ff5c2b' }
                : seg === 'vip'
                  ? { background: 'rgba(216,255,60,.12)', color: '#d8ff3c' }
                  : { background: 'rgba(242,240,234,.07)', color: 'rgba(242,240,234,.6)' };
              const avgBill = customer.sessions > 0 ? Math.round(customer.totalSpent / customer.sessions) : 0;
              const spendShare = Math.round((customer.totalSpent / biggestSpend) * 100);
              // From `today` rather than Date.now(): a clock read during render
              // is impure, and this only needs day resolution anyway.
              const daysSince = customer.lastVisit
                ? Math.floor((new Date(today).getTime() - new Date(customer.lastVisit).getTime()) / 86400000)
                : 999;

              return (
                <div
                  key={customer.id}
                  onClick={() => handleViewCustomer(customer)}
                  className="group flex cursor-pointer items-center gap-[9px] px-3 py-3 transition-colors hover:bg-[#17171a] md:grid md:px-4"
                  style={{
                    gridTemplateColumns: CUSTOMER_COLUMNS,
                    // The design edges a row by how the person is doing.
                    borderLeft: `2px solid ${seg === 'lapsed' ? '#ff5c2b' : seg === 'vip' ? '#d8ff3c' : 'transparent'}`,
                  }}
                >
                  {/* Customer: the one round thing in this console, as drawn. */}
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-black"
                      style={segTone}
                    >
                      {customer.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="flex min-w-0 flex-col gap-[3px]">
                      <div className="flex min-w-0 items-center gap-[7px]">
                        <span className="truncate text-[13.5px] font-bold text-[#f2f0ea]">{customer.name}</span>
                        {customer.hasMembership && (
                          <span className="shrink-0 bg-[#7dd3fc]/[0.12] px-1.5 py-0.5 font-mono text-[8.5px] tracking-[0.12em] text-[#7dd3fc]">
                            MEMBER
                          </span>
                        )}
                      </div>
                      <span className="truncate font-mono text-[10px] text-[#f2f0ea]/35">
                        {customer.phone || customer.email || '—'}
                        {customer.firstVisit && ` · since ${new Date(customer.firstVisit).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}`}
                      </span>
                    </div>
                  </div>

                  <span
                    className="hidden justify-self-start whitespace-nowrap px-2 py-1 font-mono text-[9.5px] tracking-[0.1em] md:inline-block"
                    style={segTone}
                  >
                    {meta.badge}
                  </span>

                  <span className="hidden text-right font-mono text-[11.5px] text-[#f2f0ea]/70 md:block">
                    {customer.sessions}
                  </span>

                  {/* Lifetime, with a bar against the biggest spender so the
                      column ranks as well as reports. */}
                  <div className="hidden min-w-0 flex-col gap-1 md:flex">
                    <span className="text-right text-[13px] font-extrabold text-[#f2f0ea]">
                      ₹{customer.totalSpent.toLocaleString('en-IN')}
                    </span>
                    <div className="h-1 bg-[#f2f0ea]/[0.08]">
                      <div
                        className="ml-auto h-1"
                        style={{ width: `${spendShare}%`, background: seg === 'lapsed' ? '#ff5c2b' : '#d8ff3c' }}
                      />
                    </div>
                  </div>

                  <span className="hidden text-right font-mono text-[11.5px] text-[#f2f0ea]/60 md:block">
                    ₹{avgBill.toLocaleString('en-IN')}
                  </span>

                  <span
                    className="hidden whitespace-nowrap text-right font-mono text-[11.5px] md:block"
                    style={{ color: daysSince > 30 ? '#ff5c2b' : daysSince > 14 ? '#ffa53c' : 'rgba(242,240,234,.6)' }}
                  >
                    {getLastVisitDisplay(customer.lastVisit)}
                  </span>

                  {/* Mobile keeps the figures the grid hides. */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 md:hidden">
                    <span className="px-2 py-1 font-mono text-[9.5px] tracking-[0.1em]" style={segTone}>
                      {meta.badge}
                    </span>
                    <span className="font-mono text-[11px] text-[#f2f0ea]/45">
                      {customer.sessions} visits · ₹{customer.totalSpent.toLocaleString('en-IN')} · {getLastVisitDisplay(customer.lastVisit)}
                    </span>
                  </div>

                  <div className="ml-auto flex items-center justify-end gap-[5px] md:ml-0" onClick={e => e.stopPropagation()}>
                    {customer.phone && <WhatsAppBtn phone={customer.phone} name={customer.name} />}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleViewCustomer(customer); }}
                      className="flex h-[26px] w-[26px] items-center justify-center border border-[#f2f0ea]/[0.14] font-mono text-[11px] text-[#f2f0ea]/55 transition-colors hover:border-[#f2f0ea] hover:text-[#f2f0ea]"
                      title="Open profile"
                    >
                      →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* The design's footer strip. */}
        <div className="flex items-center gap-3.5 border-t border-[#f2f0ea]/10 px-4 py-3 font-mono text-[10.5px] text-[#f2f0ea]/40">
          <span className="truncate">
            {customers.length} of {allCustomers.length} customers · ₹{lifetimeTotal.toLocaleString('en-IN')} lifetime
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={exportCustomersCsv}
            className="whitespace-nowrap tracking-[0.14em] transition-colors hover:text-[#d8ff3c]"
          >
            EXPORT CSV →
          </button>
        </div>
      </div>

      {/* Which segment the money actually comes from — not the same question
          as how many people are in it. */}
      <section>
        <div className="mb-3 flex items-center gap-3">
          <span className="whitespace-nowrap font-mono text-[10px] tracking-[0.2em] text-[#f2f0ea]/50">
            SEGMENTS · REVENUE SHARE
          </span>
          <span className="h-px flex-1 bg-[#f2f0ea]/10" />
          <span className="whitespace-nowrap font-mono text-[10px] text-[#f2f0ea]/40">
            ₹{lifetimeTotal.toLocaleString('en-IN')} all time
          </span>
        </div>
        <div className="flex flex-col gap-px border border-[#f2f0ea]/10 bg-[#f2f0ea]/10">
          {segmentRevenue.map((row) => {
            const tone = row.key === 'lapsed' ? '#ff5c2b' : row.key === 'vip' ? '#d8ff3c' : 'rgba(242,240,234,.55)';
            return (
              <div
                key={row.key}
                className="grid items-center gap-3 bg-[#111113] px-4 py-3"
                style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,100px) 96px' }}
              >
                <div className="flex min-w-0 flex-col gap-[3px]">
                  <span className="truncate font-mono text-[11px] tracking-[0.08em]" style={{ color: tone }}>
                    {row.label}
                  </span>
                  <span className="truncate font-mono text-[10px] text-[#f2f0ea]/35">
                    {row.people} {row.people === 1 ? 'person' : 'people'} · {row.share}% of revenue
                  </span>
                </div>
                <div className="h-1.5 bg-[#f2f0ea]/[0.08]">
                  <div className="h-1.5" style={{ width: `${row.share}%`, background: tone }} />
                </div>
                <span className="whitespace-nowrap text-right font-mono text-[11.5px]" style={{ color: tone }}>
                  ₹{row.revenue.toLocaleString('en-IN')}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <WhatToFix items={insights} />

      {customers.length > PAGE_SIZE && (
        <div className="flex items-center justify-between px-1">
          <span className="font-mono text-xs text-[#f2f0ea]/45">
            {(safeCurrentPage - 1) * PAGE_SIZE + 1}–{Math.min(safeCurrentPage * PAGE_SIZE, customers.length)} of {customers.length}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, Math.min(p, totalPages) - 1))}
              disabled={safeCurrentPage === 1}
              className="border border-[#f2f0ea]/[0.14] px-3 py-1.5 font-mono text-[10.5px] font-semibold text-[#f2f0ea]/55 transition-colors hover:text-[#f2f0ea] disabled:cursor-not-allowed disabled:opacity-40"
            >← PREV</button>
            <span className="px-3 py-1.5 font-mono text-xs text-[#f2f0ea]/45">{safeCurrentPage}/{totalPages}</span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, Math.min(p, totalPages) + 1))}
              disabled={safeCurrentPage === totalPages}
              className="border border-[#f2f0ea]/[0.14] px-3 py-1.5 font-mono text-[10.5px] font-semibold text-[#f2f0ea]/55 transition-colors hover:text-[#f2f0ea] disabled:cursor-not-allowed disabled:opacity-40"
            >NEXT →</button>
          </div>
        </div>
      )}
    </div>
  );
}
