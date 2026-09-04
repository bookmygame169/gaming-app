// Add Items Modal - For adding F&B items to active bookings
// Can be removed along with inventory feature
"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchInventory } from "@/app/owner/ownerLookup";
import {
  X,
  Plus,
  Minus,
  ShoppingCart,
  Search,
  Loader2,
  Check,
  Coffee,
  Cookie,
  Gift,
  GlassWater,
  Package,
} from "lucide-react";
import {
  InventoryItem,
  InventoryCategory,
  CartItem,
  CATEGORY_LABELS,
} from "@/types/inventory";
import { ownerApi } from '../ownerApi';

interface AddItemsModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingId: string;
  cafeId: string;
  customerName: string;
  onItemsAdded: () => void;
}

const CATEGORY_CONFIG: Record<InventoryCategory, { icon: React.ReactNode; color: string }> = {
  snacks: { icon: <Cookie className="w-4 h-4" />, color: "#ff5c2b" },
  cold_drinks: { icon: <GlassWater className="w-4 h-4" />, color: "#d8ff3c" },
  hot_drinks: { icon: <Coffee className="w-4 h-4" />, color: "#ff5c2b" },
  combo: { icon: <Gift className="w-4 h-4" />, color: "#d8ff3c" },
};

export default function AddItemsModal({
  isOpen,
  onClose,
  bookingId,
  cafeId,
  customerName,
  onItemsAdded,
}: AddItemsModalProps) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<InventoryCategory | "all">("all");
  const [cart, setCart] = useState<CartItem[]>([]);

  const loadInventory = useCallback(async () => {
    try {
      setLoading(true);
      setItems(await fetchInventory<InventoryItem>(cafeId, { availableOnly: true, inStockOnly: true }));
    } catch (err) {
      console.error("Error loading inventory:", err);
    } finally {
      setLoading(false);
    }
  }, [cafeId]);

  // Load inventory
  useEffect(() => {
    if (isOpen) {
      loadInventory();
      setCart([]);
      setSearchQuery("");
    }
  }, [isOpen, cafeId, loadInventory]);

  // Filter items
  const filteredItems = items.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "all" || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Group by category
  const groupedItems = filteredItems.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, InventoryItem[]>);

  // Add to cart
  function addToCart(item: InventoryItem) {
    const existing = cart.find((c) => c.inventory_item_id === item.id);
    if (existing) {
      // Check stock limit
      if (existing.quantity >= item.stock_quantity) return;
      setCart(
        cart.map((c) =>
          c.inventory_item_id === item.id
            ? { ...c, quantity: c.quantity + 1, total_price: (c.quantity + 1) * c.unit_price }
            : c
        )
      );
    } else {
      setCart([
        ...cart,
        {
          inventory_item_id: item.id,
          name: item.name,
          quantity: 1,
          unit_price: item.price,
          total_price: item.price,
        },
      ]);
    }
  }

  // Remove from cart
  function removeFromCart(itemId: string) {
    const existing = cart.find((c) => c.inventory_item_id === itemId);
    if (!existing) return;

    if (existing.quantity === 1) {
      setCart(cart.filter((c) => c.inventory_item_id !== itemId));
    } else {
      setCart(
        cart.map((c) =>
          c.inventory_item_id === itemId
            ? { ...c, quantity: c.quantity - 1, total_price: (c.quantity - 1) * c.unit_price }
            : c
        )
      );
    }
  }

  // Get cart quantity for item
  function getCartQuantity(itemId: string): number {
    return cart.find((c) => c.inventory_item_id === itemId)?.quantity || 0;
  }

  // Calculate total
  const cartTotal = cart.reduce((sum, item) => sum + item.total_price, 0);

  // Save order
  async function handleSave() {
    if (cart.length === 0) return;

    try {
      setSaving(true);

      await ownerApi("/api/owner/booking-orders", {
        body: {
          bookingId,
          items: cart.map((item) => ({
            inventory_item_id: item.inventory_item_id,
            quantity: item.quantity,
          })),
        },
        fallbackMessage: 'Failed to add items',
      });

      setCart([]);
      await loadInventory();
      onItemsAdded();
      onClose();
    } catch (err) {
      console.error("Error saving order:", err);
      alert(err instanceof Error ? err.message : "Failed to add items. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0b0b0c]/90 backdrop-blur-sm">
      <div className="border border-[#f2f0ea]/10 bg-[#111113] w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#f2f0ea]/10">
          <div>
            <h3 className="text-xl font-bold text-[#f2f0ea] flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-[#d8ff3c]" />
              Add Items
            </h3>
            <p className="text-sm text-[#f2f0ea]/50 mt-0.5">
              Customer: {customerName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#f2f0ea]/[0.06] transition"
          >
            <X className="w-5 h-5 text-[#f2f0ea]/50" />
          </button>
        </div>

        {/* Search & Filter */}
        <div className="p-4 border-b border-[#f2f0ea]/10 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#f2f0ea]/50" />
            <input
              type="text"
              placeholder="Search items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-[#f2f0ea]/[0.06] border border-[#f2f0ea]/10 text-[#f2f0ea] placeholder-[#f2f0ea]/50 focus:outline-none focus:border-[#d8ff3c]"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedCategory("all")}
              className={`px-3 py-1.5  text-sm font-medium whitespace-nowrap transition ${
                selectedCategory === "all"
                  ? "bg-[#d8ff3c] text-[#0b0b0c]"
                  : "bg-[#f2f0ea]/[0.06] text-[#f2f0ea]/70 hover:bg-white/[0.08]"
              }`}
            >
              All
            </button>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
              const config = CATEGORY_CONFIG[key as InventoryCategory];
              return (
                <button
                  key={key}
                  onClick={() => setSelectedCategory(key as InventoryCategory)}
                  className={`flex items-center gap-1.5 px-3 py-1.5  text-sm font-medium whitespace-nowrap transition ${
                    selectedCategory === key
                      ? "text-[#f2f0ea]"
                      : "bg-[#f2f0ea]/[0.06] text-[#f2f0ea]/70 hover:bg-white/[0.08]"
                  }`}
                  style={selectedCategory === key ? { backgroundColor: config.color } : {}}
                >
                  {config.icon}
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#d8ff3c]" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-12 h-12 text-[#f2f0ea]/30 mx-auto mb-3" />
              <p className="text-[#f2f0ea]/50">No items available</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedItems).map(([category, categoryItems]) => {
                const config = CATEGORY_CONFIG[category as InventoryCategory];
                return (
                  <div key={category}>
                    <div className="flex items-center gap-2 mb-3">
                      <div
                        className="p-1.5 "
                        style={{ backgroundColor: `${config.color}20` }}
                      >
                        <div style={{ color: config.color }}>{config.icon}</div>
                      </div>
                      <h4 className="font-semibold text-[#f2f0ea]">
                        {CATEGORY_LABELS[category as InventoryCategory]}
                      </h4>
                    </div>

                    <div className="grid gap-2">
                      {categoryItems.map((item) => {
                        const qty = getCartQuantity(item.id);
                        const isMaxed = qty >= item.stock_quantity;

                        return (
                          <div
                            key={item.id}
                            className={`flex items-center justify-between p-3  border transition ${
                              qty > 0
                                ? "bg-[#d8ff3c]/10 border-[#d8ff3c]/30"
                                : "bg-[#f2f0ea]/[0.04] border-[#f2f0ea]/10 hover:border-[#f2f0ea]/30"
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-[#f2f0ea] truncate">
                                {item.name}
                              </div>
                              <div className="text-sm text-[#d8ff3c] font-semibold">
                                ₹{item.price}
                              </div>
                              <div className="text-xs text-[#f2f0ea]/40">
                                Stock: {item.stock_quantity}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {qty > 0 ? (
                                <>
                                  <button
                                    onClick={() => removeFromCart(item.id)}
                                    className="w-8 h-8 flex items-center justify-center bg-white/[0.08] hover:bg-white/[0.10] text-[#f2f0ea] transition"
                                  >
                                    <Minus className="w-4 h-4" />
                                  </button>
                                  <span className="w-8 text-center font-bold text-[#f2f0ea]">
                                    {qty}
                                  </span>
                                  <button
                                    onClick={() => addToCart(item)}
                                    disabled={isMaxed}
                                    className="w-8 h-8 flex items-center justify-center bg-[#d8ff3c] hover:bg-[#d8ff3c] text-[#0b0b0c] transition disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <Plus className="w-4 h-4" />
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => addToCart(item)}
                                  className="px-4 py-2 bg-[#d8ff3c] hover:bg-[#d8ff3c] text-[#0b0b0c] text-sm font-medium transition"
                                >
                                  Add
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Cart Summary & Actions */}
        <div className="border-t border-[#f2f0ea]/10 p-4">
          {cart.length > 0 && (
            <div className="mb-4 space-y-2">
              <div className="text-sm text-[#f2f0ea]/50">Cart Items:</div>
              <div className="flex flex-wrap gap-2">
                {cart.map((item) => (
                  <div
                    key={item.inventory_item_id}
                    className="flex items-center gap-2 px-3 py-1.5 bg-[#f2f0ea]/[0.06] text-sm"
                  >
                    <span className="text-[#f2f0ea]">{item.name}</span>
                    <span className="text-[#f2f0ea]/50">x{item.quantity}</span>
                    <span className="text-[#d8ff3c]">₹{item.total_price}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-[#f2f0ea]/50">Total</div>
              <div className="text-2xl font-bold text-[#d8ff3c]">₹{cartTotal}</div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-6 py-2.5 bg-[#f2f0ea]/[0.06] hover:bg-white/[0.08] text-[#f2f0ea] font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={cart.length === 0 || saving}
                className="px-6 py-2.5 bg-[#d8ff3c] hover:bg-[#d8ff3c] text-[#0b0b0c] font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Add to Bill
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
