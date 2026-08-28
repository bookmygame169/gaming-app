// View Orders Modal - For viewing, adding, and removing F&B items from bookings
// Can be removed along with inventory feature
"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Trash2, Loader2, ShoppingBag, Package, Plus, Minus } from "lucide-react";
import { BookingOrder, InventoryItem } from "@/types/inventory";
import { fetchBookingUpdatedAt, fetchInventory, fetchOrdersForBooking } from "@/app/owner/ownerLookup";

interface ViewOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingId: string;
  cafeId: string;
  customerName: string;
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

export default function ViewOrdersModal({
  isOpen,
  onClose,
  bookingId,
  cafeId,
  customerName,
  onOrdersUpdated,
}: ViewOrdersModalProps) {
  const [orders, setOrders] = useState<BookingOrder[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showAddSection, setShowAddSection] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [adding, setAdding] = useState(false);

  const loadOrders = useCallback(async (): Promise<BookingOrder[]> => {
    try {
      setLoading(true);
      const nextOrders = await fetchOrdersForBooking<BookingOrder>(cafeId, bookingId);
      setOrders(nextOrders);
      return nextOrders;
    } catch (err) {
      console.error("Error loading orders:", err);
      return [];
    } finally {
      setLoading(false);
    }
  }, [bookingId, cafeId]);

  async function loadBookingUpdatedAt(): Promise<string | null> {
    return fetchBookingUpdatedAt(cafeId, bookingId);
  }

  const loadInventory = useCallback(async () => {
    try {
      setInventoryItems(
        await fetchInventory<InventoryItem>(cafeId, { availableOnly: true, inStockOnly: true, orderBy: "name" })
      );
    } catch (err) {
      console.error("Error loading inventory:", err);
    }
  }, [cafeId]);

  useEffect(() => {
    if (isOpen && bookingId) {
      loadOrders();
      loadInventory();
      setCart([]);
      setShowAddSection(false);
    }
  }, [isOpen, bookingId, loadOrders, loadInventory]);

  async function handleRemoveOrder(order: BookingOrder) {
    if (!confirm(`Remove ${order.item_name} x${order.quantity} from this booking?`)) {
      return;
    }

    try {
      setDeleting(order.id);

      const res = await fetch(`/api/owner/booking-orders?orderId=${encodeURIComponent(order.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(result.error || "Failed to remove item");
      }

      // Refresh orders list and inventory
      const latestOrders = await loadOrders();
      await loadInventory();
      const updatedAt = await loadBookingUpdatedAt();
      onOrdersUpdated({
        amountDelta: -(Number(result.amountRemoved ?? order.total_price) || 0),
        bookingId,
        orders: latestOrders,
        updatedAt,
      });
    } catch (err) {
      console.error("Error removing order:", err);
      alert("Failed to remove item. Please try again.");
    } finally {
      setDeleting(null);
    }
  }

  function addToCart(item: InventoryItem) {
    const existing = cart.find((c) => c.item.id === item.id);
    if (existing) {
      if (existing.quantity < item.stock_quantity) {
        setCart(
          cart.map((c) =>
            c.item.id === item.id ? { ...c, quantity: c.quantity + 1 } : c
          )
        );
      }
    } else {
      setCart([...cart, { item, quantity: 1 }]);
    }
  }

  function removeFromCart(itemId: string) {
    const existing = cart.find((c) => c.item.id === itemId);
    if (existing && existing.quantity > 1) {
      setCart(
        cart.map((c) =>
          c.item.id === itemId ? { ...c, quantity: c.quantity - 1 } : c
        )
      );
    } else {
      setCart(cart.filter((c) => c.item.id !== itemId));
    }
  }

  function getCartQuantity(itemId: string): number {
    return cart.find((c) => c.item.id === itemId)?.quantity || 0;
  }

  const cartTotal = cart.reduce((sum, c) => sum + c.item.price * c.quantity, 0);

  async function handleAddItems() {
    if (cart.length === 0) return;

    try {
      setAdding(true);

      const res = await fetch("/api/owner/booking-orders", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          items: cart.map((cartItem) => ({
            inventory_item_id: cartItem.item.id,
            quantity: cartItem.quantity,
          })),
        }),
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(result.error || "Failed to add items");
      }

      // Clear cart, refresh orders and inventory
      setCart([]);
      setShowAddSection(false);
      const latestOrders = await loadOrders();
      await loadInventory();
      const updatedAt = await loadBookingUpdatedAt();
      onOrdersUpdated({
        amountDelta: Number(result.amountAdded || 0),
        bookingId,
        orders: latestOrders,
        updatedAt,
      });
    } catch (err) {
      console.error("Error adding items:", err);
      alert(err instanceof Error ? err.message : "Failed to add items. Please try again.");
    } finally {
      setAdding(false);
    }
  }

  const totalAmount = orders.reduce((sum, o) => sum + (o.total_price || 0), 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0b0b0c]/90 backdrop-blur-sm">
      <div className="border border-[#f2f0ea]/10 bg-[#111113] w-full max-w-md max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#f2f0ea]/10">
          <div>
            <h3 className="text-lg font-bold text-[#f2f0ea] flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-[#d8ff3c]" />
              F&B Orders
            </h3>
            <p className="text-sm text-[#f2f0ea]/50 mt-0.5">
              {customerName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#f2f0ea]/[0.06] transition"
          >
            <X className="w-5 h-5 text-[#f2f0ea]/50" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Orders List */}
          <div className="p-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-[#d8ff3c]" />
              </div>
            ) : orders.length === 0 && !showAddSection ? (
              <div className="text-center py-8">
                <Package className="w-12 h-12 text-[#f2f0ea]/30 mx-auto mb-3" />
                <p className="text-[#f2f0ea]/50">No F&B items added</p>
                <p className="text-sm text-[#f2f0ea]/40 mt-1">
                  Click below to add items
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {orders.map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between p-3 bg-[#f2f0ea]/[0.04] border border-[#f2f0ea]/10 "
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-[#f2f0ea]">
                        {order.item_name}
                      </div>
                      <div className="flex items-center gap-3 text-sm mt-1">
                        <span className="text-[#f2f0ea]/50">
                          ₹{order.unit_price} × {order.quantity}
                        </span>
                        <span className="text-[#d8ff3c] font-semibold">
                          ₹{order.total_price}
                        </span>
                      </div>
                      <div className="text-xs text-[#f2f0ea]/40 mt-1">
                        {new Date(order.ordered_at).toLocaleString("en-IN", {
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveOrder(order)}
                      disabled={deleting === order.id}
                      className="p-2 text-[#ff5c2b] hover:bg-[#ff5c2b]/10 transition disabled:opacity-50"
                      title="Remove item"
                    >
                      {deleting === order.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Items Section */}
          {showAddSection && (
            <div className="border-t border-[#f2f0ea]/10 p-4">
              <h4 className="text-sm font-semibold text-[#f2f0ea]/70 mb-3">Add Items</h4>
              {inventoryItems.length === 0 ? (
                <p className="text-sm text-[#f2f0ea]/40 text-center py-4">
                  No items available in inventory
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {inventoryItems.map((item) => {
                    const inCart = getCartQuantity(item.id);
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-2 bg-[#111113] "
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-[#f2f0ea] truncate">
                            {item.name}
                          </div>
                          <div className="text-xs text-[#f2f0ea]/50">
                            ₹{item.price} · {item.stock_quantity} left
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {inCart > 0 ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => removeFromCart(item.id)}
                                className="p-1 bg-white/[0.08] hover:bg-white/[0.10] rounded text-[#f2f0ea]"
                              >
                                <Minus className="w-4 h-4" />
                              </button>
                              <span className="w-6 text-center text-[#f2f0ea] font-medium">
                                {inCart}
                              </span>
                              <button
                                onClick={() => addToCart(item)}
                                disabled={inCart >= item.stock_quantity}
                                className="p-1 bg-[#d8ff3c] hover:bg-[#d8ff3c] rounded text-[#f2f0ea] disabled:opacity-50"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => addToCart(item)}
                              className="px-3 py-1 bg-[#d8ff3c] hover:bg-[#d8ff3c] text-[#f2f0ea] text-sm transition"
                            >
                              Add
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Cart Summary */}
              {cart.length > 0 && (
                <div className="mt-4 pt-3 border-t border-[#f2f0ea]/10">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-[#f2f0ea]/50">Cart Total</span>
                    <span className="text-lg font-bold text-[#d8ff3c]">₹{cartTotal}</span>
                  </div>
                  <button
                    onClick={handleAddItems}
                    disabled={adding}
                    className="w-full px-4 py-2.5 bg-[#d8ff3c] hover:bg-[#d8ff3c] text-[#f2f0ea] font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {adding ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        Add to Order
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {orders.length > 0 && (
          <div className="border-t border-[#f2f0ea]/10 p-4">
            <div className="flex items-center justify-between">
              <span className="text-[#f2f0ea]/50">Total F&B Amount</span>
              <span className="text-xl font-bold text-[#d8ff3c]">₹{totalAmount}</span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="p-4 pt-0 flex gap-2">
          {!showAddSection ? (
            <>
              <button
                onClick={() => setShowAddSection(true)}
                className="flex-1 px-4 py-2.5 bg-[#d8ff3c] hover:bg-[#d8ff3c] text-[#f2f0ea] font-medium transition flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Items
              </button>
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 bg-[#f2f0ea]/[0.06] hover:bg-white/[0.08] text-[#f2f0ea] font-medium transition"
              >
                Close
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                setShowAddSection(false);
                setCart([]);
              }}
              className="w-full px-4 py-2.5 bg-[#f2f0ea]/[0.06] hover:bg-white/[0.08] text-[#f2f0ea] font-medium transition"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
