'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  X, Save, Trash2, Clock, Calendar, User, Phone, CreditCard,
  Plus, Minus, ChevronDown, Loader2, UtensilsCrossed, Zap, AlertCircle,
} from 'lucide-react';
import { CONSOLE_DB_KEYS, CONSOLE_LABELS, CONSOLE_ICONS, type ConsoleId } from '@/lib/constants';
import { getEndTime } from '@/lib/timeUtils';
import { BookingRow, CafeRow } from '../types';
import { BookingOrder } from '@/types/inventory';
import { formatDurationLabel, getAvailableConsoleIds, normaliseConsoleType } from '../utils';
import InlineSnackManager from './InlineSnackManager';

type EditItem = { id?: string; console: string; quantity: number; duration: number; price?: number };
type MembershipSubscriptionSummary = {
  id?: string;
  amount_paid?: number | null;
  assigned_console_station?: string | null;
  expiry_date?: string | null;
  hours_purchased?: number | null;
  hours_remaining?: number | null;
  membership_plans?: {
    console_type?: string | null;
    hours?: number | null;
    name?: string | null;
    plan_type?: string | null;
    validity_days?: number | null;
  } | null;
  payment_mode?: string | null;
  purchase_date?: string | null;
  status?: string | null;
  timer_active?: boolean | null;
};

interface Props {
  booking: BookingRow;
  bookingItemId: string | null;
  // Form state
  customerName: string; setCustomerName: (v: string) => void;
  customerPhone: string; setCustomerPhone: (v: string) => void;
  date: string; setDate: (v: string) => void;
  startTime: string; setStartTime: (v: string) => void;
  duration: number;
  items: EditItem[]; setItems: React.Dispatch<React.SetStateAction<EditItem[]>>;
  updateItem: (index: number, updates: Partial<EditItem>) => void;
  amount: string; setAmount: (v: string) => void;
  setAmountManuallyEdited: (v: boolean) => void;
  status: string;
  paymentMethod: string; setPaymentMethod: (v: string) => void;
  // Actions
  saving: boolean; deleting: boolean;
  onSave: () => void; onClose: () => void;
  onDelete: () => void; onEndNow: () => number | void;
  onManageSnacks: () => void;
  // Data
  cafe: CafeRow | null;
  getBillingPrice: (c: ConsoleId, qty: number, dur: number) => number;
  membershipSubscription?: MembershipSubscriptionSummary | null;
}

const CONSOLE_OPTIONS: { id: ConsoleId; label: string; icon: string }[] = [
  { id: 'ps5', label: 'PS5', icon: '🎮' },
  { id: 'ps4', label: 'PS4', icon: '🎮' },
  { id: 'xbox', label: 'Xbox', icon: '🎮' },
  { id: 'pc', label: 'PC', icon: '💻' },
  { id: 'pool', label: 'Pool Table', icon: '🎱' },
  { id: 'snooker', label: 'Snooker', icon: '🎱' },
  { id: 'arcade', label: 'Arcade', icon: '🕹️' },
  { id: 'vr', label: 'VR', icon: '🥽' },
  { id: 'steering', label: 'Steering Wheel', icon: '🏎️' },
  { id: 'racing_sim', label: 'Racing Sim', icon: '🏁' },
];

const STATION_CONSOLES = new Set(['pc', 'pool', 'snooker', 'arcade', 'vr', 'steering', 'racing_sim']);

const DURATIONS = [30, 60, 90, 120, 150, 180, 240, 300];

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', color: 'text-[#ff5c2b] bg-[#ff5c2b]/10 border-[#ff5c2b]/30' },
  { value: 'confirmed', label: 'Confirmed', color: 'text-[#d8ff3c] bg-[#d8ff3c]/10 border-[#d8ff3c]/30' },
  { value: 'in-progress', label: 'In Progress', color: 'text-[#d8ff3c] bg-[#d8ff3c]/10 border-[#d8ff3c]/30' },
  { value: 'completed', label: 'Completed', color: 'text-[#d8ff3c] bg-[#d8ff3c]/10 border-[#d8ff3c]/30' },
  { value: 'cancelled', label: 'Cancelled', color: 'text-[#ff5c2b] bg-[#ff5c2b]/10 border-[#ff5c2b]/30' },
];

const PAYMENT_OPTIONS = [
  { value: 'cash', label: 'Cash', icon: '💵', active: 'border-[#d8ff3c] bg-[#d8ff3c]/10 text-[#d8ff3c]', inactive: 'border-[#f2f0ea]/[0.14] bg-[#f2f0ea]/10 text-[#f2f0ea]/50' },
  { value: 'upi', label: 'UPI', icon: '📱', active: 'border-[#d8ff3c] bg-[#d8ff3c]/10 text-[#d8ff3c]', inactive: 'border-[#f2f0ea]/[0.14] bg-[#f2f0ea]/10 text-[#f2f0ea]/50' },
];

const DAY_PASS_END_LABEL = '10:00 PM';

function calcEndTime(startTime24: string, items: EditItem[], fallbackDuration: number): string {
  if (!startTime24) return '—';
  const [h, m] = startTime24.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  const start12 = `${h12}:${m.toString().padStart(2, '0')} ${period}`;
  const maxDur = items.length > 0
    ? items.reduce((mx, it) => Math.max(mx, it.duration || 60), 0)
    : fallbackDuration;
  return getEndTime(start12, maxDur).replace(/\s*(am|pm)$/i, m => ` ${m.trim().toUpperCase()}`);
}

function formatDateTimeLabel(value?: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';

  return parsed.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function getTitleDuration(title?: string | null): number | null {
  const parsed = parseInt(title?.split('|')[0] || '', 10);
  return Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
}

function getTitleStations(title?: string | null): string {
  return title?.split('|')[1]?.trim().toUpperCase() || '';
}

export function EditBookingModal({
  booking, bookingItemId,
  customerName, setCustomerName, customerPhone, setCustomerPhone,
  date, setDate, startTime, setStartTime, duration,
  items, setItems, updateItem,
  amount, setAmount, setAmountManuallyEdited,
  status, paymentMethod, setPaymentMethod,
  saving, deleting,
  onSave, onClose, onDelete, onEndNow, 
  cafe, getBillingPrice, membershipSubscription,
}: Props) {
  // Customer autocomplete
  const [suggestions, setSuggestions] = useState<{ name: string; phone: string | null }[]>([]);
  const [showSugg, setShowSugg] = useState(false);
  const [searching, setSearching] = useState(false);
  const suggRef = useRef<HTMLDivElement>(null);
  const [endNowMsg, setEndNowMsg] = useState<string | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  const configuredConsoleOptions = useMemo(() => {
    const configuredConsoleIds = new Set<ConsoleId>(getAvailableConsoleIds(cafe));
    return CONSOLE_OPTIONS.filter((option) => configuredConsoleIds.has(option.id));
  }, [cafe]);

  const selectableConsoleOptions = useMemo(() => {
    const allowedConsoleIds = new Set<ConsoleId>(configuredConsoleOptions.map((option) => option.id));

    items.forEach((item) => {
      const normalizedConsole = normaliseConsoleType(item.console);
      if (normalizedConsole in CONSOLE_DB_KEYS) {
        allowedConsoleIds.add(normalizedConsole as ConsoleId);
      }
    });

    return CONSOLE_OPTIONS.filter((option) => allowedConsoleIds.has(option.id));
  }, [configuredConsoleOptions, items]);

  const searchCustomers = useCallback(async (query: string) => {
    if (query.trim().length < 2) { setSuggestions([]); setShowSugg(false); return; }

    // Cancel any previous in-flight request
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setSearching(true);
    try {
      const params = new URLSearchParams({
        cafeId: booking.cafe_id || '',
        q: query,
      });
      const res = await fetch(`/api/owner/customers/search?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      });
      const data = await res.json();
      if (controller.signal.aborted) return;

      if (!res.ok) {
        throw new Error(data.error || 'Failed to search customers');
      }

      const results = data.customers || [];
      setSuggestions(results);
      setShowSugg(results.length > 0);
    } catch {
      // Autocomplete is best-effort — silently suppress abort and network errors
      setSuggestions([]);
      setShowSugg(false);
    } finally {
      setSearching(false);
    }
  }, [booking.cafe_id]);

  useEffect(() => {
    const t = setTimeout(() => searchCustomers(customerName), 300);
    return () => clearTimeout(t);
  }, [customerName, searchCustomers]);

  // Abort any pending search on unmount
  useEffect(() => {
    return () => { searchAbortRef.current?.abort(); };
  }, []);

  // Close modal on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggRef.current && !suggRef.current.contains(e.target as Node)) setShowSugg(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const addItem = () => {
    if (isSingleItemEdit) return;
    const defaultConsole = configuredConsoleOptions[0]?.id;
    if (!defaultConsole) return;

    setAmountManuallyEdited(false);
    setItems(prev => [...prev, { console: defaultConsole, quantity: 1, duration: duration || 60 }]);
  };

  const removeItem = (index: number) => {
    if (isSingleItemEdit) return;
    setAmountManuallyEdited(false);
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const [localOrders, setLocalOrders] = useState<BookingOrder[]>((booking.booking_orders as unknown as BookingOrder[]) || []);
  useEffect(() => { setLocalOrders((booking.booking_orders as unknown as BookingOrder[]) || []); }, [booking.booking_orders]);

  function handleOrdersUpdated({ orders }: { amountDelta: number; bookingId: string; orders: BookingOrder[]; updatedAt: string | null }) {
    setLocalOrders(orders);
  }

  const isAppBooking = !!booking.user_id;
  const isMembershipBooking = booking.source === 'membership';
  const membershipPlan = membershipSubscription?.membership_plans;
  const isDayPassMembership = membershipPlan?.plan_type === 'day_pass';
  const isSingleItemEdit = Boolean(bookingItemId);
  const endTime = calcEndTime(startTime, items, duration);
  const snacksTotal = localOrders.reduce((s, o) => s + (o.total_price || 0), 0);
  const bookingItemsCount = booking.booking_items?.length || 0;
  const primaryBookingItem = booking.booking_items?.[0];
  const membershipConsole = membershipPlan?.console_type || primaryBookingItem?.console || items[0]?.console || '—';
  const membershipStation = membershipSubscription?.assigned_console_station?.toUpperCase() || getTitleStations(primaryBookingItem?.title) || 'Auto assigned';
  const membershipDuration = getTitleDuration(primaryBookingItem?.title)
    || (membershipPlan?.hours ? Number(membershipPlan.hours) * 60 : 0)
    || duration
    || 60;
  const membershipValidityLabel = isDayPassMembership
    ? `${DAY_PASS_END_LABEL} today`
    : membershipSubscription?.expiry_date
      ? formatDateTimeLabel(membershipSubscription.expiry_date)
      : formatDurationLabel(membershipDuration, { long: true });

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-[#0b0b0c]/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <style>{`
        input[type=number]::-webkit-outer-spin-button,
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>

      <div
        className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-[#111113] border border-[#f2f0ea]/[0.14] shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-[#0f1520] border-b border-[#f2f0ea]/10">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-[#d8ff3c]/15 flex items-center justify-center">
                <span className="text-lg">{isMembershipBooking ? '🎟️' : '📝'}</span>
              </div>
              <div>
                <h2 className="text-base font-bold text-[#f2f0ea]">
                  {isMembershipBooking ? 'Edit Membership Entry' : isAppBooking ? 'Edit App Booking' : 'Edit Walk-In Booking'}
                </h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] text-[#f2f0ea]/40 font-mono">#{booking.id.slice(0, 8).toUpperCase()}</span>
                  {isMembershipBooking ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#d8ff3c]/15 text-[#d8ff3c] font-semibold">MEMBERSHIP</span>
                  ) : isAppBooking && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#d8ff3c]/15 text-[#d8ff3c] font-semibold">APP</span>
                  )}
                  {booking.status && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold border ${STATUS_OPTIONS.find(s => s.value === booking.status)?.color || 'text-[#f2f0ea]/50 bg-[#f2f0ea]/10 border-[#f2f0ea]/30'}`}>
                      {booking.status.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-[#f2f0ea]/10 hover:bg-[#f2f0ea]/[0.14] flex items-center justify-center text-[#f2f0ea]/50 hover:text-[#f2f0ea] transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-5 p-6">

          {/* Customer Information */}
          <section className="bg-[#111827] border border-[#f2f0ea]/[0.14] overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#f2f0ea]/10 bg-[#151d2a]">
              <div className="w-7 h-7 bg-[#d8ff3c]/15 flex items-center justify-center">
                <User size={13} className="text-[#d8ff3c]" />
              </div>
              <span className="text-xs font-bold text-[#f2f0ea]/50 uppercase tracking-wider">{isMembershipBooking ? 'Member Information' : 'Customer Information'}</span>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Name with autocomplete */}
              <div className="relative" ref={suggRef}>
                <label className="block text-[11px] font-semibold text-[#f2f0ea]/40 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  Name
                  {searching && <span className="inline-block w-3 h-3 border border-[#f2f0ea]/40 border-t-transparent rounded-full animate-spin" />}
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={e => { setCustomerName(e.target.value); }}
                  placeholder="Customer name"
                  maxLength={100}
                  className="w-full px-3 py-2.5 bg-transparent border border-[#f2f0ea]/[0.14] text-[#f2f0ea] text-sm placeholder-[#f2f0ea]/30 focus:outline-none focus:border-[#d8ff3c]/60 transition-colors"
                />
                {showSugg && suggestions.length > 0 && (
                  <div className="absolute z-50 w-full top-full mt-1 bg-[#111827] border border-[#f2f0ea]/[0.14] shadow-xl overflow-hidden">
                    {suggestions.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#f2f0ea]/10 transition-colors text-left"
                        onMouseDown={() => {
                          setCustomerName(s.name);
                          if (s.phone) setCustomerPhone(s.phone);
                          setShowSugg(false);
                        }}
                      >
                        <div className="w-7 h-7 rounded-full bg-[#d8ff3c]/15 flex items-center justify-center text-xs text-[#d8ff3c] shrink-0">
                          {s.name[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[#f2f0ea]">{s.name}</p>
                          {s.phone && <p className="text-xs text-[#f2f0ea]/40">{s.phone}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Phone */}
              <div>
                <label className="block text-[11px] font-semibold text-[#f2f0ea]/40 uppercase tracking-wide mb-1.5">Phone</label>
                <div className="relative">
                  <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#f2f0ea]/40" />
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value.replace(/[^\d+\-\s()]/g, ''))}
                    placeholder="e.g. 9876543210"
                    maxLength={15}
                    className={`w-full pl-8 pr-3 py-2.5  bg-transparent border text-[#f2f0ea] text-sm placeholder-[#f2f0ea]/30 focus:outline-none focus:border-[#d8ff3c]/60 transition-colors ${customerPhone && !/^(\+91|0)?[6-9]\d{9}$|^\+\d{7,15}$/.test(customerPhone) ? 'border-[#ff5c2b]/60' : 'border-[#f2f0ea]/[0.14]'}`}
                  />
                </div>
              </div>

              {booking.user_email && (
                <div className="col-span-2 flex items-center gap-2 text-xs text-[#f2f0ea]/40 pt-1">
                  <AlertCircle size={11} />
                  {booking.user_email}
                </div>
              )}
            </div>
          </section>

          {isMembershipBooking ? (
            <section className="bg-[#111827] border border-[#d8ff3c]/25 overflow-hidden">
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#d8ff3c]/20 bg-[#151d2a]">
                <div className="w-7 h-7 bg-[#d8ff3c]/15 flex items-center justify-center">
                  <Calendar size={13} className="text-[#d8ff3c]" />
                </div>
                <span className="text-xs font-bold text-[#f2f0ea]/50 uppercase tracking-wider">Membership Details</span>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="border border-[#f2f0ea]/[0.14] bg-transparent px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[#f2f0ea]/40">Plan</div>
                  <div className="mt-1 text-sm font-semibold text-[#f2f0ea]">{membershipPlan?.name || 'Membership Plan'}</div>
                  <div className="mt-0.5 text-xs text-[#f2f0ea]/40">
                    {isDayPassMembership ? 'Day pass' : `${formatDurationLabel(membershipDuration, { long: true })} package`}
                  </div>
                </div>

                <div className="border border-[#f2f0ea]/[0.14] bg-transparent px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[#f2f0ea]/40">Console / Station</div>
                  <div className="mt-1 text-sm font-semibold text-[#f2f0ea] uppercase">{membershipConsole}</div>
                  <div className="mt-0.5 text-xs text-[#f2f0ea]/40">{membershipStation}</div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#f2f0ea]/40 uppercase tracking-wide mb-1.5">Sale Date *</label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full px-3 py-2.5 bg-transparent border border-[#f2f0ea]/[0.14] text-[#f2f0ea] text-sm focus:outline-none focus:border-[#d8ff3c]/60 transition-colors"
                    style={{ colorScheme: 'dark' }}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#f2f0ea]/40 uppercase tracking-wide mb-1.5">Sale Time *</label>
                  <div className="relative">
                    <Clock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#f2f0ea]/40 pointer-events-none" />
                    <input
                      type="time"
                      value={startTime}
                      onChange={e => setStartTime(e.target.value)}
                      className="w-full pl-8 pr-3 py-2.5 bg-transparent border border-[#f2f0ea]/[0.14] text-[#f2f0ea] text-sm focus:outline-none focus:border-[#d8ff3c]/60 transition-colors"
                      style={{ colorScheme: 'dark' }}
                    />
                  </div>
                </div>

                <div className="border border-[#f2f0ea]/[0.14] bg-transparent px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[#f2f0ea]/40">{isDayPassMembership ? 'Valid Until' : 'Expires'}</div>
                  <div className="mt-1 text-sm font-semibold text-[#f2f0ea]">{membershipValidityLabel}</div>
                  {isDayPassMembership && (
                    <div className="mt-0.5 text-xs text-[#d8ff3c]">Day pass closes at 10:00 PM.</div>
                  )}
                </div>

                <div className="border border-[#f2f0ea]/[0.14] bg-transparent px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[#f2f0ea]/40">Subscription</div>
                  <div className="mt-1 text-sm font-semibold text-[#f2f0ea]">
                    {membershipSubscription?.id ? `#${membershipSubscription.id.slice(0, 8).toUpperCase()}` : 'Linked membership entry'}
                  </div>
                  <div className="mt-0.5 text-xs text-[#f2f0ea]/40">{membershipSubscription?.purchase_date ? formatDateTimeLabel(membershipSubscription.purchase_date) : 'Created from membership checkout'}</div>
                </div>
              </div>
            </section>
          ) : (
            <>
          {/* Booking Details */}
          <section className="bg-[#111827] border border-[#f2f0ea]/[0.14] overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#f2f0ea]/10 bg-[#151d2a]">
              <div className="w-7 h-7 bg-[#d8ff3c]/15 flex items-center justify-center">
                <Calendar size={13} className="text-[#d8ff3c]" />
              </div>
              <span className="text-xs font-bold text-[#f2f0ea]/50 uppercase tracking-wider">Booking Details</span>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#f2f0ea]/40 uppercase tracking-wide mb-1.5">Date *</label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full px-3 py-2.5 bg-transparent border border-[#f2f0ea]/[0.14] text-[#f2f0ea] text-sm focus:outline-none focus:border-[#d8ff3c]/60 transition-colors"
                  style={{ colorScheme: 'dark' }}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#f2f0ea]/40 uppercase tracking-wide mb-1.5">Start Time *</label>
                <div className="relative">
                  <Clock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#f2f0ea]/40 pointer-events-none" />
                  <input
                    type="time"
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    className="w-full pl-8 pr-3 py-2.5 bg-transparent border border-[#f2f0ea]/[0.14] text-[#f2f0ea] text-sm focus:outline-none focus:border-[#d8ff3c]/60 transition-colors"
                    style={{ colorScheme: 'dark' }}
                  />
                </div>
              </div>
              <div className="col-span-2">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-semibold text-[#f2f0ea]/40 uppercase tracking-wide">
                    End Time <span className="text-[#f2f0ea]/30 normal-case">(auto-calculated)</span>
                  </label>
                  {status === 'in-progress' && (
                    <button
                      type="button"
                      onClick={() => {
                        const newDur = onEndNow();
                        if (newDur) {
                          setEndNowMsg(`Rounded to ${formatDurationLabel(newDur, { long: true })}`);
                          setTimeout(() => setEndNowMsg(null), 3000);
                        }
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 bg-[#ff5c2b]/10 border border-[#ff5c2b]/30 text-[#ff5c2b] text-[11px] font-semibold hover:bg-[#ff5c2b]/20 transition-colors"
                    >
                      <Zap size={10} /> End Now
                    </button>
                  )}
                </div>
                <div className="px-3 py-2.5 bg-transparent border border-dashed border-[#f2f0ea]/[0.14] text-[#f2f0ea]/50 text-sm font-medium">
                  {endTime}
                </div>
                {endNowMsg && (
                  <p className="mt-1 text-[11px] text-[#ff5c2b] flex items-center gap-1">
                    <AlertCircle size={10} /> {endNowMsg}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Console & Controllers */}
          <section className="bg-[#111827] border border-[#f2f0ea]/[0.14] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#f2f0ea]/10 bg-[#151d2a]">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 bg-[#d8ff3c]/15 flex items-center justify-center">
                  <span className="text-sm">🎮</span>
                </div>
                <span className="text-xs font-bold text-[#f2f0ea]/50 uppercase tracking-wider">Console & Controllers</span>
              </div>
              {bookingItemsCount > 1 && bookingItemId && (
                <span className="text-[11px] text-[#f2f0ea]/40 bg-[#f2f0ea]/10 px-2 py-0.5 rounded-full border border-[#f2f0ea]/[0.14]">
                  Editing selected item
                </span>
              )}
            </div>

            <div className="p-4 flex flex-col gap-3">
              {items.map((item, idx) => (
                <div key={idx} className="relative bg-transparent border border-[#f2f0ea]/[0.14] p-3">
                  {!isSingleItemEdit && items.length > 1 && (
                    <button
                      onClick={() => removeItem(idx)}
                      className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-[#ff5c2b] text-[#f2f0ea] flex items-center justify-center hover:bg-[#ff5c2b] transition-colors z-10"
                    >
                      <X size={10} />
                    </button>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {/* Console */}
                    <div>
                      <label className="block text-[10px] font-semibold text-[#f2f0ea]/40 uppercase tracking-wide mb-1">Console</label>
                      <div className="relative">
                        <select
                          value={item.console}
                          onChange={e => { updateItem(idx, { console: e.target.value }); setAmountManuallyEdited(false); }}
                          className="w-full appearance-none px-2.5 py-2 pr-7 bg-[#151d2a] border border-[#f2f0ea]/[0.14] text-[#f2f0ea] text-xs font-medium focus:outline-none focus:border-[#d8ff3c]/60 transition-colors cursor-pointer"
                        >
                          {selectableConsoleOptions.map(o => (
                            <option key={o.id} value={o.id}>{o.icon} {o.label}</option>
                          ))}
                        </select>
                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#f2f0ea]/40 pointer-events-none" />
                      </div>
                    </div>

                    {/* Duration */}
                    <div>
                      <label className="block text-[10px] font-semibold text-[#f2f0ea]/40 uppercase tracking-wide mb-1">Duration</label>
                      <div className="relative">
                        <select
                          value={item.duration}
                          onChange={e => { updateItem(idx, { duration: parseInt(e.target.value) }); setAmountManuallyEdited(false); }}
                          className="w-full appearance-none px-2.5 py-2 pr-7 bg-[#151d2a] border border-[#f2f0ea]/[0.14] text-[#f2f0ea] text-xs font-medium focus:outline-none focus:border-[#d8ff3c]/60 transition-colors cursor-pointer"
                        >
                          {DURATIONS.map(d => (
                            <option key={d} value={d}>{formatDurationLabel(d, { long: true })}</option>
                          ))}
                        </select>
                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#f2f0ea]/40 pointer-events-none" />
                      </div>
                    </div>

                    {/* Quantity */}
                    <div>
                      <label className="block text-[10px] font-semibold text-[#f2f0ea]/40 uppercase tracking-wide mb-1">
                        {STATION_CONSOLES.has(item.console) ? 'Stations' : 'Controllers'}
                      </label>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => { if (item.quantity > 1) { updateItem(idx, { quantity: item.quantity - 1 }); setAmountManuallyEdited(false); } }}
                          className="w-7 h-7 bg-[#f2f0ea]/10 hover:bg-[#f2f0ea]/[0.14] flex items-center justify-center text-[#f2f0ea]/70 transition-colors shrink-0"
                        >
                          <Minus size={11} />
                        </button>
                        <span className="flex-1 text-center text-sm font-bold text-[#f2f0ea]">{item.quantity}</span>
                        <button
                          onClick={() => { if (item.quantity < 4) { updateItem(idx, { quantity: item.quantity + 1 }); setAmountManuallyEdited(false); } }}
                          className="w-7 h-7 bg-[#f2f0ea]/10 hover:bg-[#f2f0ea]/[0.14] flex items-center justify-center text-[#f2f0ea]/70 transition-colors shrink-0"
                        >
                          <Plus size={11} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Item price preview */}
                  {(() => {
                    const price = getBillingPrice(item.console as ConsoleId, item.quantity, item.duration);
                    return price > 0 ? (
                      <div className="mt-2 text-right text-[11px] text-[#f2f0ea]/40">
                        {CONSOLE_ICONS[item.console as ConsoleId] || '🎮'} {CONSOLE_LABELS[item.console as ConsoleId] || item.console} × {item.quantity} · {formatDurationLabel(item.duration, { long: true })} =
                        <span className="text-[#d8ff3c] font-semibold ml-1">₹{price}</span>
                      </div>
                    ) : (
                      <div className="mt-2 text-right text-[11px] text-[#ff5c2b] flex items-center justify-end gap-1">
                        <AlertCircle size={10} /> Pricing not set — amount will be ₹0
                      </div>
                    );
                  })()}
                </div>
              ))}

              <button
                onClick={addItem}
                disabled={isSingleItemEdit || configuredConsoleOptions.length === 0}
                className={`flex items-center justify-center gap-2 py-2.5  border border-dashed text-xs font-semibold transition-colors ${
                  isSingleItemEdit || configuredConsoleOptions.length === 0
                    ? 'border-[#f2f0ea]/10 text-[#f2f0ea]/30 cursor-not-allowed'
                    : 'border-[#d8ff3c]/30 text-[#d8ff3c] hover:bg-[#d8ff3c]/5'
                }`}
              >
                <Plus size={13} /> {isSingleItemEdit ? 'Editing One Item Only' : configuredConsoleOptions.length === 0 ? 'No Stations Configured' : 'Add Console / Station'}
              </button>
            </div>
          </section>

          {/* Snacks & Orders */}
          <section className="overflow-hidden bg-[#111827] border border-[#ff5c2b]/20">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#ff5c2b]/20 bg-[#151d2a]">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 flex items-center justify-center" style={{ background: 'rgba(251,146,60,0.15)' }}>
                  <UtensilsCrossed size={13} className="text-[#ff5c2b]" />
                </div>
                <span className="text-xs font-bold text-[#f2f0ea]/50 uppercase tracking-wider">Snacks & F&B</span>
              </div>
              {snacksTotal > 0 && (
                <span className="text-sm font-bold text-[#ff5c2b]">₹{snacksTotal.toLocaleString('en-IN')}</span>
              )}
            </div>

            {/* Body — inline snack manager */}
            <div className="p-3">
              <InlineSnackManager
                bookingId={booking.id}
                cafeId={cafe?.id || booking.cafe_id || ''}
                existingOrders={localOrders}
                onOrdersUpdated={handleOrdersUpdated}
              />
            </div>
          </section>
            </>
          )}

          {/* Payment */}
          <section className="bg-[#111827] border border-[#f2f0ea]/[0.14] overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#f2f0ea]/10 bg-[#151d2a]">
              <div className="w-7 h-7 bg-[#d8ff3c]/15 flex items-center justify-center">
                <CreditCard size={13} className="text-[#d8ff3c]" />
              </div>
              <span className="text-xs font-bold text-[#f2f0ea]/50 uppercase tracking-wider">Payment</span>
            </div>

            <div className="p-4 flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#f2f0ea]/40 uppercase tracking-wide mb-1.5">
                    {isMembershipBooking ? 'Membership Amount *' : 'Session Amount *'}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#d8ff3c] font-bold text-base">₹</span>
                    <input
                      type="number"
                      value={amount}
                      onChange={e => { setAmount(e.target.value); setAmountManuallyEdited(true); }}
                      min="0"
                      step="1"
                      className="w-full pl-7 pr-3 py-2.5 bg-transparent border border-[#d8ff3c]/30 text-[#d8ff3c] font-bold text-base focus:outline-none focus:border-[#d8ff3c]/50 transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#f2f0ea]/40 uppercase tracking-wide mb-2">Payment Method *</label>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_OPTIONS.map(p => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setPaymentMethod(p.value)}
                      className={`py-2.5  border text-sm font-semibold transition-all ${paymentMethod === p.value ? p.active : p.inactive} hover:opacity-90`}
                    >
                      {p.icon} {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center gap-2 px-4 py-3 sm:px-6 sm:py-4 bg-[#0f1520] border-t border-[#f2f0ea]/10">
          {/* Delete */}
          <button
            onClick={onDelete}
            disabled={saving || deleting}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-[#ff5c2b]/10 border border-[#ff5c2b]/25 text-[#ff5c2b] text-sm font-semibold hover:bg-[#ff5c2b]/20 transition-colors disabled:opacity-40"
          >
	            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
	            {isMembershipBooking ? 'Delete Entry' : 'Delete'}
          </button>

          <div className="flex-1" />

          {/* Cancel */}
          <button
            onClick={onClose}
            disabled={saving || deleting}
            className="px-4 py-2.5 border border-[#f2f0ea]/[0.14] bg-[#f2f0ea]/10 text-[#f2f0ea]/50 text-sm font-semibold hover:text-[#f2f0ea] hover:border-[#f2f0ea]/30 transition-colors disabled:opacity-40"
          >
            Cancel
          </button>

          {/* Save */}
          <button
            onClick={onSave}
            disabled={saving || deleting || !amount || !date || !startTime}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-[#d8ff3c] hover:bg-[#d8ff3c] text-[#f2f0ea] text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-[#d8ff3c]/20"
          >
	            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
	            {saving ? 'Saving...' : isMembershipBooking ? 'Save Membership' : 'Save Changes'}
	          </button>
        </div>
      </div>
    </div>
  );
}
