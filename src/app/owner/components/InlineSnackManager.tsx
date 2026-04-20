'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Plus, Minus, Trash2, Loader2, ShoppingCart, Check, Package } from 'lucide-react';
import { InventoryItem, BookingOrder } from '@/types/inventory';

interface Props {
  bookingId: string;
  cafeId: string;
  existingOrders: BookingOrder[];
  onOrdersUpdated: (payload: {
    amountDelta: number;
    bookingId: string;
    orders: BookingOrder[];
    updatedAt: string | null;
  }) => void;
}

interface CartItem {
  item: InventoryItem;
  quantity: number;
}

async function getBookingUpdatedAt(bookingId: string): Promise<string | null> {
  const { data } = await supabase.from('bookings').select('updated_at').eq('id', bookingId).single();
  return data?.updated_at ?? null;
}

export default function InlineSnackManager({ bookingId, cafeId, existingOrders, onOrdersUpdated }: Props) {
  const [inventory, setInventory]       = useState<InventoryItem[]>([]);
  const [orders, setOrders]             = useState<BookingOrder[]>(existingOrders);
  const [cart, setCart]                 = useState<CartItem[]>([]);
  const [loading, setLoading]           = useState(true);
  const [adding, setAdding]             = useState(false);
  const [deletingId, setDeletingId]     = useState<string | null>(null);
  const [addedAnim, setAddedAnim]       = useState(false);

  // Keep local orders in sync when parent updates
  useEffect(() => { setOrders(existingOrders); }, [existingOrders]);

  const loadInventory = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('cafe_id', cafeId)
        .eq('is_available', true)
        .gt('stock_quantity', 0)
        .order('category')
        .order('name');
      if (error) throw error;
      setInventory(data || []);
    } catch (e) {
      console.error('InlineSnackManager: failed to load inventory', e);
    } finally {
      setLoading(false);
    }
  }, [cafeId]);

  useEffect(() => { loadInventory(); }, [loadInventory]);

  // ---- Cart helpers ----
  function addToCart(item: InventoryItem) {
    setCart(prev => {
      const ex = prev.find(c => c.item.id === item.id);
      if (ex) {
        if (ex.quantity >= item.stock_quantity) return prev;
        return prev.map(c => c.item.id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { item, quantity: 1 }];
    });
  }

  function removeFromCart(itemId: string) {
    setCart(prev => {
      const ex = prev.find(c => c.item.id === itemId);
      if (!ex) return prev;
      if (ex.quantity <= 1) return prev.filter(c => c.item.id !== itemId);
      return prev.map(c => c.item.id === itemId ? { ...c, quantity: c.quantity - 1 } : c);
    });
  }

  const cartQty   = (itemId: string) => cart.find(c => c.item.id === itemId)?.quantity || 0;
  const cartTotal = cart.reduce((s, c) => s + c.item.price * c.quantity, 0);
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);

  // ---- Add items to booking ----
  async function handleAddToBooking() {
    if (cart.length === 0) return;
    setAdding(true);
    try {
      const snap = [...cart];
      let totalToAdd = 0;

      const records = snap.map(c => {
        const lineTotal = c.item.price * c.quantity;
        totalToAdd += lineTotal;
        return {
          booking_id:        bookingId,
          inventory_item_id: c.item.id,
          item_name:         c.item.name,
          quantity:          c.quantity,
          unit_price:        c.item.price,
          total_price:       lineTotal,
        };
      });

      const { error: insertErr } = await supabase.from('booking_orders').insert(records);
      if (insertErr) throw insertErr;

      // Deduct inventory stock
      for (const c of snap) {
        const { data: cur } = await supabase.from('inventory_items').select('stock_quantity').eq('id', c.item.id).single();
        if (cur) {
          await supabase.from('inventory_items').update({ stock_quantity: cur.stock_quantity - c.quantity }).eq('id', c.item.id);
        }
      }

      // Update booking total
      const { data: bk } = await supabase.from('bookings').select('total_amount').eq('id', bookingId).single();
      if (bk) {
        await supabase.from('bookings').update({ total_amount: (Number(bk.total_amount) || 0) + totalToAdd }).eq('id', bookingId);
      }

      // Reload orders
      const { data: latestOrders } = await supabase.from('booking_orders').select('*').eq('booking_id', bookingId).order('ordered_at', { ascending: false });
      const next = latestOrders || [];
      setOrders(next);
      setCart([]);
      loadInventory();

      const updatedAt = await getBookingUpdatedAt(bookingId);
      onOrdersUpdated({ amountDelta: totalToAdd, bookingId, orders: next, updatedAt });

      setAddedAnim(true);
      setTimeout(() => setAddedAnim(false), 1800);
    } catch (e) {
      console.error('InlineSnackManager: add failed', e);
      alert('Failed to add snacks. Please try again.');
    } finally {
      setAdding(false);
    }
  }

  // ---- Remove existing order ----
  async function handleRemove(order: BookingOrder) {
    setDeletingId(order.id);
    try {
      await supabase.from('booking_orders').delete().eq('id', order.id);

      // Restore inventory
      if (order.inventory_item_id) {
        const { data: cur } = await supabase.from('inventory_items').select('stock_quantity').eq('id', order.inventory_item_id).single();
        if (cur) await supabase.from('inventory_items').update({ stock_quantity: cur.stock_quantity + order.quantity }).eq('id', order.inventory_item_id);
      }

      // Update booking total
      const { data: bk } = await supabase.from('bookings').select('total_amount').eq('id', bookingId).single();
      const delta = Number(order.total_price) || 0;
      if (bk) await supabase.from('bookings').update({ total_amount: Math.max(0, (Number(bk.total_amount) || 0) - delta) }).eq('id', bookingId);

      const next = orders.filter(o => o.id !== order.id);
      setOrders(next);
      loadInventory();

      const updatedAt = await getBookingUpdatedAt(bookingId);
      onOrdersUpdated({ amountDelta: -delta, bookingId, orders: next, updatedAt });
    } catch (e) {
      console.error('InlineSnackManager: remove failed', e);
      alert('Failed to remove item. Please try again.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">

      {/* ---- Existing orders ---- */}
      {orders.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {orders.map((order, idx) => (
            <div
              key={order.id}
              className="flex items-center justify-between px-3 py-2.5 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0"
                  style={{ background: 'rgba(251,146,60,0.12)', color: '#f59e0b' }}
                >
                  {idx + 1}
                </div>
                <div>
                  <p className="text-[12px] text-slate-300 font-medium">
                    {order.item_name || `Order #${order.id.slice(0, 8).toUpperCase()}`}
                  </p>
                  <p className="text-[10px] text-slate-600 mt-0.5">
                    {order.quantity} × ₹{order.unit_price}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-amber-400">
                  ₹{(order.total_price ?? 0).toLocaleString('en-IN')}
                </span>
                <button
                  onClick={() => handleRemove(order)}
                  disabled={deletingId === order.id}
                  className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-red-500/15 text-slate-600 hover:text-red-400 disabled:opacity-40"
                  title="Remove"
                >
                  {deletingId === order.id
                    ? <Loader2 size={13} className="animate-spin" />
                    : <Trash2 size={13} />
                  }
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---- Add items section ---- */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="px-3 py-2 border-b flex items-center gap-2" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
          <ShoppingCart size={12} className="text-slate-500" />
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Add Items</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 size={18} className="animate-spin text-slate-600" />
          </div>
        ) : inventory.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6">
            <Package size={22} className="text-slate-700" />
            <p className="text-xs text-slate-600">No inventory items available</p>
          </div>
        ) : (
          <div className="p-2.5 grid grid-cols-2 gap-2">
            {inventory.map(item => {
              const qty = cartQty(item.id);
              return (
                <div
                  key={item.id}
                  className="rounded-lg p-2.5 transition-all"
                  style={{
                    background: qty > 0 ? 'rgba(251,146,60,0.08)' : 'rgba(255,255,255,0.03)',
                    border: qty > 0 ? '1px solid rgba(251,146,60,0.25)' : '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <div className="flex items-start justify-between mb-1">
                    <span className="text-[12px] font-medium text-slate-200 leading-tight pr-1">{item.name}</span>
                    {qty > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white shrink-0">{qty}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-emerald-400">₹{item.price}</span>
                    <span className="text-[10px] text-slate-600">{item.stock_quantity} left</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {qty > 0 ? (
                      <>
                        <button onClick={() => removeFromCart(item.id)} className="flex-1 h-6 flex items-center justify-center rounded-md bg-white/[0.07] hover:bg-white/[0.11] text-slate-300 transition-colors">
                          <Minus size={11} />
                        </button>
                        <button onClick={() => addToCart(item)} disabled={qty >= item.stock_quantity} className="flex-1 h-6 flex items-center justify-center rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 transition-colors disabled:opacity-40">
                          <Plus size={11} />
                        </button>
                      </>
                    ) : (
                      <button onClick={() => addToCart(item)} className="w-full h-6 flex items-center justify-center gap-1 rounded-md bg-white/[0.07] hover:bg-amber-500/15 text-slate-400 hover:text-amber-400 text-[11px] font-medium transition-all">
                        <Plus size={10} /> Add
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Cart / confirm strip */}
        {cart.length > 0 && (
          <div className="px-3 py-2.5 border-t flex items-center justify-between gap-3" style={{ borderColor: 'rgba(251,146,60,0.15)', background: 'rgba(251,146,60,0.05)' }}>
            <div>
              <p className="text-[11px] text-slate-500">{cartCount} item{cartCount !== 1 ? 's' : ''} in cart</p>
              <p className="text-sm font-bold text-amber-400">₹{cartTotal.toLocaleString('en-IN')}</p>
            </div>
            <button
              onClick={handleAddToBooking}
              disabled={adding || addedAnim}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-bold transition-all disabled:opacity-60"
              style={{ background: addedAnim ? 'rgba(16,185,129,0.18)' : 'rgba(251,146,60,0.20)', color: addedAnim ? '#34d399' : '#fbbf24', border: addedAnim ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(251,146,60,0.35)' }}
            >
              {adding     ? <Loader2 size={13} className="animate-spin" /> :
               addedAnim  ? <><Check size={13} /> Added!</> :
                            <>Add ₹{cartTotal.toLocaleString('en-IN')} to Booking</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
