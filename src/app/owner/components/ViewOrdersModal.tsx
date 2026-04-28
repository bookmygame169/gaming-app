// View Orders Modal - For viewing, adding, and removing F&B items from bookings
// Can be removed along with inventory feature
"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { adjustInventoryStockBatch } from "@/lib/inventoryStock";
import { X, Trash2, Loader2, ShoppingBag, Package, Plus, Minus } from "lucide-react";
import { BookingOrder, InventoryItem } from "@/types/inventory";

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

function isMissingBookingsUpdatedAtError(error: { message?: string | null } | null | undefined): boolean {
  const message = error?.message?.toLowerCase() || "";
  return message.includes("bookings.updated_at") && message.includes("does not exist");
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
      const { data, error } = await supabase
        .from("booking_orders")
        .select("*")
        .eq("booking_id", bookingId)
        .order("ordered_at", { ascending: false });

      if (error) throw error;
      const nextOrders = data || [];
      setOrders(nextOrders);
      return nextOrders;
    } catch (err) {
      console.error("Error loading orders:", err);
      return [];
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  async function loadBookingUpdatedAt(): Promise<string | null> {
    const { data, error } = await supabase
      .from("bookings")
      .select("updated_at")
      .eq("id", bookingId)
      .single();

    if (error) {
      if (!isMissingBookingsUpdatedAtError(error)) {
        console.error("Error fetching booking metadata:", error);
      }
      return null;
    }

    return data?.updated_at ?? null;
  }

  const loadInventory = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("inventory_items")
        .select("*")
        .eq("cafe_id", cafeId)
        .eq("is_available", true)
        .gt("stock_quantity", 0)
        .order("name");

      if (error) throw error;
      setInventoryItems(data || []);
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

      await adjustInventoryStockBatch(
        supabase,
        [{ inventoryItemId: order.inventory_item_id, quantity: order.quantity }],
        "restore"
      );

      const { error: deleteError } = await supabase
        .from("booking_orders")
        .delete()
        .eq("id", order.id);

      if (deleteError) {
        await adjustInventoryStockBatch(
          supabase,
          [{ inventoryItemId: order.inventory_item_id, quantity: order.quantity }],
          "deduct"
        );
        throw deleteError;
      }

      // Refresh orders list and inventory
      const latestOrders = await loadOrders();
      await loadInventory();
      const updatedAt = await loadBookingUpdatedAt();
      onOrdersUpdated({
        amountDelta: -(Number(order.total_price) || 0),
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

    // Make a copy of cart to avoid any state issues
    const cartSnapshot = [...cart];

    try {
      setAdding(true);

      // Calculate total from cart snapshot
      let totalToAdd = 0;
      const orderRecords = cartSnapshot.map((c) => {
        const itemTotal = c.item.price * c.quantity;
        totalToAdd += itemTotal;
        return {
          booking_id: bookingId,
          inventory_item_id: c.item.id,
          item_name: c.item.name,
          quantity: c.quantity,
          unit_price: c.item.price,
          total_price: itemTotal,
        };
      });


      const stockAdjustments = cartSnapshot.map((cartItem) => ({
        inventoryItemId: cartItem.item.id,
        quantity: cartItem.quantity,
      }));

      await adjustInventoryStockBatch(supabase, stockAdjustments, "deduct");

      const { error: orderError } = await supabase
        .from("booking_orders")
        .insert(orderRecords);

      if (orderError) {
        console.error("Error inserting orders:", orderError);
        await adjustInventoryStockBatch(supabase, stockAdjustments, "restore");
        throw orderError;
      }

      // Clear cart, refresh orders and inventory
      setCart([]);
      setShowAddSection(false);
      const latestOrders = await loadOrders();
      await loadInventory();
      const updatedAt = await loadBookingUpdatedAt();
      onOrdersUpdated({
        amountDelta: totalToAdd,
        bookingId,
        orders: latestOrders,
        updatedAt,
      });
    } catch (err) {
      console.error("Error adding items:", err);
      alert("Failed to add items. Please try again.");
    } finally {
      setAdding(false);
    }
  }

  const totalAmount = orders.reduce((sum, o) => sum + (o.total_price || 0), 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
      <div className="bg-white/[0.03] border border-white/[0.09] rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/[0.09]">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-cyan-500" />
              F&B Orders
            </h3>
            <p className="text-sm text-slate-400 mt-0.5">
              {customerName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/[0.06] rounded-lg transition"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Orders List */}
          <div className="p-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
              </div>
            ) : orders.length === 0 && !showAddSection ? (
              <div className="text-center py-8">
                <Package className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">No F&B items added</p>
                <p className="text-sm text-slate-500 mt-1">
                  Click below to add items
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {orders.map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between p-3 bg-white/[0.04] border border-white/[0.09] rounded-xl"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white">
                        {order.item_name}
                      </div>
                      <div className="flex items-center gap-3 text-sm mt-1">
                        <span className="text-slate-400">
                          ₹{order.unit_price} × {order.quantity}
                        </span>
                        <span className="text-cyan-400 font-semibold">
                          ₹{order.total_price}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
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
                      className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition disabled:opacity-50"
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
            <div className="border-t border-white/[0.09] p-4">
              <h4 className="text-sm font-semibold text-slate-300 mb-3">Add Items</h4>
              {inventoryItems.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">
                  No items available in inventory
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {inventoryItems.map((item) => {
                    const inCart = getCartQuantity(item.id);
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-2 bg-white/[0.03] rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-white truncate">
                            {item.name}
                          </div>
                          <div className="text-xs text-slate-400">
                            ₹{item.price} · {item.stock_quantity} left
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {inCart > 0 ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => removeFromCart(item.id)}
                                className="p-1 bg-white/[0.08] hover:bg-white/[0.10] rounded text-white"
                              >
                                <Minus className="w-4 h-4" />
                              </button>
                              <span className="w-6 text-center text-white font-medium">
                                {inCart}
                              </span>
                              <button
                                onClick={() => addToCart(item)}
                                disabled={inCart >= item.stock_quantity}
                                className="p-1 bg-cyan-600 hover:bg-cyan-500 rounded text-white disabled:opacity-50"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => addToCart(item)}
                              className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-sm rounded-lg transition"
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
                <div className="mt-4 pt-3 border-t border-white/[0.09]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-slate-400">Cart Total</span>
                    <span className="text-lg font-bold text-cyan-400">₹{cartTotal}</span>
                  </div>
                  <button
                    onClick={handleAddItems}
                    disabled={adding}
                    className="w-full px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
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
          <div className="border-t border-white/[0.09] p-4">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Total F&B Amount</span>
              <span className="text-xl font-bold text-cyan-400">₹{totalAmount}</span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="p-4 pt-0 flex gap-2">
          {!showAddSection ? (
            <>
              <button
                onClick={() => setShowAddSection(true)}
                className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-medium transition flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Items
              </button>
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 bg-white/[0.06] hover:bg-white/[0.08] text-white rounded-xl font-medium transition"
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
              className="w-full px-4 py-2.5 bg-white/[0.06] hover:bg-white/[0.08] text-white rounded-xl font-medium transition"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
