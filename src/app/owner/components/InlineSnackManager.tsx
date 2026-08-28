'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Minus, Trash2, Loader2, ShoppingCart, Check, Package } from 'lucide-react';
import { InventoryItem, BookingOrder } from '@/types/inventory';
import { fetchBookingUpdatedAt, fetchInventory, fetchOrdersForBooking } from "@/app/owner/ownerLookup";

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

async function getBookingUpdatedAt(cafeId: string, bookingId: string): Promise<string | null> {
  return fetchBookingUpdatedAt(cafeId, bookingId);
}

export default function InlineSnackManager({ bookingId, cafeId, existingOrders, onOrdersUpdated }: Props) {
  const [inventory, setInventory]       = useState<InventoryItem[]>([]);
  const [orders, setOrders]             = useState<BookingOrder[]>(existingOrders);
  const [cart, setCart]                 = useState<CartItem[]>([]);
  const [loading, setLoading]           = useState(false);
  const [adding, setAdding]             = useState(false);
  const [deletingId, setDeletingId]     = useState<string | null>(null);
  const [addedAnim, setAddedAnim]       = useState(false);
  const [showAddItems, setShowAddItems] = useState(false);

  // Keep local orders in sync when parent updates
  useEffect(() => { setOrders(existingOrders); }, [existingOrders]);

  const loadInventory = useCallback(async () => {
    setLoading(true);
    try {
      setInventory(await fetchInventory<InventoryItem>(cafeId, { availableOnly: true, inStockOnly: true }));
    } catch (e) {
      console.error('InlineSnackManager: failed to load inventory', e);
    } finally {
      setLoading(false);
    }
  }, [cafeId]);

  useEffect(() => { if (showAddItems) loadInventory(); }, [showAddItems, loadInventory]);

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

      const res = await fetch('/api/owner/booking-orders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId,
          items: snap.map((c) => ({ inventory_item_id: c.item.id, quantity: c.quantity })),
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(result.error || 'Failed to add items');
      }

      // Reload orders
      const latestOrders = await fetchOrdersForBooking<BookingOrder>(cafeId, bookingId);
      const next = latestOrders || [];
      setOrders(next);
      setCart([]);
      loadInventory();

      const updatedAt = await getBookingUpdatedAt(cafeId, bookingId);
      onOrdersUpdated({ amountDelta: Number(result.amountAdded) || 0, bookingId, orders: next, updatedAt });

      setAddedAnim(true);
      setTimeout(() => setAddedAnim(false), 1800);
    } catch (e) {
      console.error('InlineSnackManager: add failed', e);
      alert(e instanceof Error ? e.message : 'Failed to add snacks. Please try again.');
    } finally {
      setAdding(false);
    }
  }

  // ---- Remove existing order ----
  async function handleRemove(order: BookingOrder) {
    setDeletingId(order.id);
    try {
      const res = await fetch(`/api/owner/booking-orders?orderId=${encodeURIComponent(order.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(result.error || 'Failed to remove item');
      }

      const next = orders.filter(o => o.id !== order.id);
      setOrders(next);
      loadInventory();

      const updatedAt = await getBookingUpdatedAt(cafeId, bookingId);
      onOrdersUpdated({ amountDelta: -(Number(result.amountRemoved ?? order.total_price) || 0), bookingId, orders: next, updatedAt });
    } catch (e) {
      console.error('InlineSnackManager: remove failed', e);
      alert(e instanceof Error ? e.message : 'Failed to remove item. Please try again.');
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
              className="flex items-center justify-between px-3 py-2.5 "
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-6 h-6 flex items-center justify-center text-[10px] font-bold shrink-0"
                  style={{ background: 'rgba(251,146,60,0.12)', color: '#ff5c2b' }}
                >
                  {idx + 1}
                </div>
                <div>
                  <p className="text-[12px] text-[#f2f0ea]/70 font-medium">
                    {order.item_name || `Order #${order.id.slice(0, 8).toUpperCase()}`}
                  </p>
                  <p className="text-[10px] text-[#f2f0ea]/30 mt-0.5">
                    {order.quantity} × ₹{order.unit_price}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-[#ff5c2b]">
                  ₹{(order.total_price ?? 0).toLocaleString('en-IN')}
                </span>
                <button
                  onClick={() => handleRemove(order)}
                  disabled={deletingId === order.id}
                  className="w-7 h-7 flex items-center justify-center transition-colors hover:bg-[#ff5c2b]/15 text-[#f2f0ea]/30 hover:text-[#ff5c2b] disabled:opacity-40"
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
        className=" overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <button
          type="button"
          onClick={() => setShowAddItems(v => !v)}
          className="w-full px-3 py-2 flex items-center gap-2 hover:bg-[#111113] transition-colors"
          style={{ borderBottom: showAddItems ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
        >
          <ShoppingCart size={12} className="text-[#f2f0ea]/40" />
          <span className="text-[11px] font-bold text-[#f2f0ea]/40 uppercase tracking-wider">Add Items</span>
          <span className="ml-auto text-[11px] text-[#f2f0ea]/30">{showAddItems ? '▲' : '▼'}</span>
        </button>

        {showAddItems && (
          loading ? (
            <div className="flex justify-center py-6">
              <Loader2 size={18} className="animate-spin text-[#f2f0ea]/30" />
            </div>
          ) : inventory.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6">
              <Package size={22} className="text-[#f2f0ea]/[0.14]" />
              <p className="text-xs text-[#f2f0ea]/30">No inventory items available</p>
            </div>
          ) : (
            <div className="p-2.5 grid grid-cols-2 gap-2">
              {inventory.map(item => {
                const qty = cartQty(item.id);
                return (
                  <div
                    key={item.id}
                    className=" p-2.5 transition-all"
                    style={{
                      background: qty > 0 ? 'rgba(251,146,60,0.08)' : 'rgba(255,255,255,0.03)',
                      border: qty > 0 ? '1px solid rgba(251,146,60,0.25)' : '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <span className="text-[12px] font-medium text-[#f2f0ea] leading-tight pr-1">{item.name}</span>
                      {qty > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#ff5c2b] text-[#f2f0ea] shrink-0">{qty}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold text-[#d8ff3c]">₹{item.price}</span>
                      <span className="text-[10px] text-[#f2f0ea]/30">{item.stock_quantity} left</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {qty > 0 ? (
                        <>
                          <button onClick={() => removeFromCart(item.id)} className="flex-1 h-6 flex items-center justify-center bg-white/[0.07] hover:bg-white/[0.11] text-[#f2f0ea]/70 transition-colors">
                            <Minus size={11} />
                          </button>
                          <button onClick={() => addToCart(item)} disabled={qty >= item.stock_quantity} className="flex-1 h-6 flex items-center justify-center bg-[#ff5c2b]/20 hover:bg-[#ff5c2b]/30 text-[#ff5c2b] transition-colors disabled:opacity-40">
                            <Plus size={11} />
                          </button>
                        </>
                      ) : (
                        <button onClick={() => addToCart(item)} className="w-full h-6 flex items-center justify-center gap-1 bg-white/[0.07] hover:bg-[#ff5c2b]/15 text-[#f2f0ea]/50 hover:text-[#ff5c2b] text-[11px] font-medium transition-all">
                          <Plus size={10} /> Add
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* Cart / confirm strip */}
        {cart.length > 0 && (
          <div className="px-3 py-2.5 border-t flex items-center justify-between gap-3" style={{ borderColor: 'rgba(251,146,60,0.15)', background: 'rgba(251,146,60,0.05)' }}>
            <div>
              <p className="text-[11px] text-[#f2f0ea]/40">{cartCount} item{cartCount !== 1 ? 's' : ''} in cart</p>
              <p className="text-sm font-bold text-[#ff5c2b]">₹{cartTotal.toLocaleString('en-IN')}</p>
            </div>
            <button
              onClick={handleAddToBooking}
              disabled={adding || addedAnim}
              className="flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-bold transition-all disabled:opacity-60"
              style={{ background: addedAnim ? 'rgba(16,185,129,0.18)' : 'rgba(251,146,60,0.20)', color: addedAnim ? '#d8ff3c' : '#ff5c2b', border: addedAnim ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(251,146,60,0.35)' }}
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
