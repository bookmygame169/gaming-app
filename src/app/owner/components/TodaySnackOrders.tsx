'use client';

import { useMemo } from 'react';
import { ShoppingBag, Banknote, Smartphone, CreditCard, TrendingUp, Plus, Lock } from 'lucide-react';

interface SnackOrder {
  id: string;
  item_name: string;
  quantity: number;
  total_price: number;
}

interface Booking {
  id: string;
  customer_name?: string | null;
  user_name?: string | null;
  customer_phone?: string | null;
  user_phone?: string | null;
  booking_date: string;
  start_time?: string | null;
  payment_mode?: string | null;
  booking_orders?: SnackOrder[];
}

interface TodaySnackOrdersProps {
  bookings: Booking[];
  todayStr: string;
  onNewSale?: () => void;
}

function PaymentBadge({ mode }: { mode?: string | null }) {
  if (mode === 'owner') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-500/15 text-purple-400 border border-purple-500/20">
        <Lock size={10} /> Owner Use
      </span>
    );
  }
  const m = (mode || 'cash').toLowerCase();
  if (m === 'online' || m === 'upi') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/15 text-blue-400 border border-blue-500/20">
        <Smartphone size={10} /> UPI
      </span>
    );
  }
  if (m === 'card') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-500/15 text-purple-400 border border-purple-500/20">
        <CreditCard size={10} /> Card
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
      <Banknote size={10} /> Cash
    </span>
  );
}

export function TodaySnackOrders({ bookings, todayStr, onNewSale }: TodaySnackOrdersProps) {
  const ordersToday = useMemo(() => {
    return bookings
      .filter(b => b.booking_date === todayStr && b.booking_orders && b.booking_orders.length > 0)
      .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
  }, [bookings, todayStr]);

  const totalRevenue = useMemo(() =>
    ordersToday
      .filter(b => b.payment_mode !== 'owner')
      .reduce((sum, b) =>
        sum + (b.booking_orders?.reduce((s, o) => s + (o.total_price || 0), 0) || 0), 0),
    [ordersToday]
  );

  const totalItems = useMemo(() =>
    ordersToday.reduce((sum, b) =>
      sum + (b.booking_orders?.reduce((s, o) => s + (o.quantity || 0), 0) || 0), 0),
    [ordersToday]
  );

  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-orange-500/15 flex items-center justify-center">
            <ShoppingBag size={16} className="text-orange-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Today&apos;s Snack Orders</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Inventory items sold today</p>
          </div>
        </div>

        {/* New sale button + summary chips */}
        <div className="flex items-center gap-2">
          {onNewSale && (
            <button
              onClick={onNewSale}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/30 text-orange-400 text-xs font-medium transition-all"
            >
              <Plus size={11} /> New Sale
            </button>
          )}
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-slate-700/60 text-slate-400 border border-slate-600/40">
            {ordersToday.length} {ordersToday.length === 1 ? 'booking' : 'bookings'}
          </span>
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-slate-700/60 text-slate-400 border border-slate-600/40">
            {totalItems} items
          </span>
          {totalRevenue > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">
              <TrendingUp size={10} /> ₹{totalRevenue.toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      {ordersToday.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2">
          <ShoppingBag size={28} className="text-slate-600" />
          <p className="text-sm text-slate-500">No snack orders today</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-700/30">
          {ordersToday.map(booking => {
            const customer = booking.user_name || booking.customer_name || 'Walk-in';
            const phone = booking.user_phone || booking.customer_phone;
            const orderTotal = booking.booking_orders!.reduce((s, o) => s + (o.total_price || 0), 0);

            return (
              <div key={booking.id} className={`px-5 py-3.5 transition-colors ${booking.payment_mode === 'owner' ? 'bg-purple-500/5 hover:bg-purple-500/8' : 'hover:bg-slate-700/20'}`}>
                {/* Row top: customer + payment + total */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
                      <span className="text-xs font-semibold text-slate-300">
                        {customer.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-slate-200 truncate block">{customer}</span>
                      {phone && <span className="text-[11px] text-slate-500">{phone}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <PaymentBadge mode={booking.payment_mode} />
                    {booking.payment_mode === 'owner'
                      ? <span className="text-sm font-semibold text-purple-400">Owner</span>
                      : <span className="text-sm font-semibold text-orange-400">₹{orderTotal.toLocaleString()}</span>
                    }
                  </div>
                </div>

                {/* Items list */}
                <div className="flex flex-wrap gap-1.5 pl-9">
                  {booking.booking_orders!.map((order, idx) => (
                    <span
                      key={order.id || idx}
                      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-slate-700/60 text-slate-300 border border-slate-600/30"
                    >
                      <span className="text-orange-400 font-medium">×{order.quantity}</span>
                      {order.item_name || 'Item'}
                      {order.total_price > 0 && (
                        <span className="text-slate-500 ml-0.5">₹{order.total_price}</span>
                      )}
                    </span>
                  ))}
                  {booking.start_time && (
                    <span className="text-[11px] text-slate-600 ml-1 self-center">{booking.start_time}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
