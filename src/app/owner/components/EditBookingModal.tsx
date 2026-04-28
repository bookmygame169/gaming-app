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
import { getAvailableConsoleIds, normaliseConsoleType } from '../utils';
import InlineSnackManager from './InlineSnackManager';

type EditItem = { id?: string; console: string; quantity: number; duration: number; price?: number };

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
  status: string; setStatus: (v: string) => void;
  paymentMethod: string; setPaymentMethod: (v: string) => void;
  // Actions
  saving: boolean; deleting: boolean;
  onSave: () => void; onClose: () => void;
  onDelete: () => void; onEndNow: () => number | void;
  onManageSnacks: () => void;
  // Data
  cafe: CafeRow | null;
  getBillingPrice: (c: ConsoleId, qty: number, dur: number) => number;
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
  { value: 'pending', label: 'Pending', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  { value: 'confirmed', label: 'Confirmed', color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  { value: 'in-progress', label: 'In Progress', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  { value: 'completed', label: 'Completed', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  { value: 'cancelled', label: 'Cancelled', color: 'text-red-400 bg-red-500/10 border-red-500/30' },
];

const PAYMENT_OPTIONS = [
  { value: 'cash', label: 'Cash', icon: '💵', active: 'border-emerald-500 bg-emerald-500/10 text-emerald-300', inactive: 'border-white/[0.09] bg-white/[0.04] text-slate-400' },
  { value: 'upi', label: 'UPI', icon: '📱', active: 'border-indigo-500 bg-indigo-500/10 text-indigo-300', inactive: 'border-white/[0.09] bg-white/[0.04] text-slate-400' },
];

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

export function EditBookingModal({
  booking, bookingItemId,
  customerName, setCustomerName, customerPhone, setCustomerPhone,
  date, setDate, startTime, setStartTime, duration,
  items, setItems, updateItem,
  amount, setAmount, setAmountManuallyEdited,
  status, setStatus, paymentMethod, setPaymentMethod,
  saving, deleting,
  onSave, onClose, onDelete, onEndNow, onManageSnacks,
  cafe, getBillingPrice,
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
  const isSingleItemEdit = Boolean(bookingItemId);
  const endTime = calcEndTime(startTime, items, duration);
  const snacksTotal = localOrders.reduce((s, o) => s + (o.total_price || 0), 0);
  const bookingItemsCount = booking.booking_items?.length || 0;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <style>{`
        input[type=number]::-webkit-outer-spin-button,
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>

      <div
        className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white/[0.03] border border-white/[0.06] shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white/[0.03]/95 backdrop-blur border-b border-white/[0.06]">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/15 flex items-center justify-center">
                <span className="text-lg">📝</span>
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-100">
                  {isAppBooking ? 'Edit App Booking' : 'Edit Walk-In Booking'}
                </h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] text-slate-500 font-mono">#{booking.id.slice(0, 8).toUpperCase()}</span>
                  {isAppBooking && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 font-semibold">APP</span>
                  )}
                  {booking.status && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold border ${STATUS_OPTIONS.find(s => s.value === booking.status)?.color || 'text-slate-400 bg-white/[0.08] border-slate-600'}`}>
                      {booking.status.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.08] flex items-center justify-center text-slate-400 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-5 p-6">

          {/* Customer Information */}
          <section className="rounded-xl bg-white/[0.06]/40 border border-white/[0.09]/40 overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.09]/40 bg-white/[0.03]">
              <div className="w-7 h-7 rounded-lg bg-indigo-500/15 flex items-center justify-center">
                <User size={13} className="text-indigo-400" />
              </div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Customer Information</span>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Name with autocomplete */}
              <div className="relative" ref={suggRef}>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  Name
                  {searching && <span className="inline-block w-3 h-3 border border-slate-500 border-t-transparent rounded-full animate-spin" />}
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={e => { setCustomerName(e.target.value); }}
                  placeholder="Customer name"
                  maxLength={100}
                  className="w-full px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-slate-200 text-sm placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 transition-colors"
                />
                {showSugg && suggestions.length > 0 && (
                  <div className="absolute z-50 w-full top-full mt-1 rounded-xl bg-white/[0.06] border border-white/[0.09] shadow-xl overflow-hidden">
                    {suggestions.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.08]/60 transition-colors text-left"
                        onMouseDown={() => {
                          setCustomerName(s.name);
                          if (s.phone) setCustomerPhone(s.phone);
                          setShowSugg(false);
                        }}
                      >
                        <div className="w-7 h-7 rounded-full bg-indigo-500/15 flex items-center justify-center text-xs text-indigo-400 shrink-0">
                          {s.name[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-200">{s.name}</p>
                          {s.phone && <p className="text-xs text-slate-500">{s.phone}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Phone */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Phone</label>
                <div className="relative">
                  <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value.replace(/[^\d+\-\s()]/g, ''))}
                    placeholder="e.g. 9876543210"
                    maxLength={15}
                    className={`w-full pl-8 pr-3 py-2.5 rounded-lg bg-white/[0.03] border text-slate-200 text-sm placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 transition-colors ${customerPhone && !/^(\+91|0)?[6-9]\d{9}$|^\+\d{7,15}$/.test(customerPhone) ? 'border-red-500/60' : 'border-white/[0.06]'}`}
                  />
                </div>
              </div>

              {booking.user_email && (
                <div className="col-span-2 flex items-center gap-2 text-xs text-slate-500 pt-1">
                  <AlertCircle size={11} />
                  {booking.user_email}
                </div>
              )}
            </div>
          </section>

          {/* Booking Details */}
          <section className="rounded-xl bg-white/[0.06]/40 border border-white/[0.09]/40 overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.09]/40 bg-white/[0.03]">
              <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center">
                <Calendar size={13} className="text-blue-400" />
              </div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Booking Details</span>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Date *</label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-slate-200 text-sm focus:outline-none focus:border-indigo-500/60 transition-colors"
                  style={{ colorScheme: 'dark' }}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Start Time *</label>
                <div className="relative">
                  <Clock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  <input
                    type="time"
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    className="w-full pl-8 pr-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-slate-200 text-sm focus:outline-none focus:border-indigo-500/60 transition-colors"
                    style={{ colorScheme: 'dark' }}
                  />
                </div>
              </div>
              <div className="col-span-2">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                    End Time <span className="text-slate-600 normal-case">(auto-calculated)</span>
                  </label>
                  {status === 'in-progress' && (
                    <button
                      type="button"
                      onClick={() => {
                        const newDur = onEndNow();
                        if (newDur) {
                          setEndNowMsg(`Rounded to ${newDur} min`);
                          setTimeout(() => setEndNowMsg(null), 3000);
                        }
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-[11px] font-semibold hover:bg-red-500/20 transition-colors"
                    >
                      <Zap size={10} /> End Now
                    </button>
                  )}
                </div>
                <div className="px-3 py-2.5 rounded-lg bg-white/[0.03]/30 border border-dashed border-white/[0.06] text-slate-400 text-sm font-medium">
                  {endTime}
                </div>
                {endNowMsg && (
                  <p className="mt-1 text-[11px] text-amber-400 flex items-center gap-1">
                    <AlertCircle size={10} /> {endNowMsg}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Console & Controllers */}
          <section className="rounded-xl bg-white/[0.06]/40 border border-white/[0.09]/40 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.09]/40 bg-white/[0.03]">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-purple-500/15 flex items-center justify-center">
                  <span className="text-sm">🎮</span>
                </div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Console & Controllers</span>
              </div>
              {bookingItemsCount > 1 && bookingItemId && (
                <span className="text-[11px] text-slate-500 bg-white/[0.06] px-2 py-0.5 rounded-full border border-white/[0.09]">
                  Editing selected item
                </span>
              )}
            </div>

            <div className="p-4 flex flex-col gap-3">
              {items.map((item, idx) => (
                <div key={idx} className="relative rounded-xl bg-white/[0.03] border border-white/[0.09]/40 p-3">
                  {!isSingleItemEdit && items.length > 1 && (
                    <button
                      onClick={() => removeItem(idx)}
                      className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-400 transition-colors z-10"
                    >
                      <X size={10} />
                    </button>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {/* Console */}
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Console</label>
                      <div className="relative">
                        <select
                          value={item.console}
                          onChange={e => { updateItem(idx, { console: e.target.value }); setAmountManuallyEdited(false); }}
                          className="w-full appearance-none px-2.5 py-2 pr-7 rounded-lg bg-white/[0.06] border border-white/[0.06] text-slate-200 text-xs font-medium focus:outline-none focus:border-purple-500/60 transition-colors cursor-pointer"
                        >
                          {selectableConsoleOptions.map(o => (
                            <option key={o.id} value={o.id}>{o.icon} {o.label}</option>
                          ))}
                        </select>
                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                      </div>
                    </div>

                    {/* Duration */}
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Duration</label>
                      <div className="relative">
                        <select
                          value={item.duration}
                          onChange={e => { updateItem(idx, { duration: parseInt(e.target.value) }); setAmountManuallyEdited(false); }}
                          className="w-full appearance-none px-2.5 py-2 pr-7 rounded-lg bg-white/[0.06] border border-white/[0.06] text-slate-200 text-xs font-medium focus:outline-none focus:border-purple-500/60 transition-colors cursor-pointer"
                        >
                          {DURATIONS.map(d => (
                            <option key={d} value={d}>{d} min</option>
                          ))}
                        </select>
                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                      </div>
                    </div>

                    {/* Quantity */}
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                        {STATION_CONSOLES.has(item.console) ? 'Stations' : 'Controllers'}
                      </label>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => { if (item.quantity > 1) { updateItem(idx, { quantity: item.quantity - 1 }); setAmountManuallyEdited(false); } }}
                          className="w-7 h-7 rounded-lg bg-white/[0.08] hover:bg-white/[0.10] flex items-center justify-center text-slate-300 transition-colors shrink-0"
                        >
                          <Minus size={11} />
                        </button>
                        <span className="flex-1 text-center text-sm font-bold text-slate-200">{item.quantity}</span>
                        <button
                          onClick={() => { if (item.quantity < 4) { updateItem(idx, { quantity: item.quantity + 1 }); setAmountManuallyEdited(false); } }}
                          className="w-7 h-7 rounded-lg bg-white/[0.08] hover:bg-white/[0.10] flex items-center justify-center text-slate-300 transition-colors shrink-0"
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
                      <div className="mt-2 text-right text-[11px] text-slate-500">
                        {CONSOLE_ICONS[item.console as ConsoleId] || '🎮'} {CONSOLE_LABELS[item.console as ConsoleId] || item.console} × {item.quantity} · {item.duration}min =
                        <span className="text-emerald-400 font-semibold ml-1">₹{price}</span>
                      </div>
                    ) : (
                      <div className="mt-2 text-right text-[11px] text-amber-400 flex items-center justify-end gap-1">
                        <AlertCircle size={10} /> Pricing not set — amount will be ₹0
                      </div>
                    );
                  })()}
                </div>
              ))}

              <button
                onClick={addItem}
                disabled={isSingleItemEdit || configuredConsoleOptions.length === 0}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed text-xs font-semibold transition-colors ${
                  isSingleItemEdit || configuredConsoleOptions.length === 0
                    ? 'border-white/[0.09] text-slate-600 cursor-not-allowed'
                    : 'border-purple-500/30 text-purple-400 hover:bg-purple-500/5'
                }`}
              >
                <Plus size={13} /> {isSingleItemEdit ? 'Editing One Item Only' : configuredConsoleOptions.length === 0 ? 'No Stations Configured' : 'Add Console / Station'}
              </button>
            </div>
          </section>

          {/* Snacks & Orders */}
          <section className="rounded-xl overflow-hidden" style={{ background: 'rgba(251,146,60,0.03)', border: '1px solid rgba(251,146,60,0.10)' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'rgba(251,146,60,0.10)', background: 'rgba(251,146,60,0.05)' }}>
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(251,146,60,0.15)' }}>
                  <UtensilsCrossed size={13} className="text-amber-400" />
                </div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Snacks & F&B</span>
              </div>
              {snacksTotal > 0 && (
                <span className="text-sm font-bold text-amber-400">₹{snacksTotal.toLocaleString('en-IN')}</span>
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

          {/* Payment & Status */}
          <section className="rounded-xl bg-white/[0.06]/40 border border-white/[0.09]/40 overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.09]/40 bg-white/[0.03]">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                <CreditCard size={13} className="text-emerald-400" />
              </div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Payment & Status</span>
            </div>

            <div className="p-4 flex flex-col gap-4">
              {/* Amount + Status row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Amount */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    Session Amount *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400 font-bold text-base">₹</span>
                    <input
                      type="number"
                      value={amount}
                      onChange={e => { setAmount(e.target.value); setAmountManuallyEdited(true); }}
                      min="0"
                      step="1"
                      className="w-full pl-7 pr-3 py-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-emerald-300 font-bold text-base focus:outline-none focus:border-emerald-500/50 transition-colors"
                    />
                  </div>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Status *</label>
                  <div className="relative">
                    <select
                      value={status}
                      onChange={e => setStatus(e.target.value)}
                      className="w-full appearance-none px-3 py-2.5 pr-8 rounded-lg bg-white/[0.03] border border-white/[0.06] text-slate-200 text-sm font-medium focus:outline-none focus:border-indigo-500/60 transition-colors cursor-pointer"
                    >
                      {STATUS_OPTIONS.map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                    <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Payment Method *</label>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_OPTIONS.map(p => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setPaymentMethod(p.value)}
                      className={`py-2.5 rounded-xl border text-sm font-semibold transition-all ${paymentMethod === p.value ? p.active : p.inactive} hover:opacity-90`}
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
        <div className="sticky bottom-0 flex items-center gap-2 px-4 py-3 sm:px-6 sm:py-4 bg-white/[0.03]/95 backdrop-blur border-t border-white/[0.06]">
          {/* Delete */}
          <button
            onClick={onDelete}
            disabled={saving || deleting}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-sm font-semibold hover:bg-red-500/20 transition-colors disabled:opacity-40"
          >
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Delete
          </button>

          <div className="flex-1" />

          {/* Cancel */}
          <button
            onClick={onClose}
            disabled={saving || deleting}
            className="px-4 py-2.5 rounded-xl border border-white/[0.09] bg-white/[0.04] text-slate-400 text-sm font-semibold hover:text-slate-200 hover:border-slate-600 transition-colors disabled:opacity-40"
          >
            Cancel
          </button>

          {/* Save */}
          <button
            onClick={onSave}
            disabled={saving || deleting || !amount || !date || !startTime}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
