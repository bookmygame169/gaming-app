"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  X, Plus, Minus, ShoppingCart, Search, Loader2, Check,
  Coffee, Cookie, Gift, GlassWater, Banknote, Smartphone, User, Lock, ChevronRight,
} from "lucide-react";
import { InventoryItem, InventoryCategory, CartItem, CATEGORY_LABELS } from "@/types/inventory";
import { fetchInventory, searchCustomersByName } from "@/app/owner/ownerLookup";
import { ownerApi } from '../ownerApi';

interface SnackSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  cafeId: string;
  onSaleComplete: () => void;
}

const CATEGORY_CONFIG: Record<InventoryCategory, { icon: React.ReactNode; color: string }> = {
  snacks:      { icon: <Cookie className="w-4 h-4" />,     color: "#ff5c2b" },
  cold_drinks: { icon: <GlassWater className="w-4 h-4" />, color: "#d8ff3c" },
  hot_drinks:  { icon: <Coffee className="w-4 h-4" />,     color: "#ff5c2b" },
  combo:       { icon: <Gift className="w-4 h-4" />,       color: "#d8ff3c" },
};

export default function SnackSaleModal({ isOpen, onClose, cafeId, onSaleComplete }: SnackSaleModalProps) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<InventoryCategory | "all">("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMode, setPaymentMode] = useState<"cash" | "online">("cash");

  // Customer autocomplete
  const [suggestions, setSuggestions] = useState<{ name: string; phone: string | null }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Owner-use state
  const [isOwnerUse, setIsOwnerUse] = useState(false);

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

  useEffect(() => {
    if (isOpen) {
      loadInventory();
      setCart([]);
      setSearchQuery("");
      setCustomerName("");
      setCustomerPhone("");
      setSuggestions([]);
      setShowSuggestions(false);
      setPaymentMode("cash");
      setDone(false);
      setIsOwnerUse(false);
    }
  }, [isOpen, loadInventory]);

  const searchCustomers = useCallback(async (query: string) => {
    if (query.trim().length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
    const [bookingMatches, profilesRes] = await Promise.all([
      searchCustomersByName<{ customer_name: string | null; customer_phone: string | null }>(cafeId, query),
      supabase
        .from("profiles")
        .select("first_name, last_name, phone")
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
        .limit(5),
    ]);

    const seen = new Set<string>();
    const results: { name: string; phone: string | null }[] = [];

    profilesRes.data?.forEach((p) => {
      const name = [p.first_name, p.last_name].filter(Boolean).join(" ");
      if (name && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        results.push({ name, phone: p.phone || null });
      }
    });

    bookingMatches.forEach((b) => {
      if (b.customer_name && !seen.has(b.customer_name.toLowerCase())) {
        seen.add(b.customer_name.toLowerCase());
        results.push({ name: b.customer_name, phone: b.customer_phone || null });
      }
    });

    setSuggestions(results);
    setShowSuggestions(results.length > 0);
  }, [cafeId]);

  useEffect(() => {
    const timer = setTimeout(() => searchCustomers(customerName), 300);
    return () => clearTimeout(timer);
  }, [customerName, searchCustomers]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredItems = items.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "all" || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const groupedItems = filteredItems.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, InventoryItem[]>);

  function addToCart(item: InventoryItem) {
    const existing = cart.find((c) => c.inventory_item_id === item.id);
    if (existing) {
      if (existing.quantity >= item.stock_quantity) return;
      setCart(cart.map((c) =>
        c.inventory_item_id === item.id
          ? { ...c, quantity: c.quantity + 1, total_price: (c.quantity + 1) * c.unit_price }
          : c
      ));
    } else {
      setCart([...cart, {
        inventory_item_id: item.id,
        name: item.name,
        quantity: 1,
        unit_price: item.price,
        total_price: item.price,
      }]);
    }
  }

  function removeFromCart(itemId: string) {
    const existing = cart.find((c) => c.inventory_item_id === itemId);
    if (!existing) return;
    if (existing.quantity <= 1) {
      setCart(cart.filter((c) => c.inventory_item_id !== itemId));
    } else {
      setCart(cart.map((c) =>
        c.inventory_item_id === itemId
          ? { ...c, quantity: c.quantity - 1, total_price: (c.quantity - 1) * c.unit_price }
          : c
      ));
    }
  }

  const cartTotal = cart.reduce((s, c) => s + c.total_price, 0);
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);

  // Confirm sale button clicked
  function handleConfirmClick() {
    if (cart.length === 0) return;
    submitSale();
  }

  async function submitSale() {
    setSaving(true);
    try {
      await ownerApi("/api/owner/snack-sale", {
        body: {
          cafeId,
          customerName: isOwnerUse ? "Owner" : (customerName.trim() || null),
          customerPhone: isOwnerUse ? null : (customerPhone.trim() || null),
          paymentMode: isOwnerUse ? "owner" : paymentMode,
          isOwnerUse,
          items: cart.map((c) => ({
            inventory_item_id: c.inventory_item_id,
            name: c.name,
            quantity: c.quantity,
            unit_price: c.unit_price,
            total_price: c.total_price,
          })),
        },
        fallbackMessage: 'Failed',
      });
      setDone(true);
      setTimeout(() => {
        onSaleComplete();
        onClose();
      }, 1200);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save sale");
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0b0b0c]/90 backdrop-blur-sm">
        <div className="w-full max-w-2xl max-h-[90vh] flex flex-col border border-[#f2f0ea]/10 bg-[#111113]/60 overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#f2f0ea]/10">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8  flex items-center justify-center ${isOwnerUse ? 'bg-[#d8ff3c]/15' : 'bg-[#ff5c2b]/15'}`}>
                <ShoppingCart size={16} className={isOwnerUse ? 'text-[#d8ff3c]' : 'text-[#ff5c2b]'} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-[#f2f0ea]">Snack Sale</h2>
                <p className="text-[11px] text-[#f2f0ea]/40">No gaming session required</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-white/[0.08]/60 text-[#f2f0ea]/50 hover:text-[#f2f0ea] transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Customer / Owner Toggle */}
            <div className="px-5 py-4 border-b border-[#f2f0ea]/10">
              <p className="text-[11px] text-[#f2f0ea]/40 font-medium uppercase tracking-wide mb-2.5">Who is this for?</p>
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setIsOwnerUse(false)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5  text-sm font-medium transition-all border ${
                    !isOwnerUse
                      ? "bg-[#ff5c2b]/15 border-[#ff5c2b]/40 text-[#ff5c2b]"
                      : "bg-[#f2f0ea]/[0.06] border-[#f2f0ea]/10 text-[#f2f0ea]/50 hover:border-[#f2f0ea]/40"
                  }`}
                >
                  <User size={14} /> Customer
                </button>
                <button
                  onClick={() => setIsOwnerUse(true)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5  text-sm font-medium transition-all border ${
                    isOwnerUse
                      ? "bg-[#d8ff3c]/15 border-[#d8ff3c]/40 text-[#d8ff3c]"
                      : "bg-[#f2f0ea]/[0.06] border-[#f2f0ea]/10 text-[#f2f0ea]/50 hover:border-[#f2f0ea]/40"
                  }`}
                >
                  <Lock size={14} /> Owner (Me)
                </button>
              </div>

              {/* Owner info notice */}
              {isOwnerUse ? (
                <div className="flex items-start gap-2 px-3 py-2.5 bg-[#d8ff3c]/8 border border-[#d8ff3c]/20">
                  <Lock size={12} className="text-[#d8ff3c] mt-0.5 shrink-0" />
                  <p className="text-[11px] text-[#d8ff3c]/80">
                    Recorded as owner use. <span className="font-semibold">Not counted in revenue.</span> PIN required to confirm.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative" ref={suggestionsRef}>
                    <label className="text-[11px] text-[#f2f0ea]/40 font-medium uppercase tracking-wide block mb-1.5">Customer Name (optional)</label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={e => { setCustomerName(e.target.value); setShowSuggestions(true); }}
                      onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                      placeholder="Walk-in customer"
                      autoComplete="off"
                      className="w-full px-3 py-2 bg-[#f2f0ea]/[0.06] border border-[#f2f0ea]/10 text-sm text-[#f2f0ea] placeholder-[#f2f0ea]/30 focus:outline-none focus:border-[#d8ff3c]/50"
                    />
                    {showSuggestions && suggestions.length > 0 && (
                      <div className="absolute z-10 left-0 right-0 mt-1 bg-[#f2f0ea]/[0.06] border border-[#f2f0ea]/10 overflow-hidden">
                        {suggestions.map((s, i) => (
                          <button
                            key={i}
                            type="button"
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => {
                              setCustomerName(s.name);
                              setCustomerPhone(s.phone || "");
                              setShowSuggestions(false);
                            }}
                            className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/[0.08]/60 transition-colors border-b border-[#f2f0ea]/10 last:border-0"
                          >
                            <div>
                              <p className="text-sm text-[#f2f0ea] font-medium">{s.name}</p>
                              {s.phone && <p className="text-[11px] text-[#f2f0ea]/40">{s.phone}</p>}
                            </div>
                            <ChevronRight size={12} className="text-[#f2f0ea]/30 shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-[11px] text-[#f2f0ea]/40 font-medium uppercase tracking-wide block mb-1.5">Phone (optional)</label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={e => setCustomerPhone(e.target.value)}
                      placeholder="9XXXXXXXXX"
                      className="w-full px-3 py-2 bg-[#f2f0ea]/[0.06] border border-[#f2f0ea]/10 text-sm text-[#f2f0ea] placeholder-[#f2f0ea]/30 focus:outline-none focus:border-[#d8ff3c]/50"
                    />
                  </div>
                </div>
              )}

              {/* Payment Mode — only for customer */}
              {!isOwnerUse && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => setPaymentMode("cash")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2  text-sm font-medium transition-all border ${
                      paymentMode === "cash"
                        ? "bg-[#d8ff3c]/15 border-[#d8ff3c]/40 text-[#d8ff3c]"
                        : "bg-[#f2f0ea]/[0.06] border-[#f2f0ea]/10 text-[#f2f0ea]/50 hover:border-[#f2f0ea]/40"
                    }`}
                  >
                    <Banknote size={14} /> Cash
                  </button>
                  <button
                    onClick={() => setPaymentMode("online")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2  text-sm font-medium transition-all border ${
                      paymentMode === "online"
                        ? "bg-[#d8ff3c]/15 border-[#d8ff3c]/40 text-[#d8ff3c]"
                        : "bg-[#f2f0ea]/[0.06] border-[#f2f0ea]/10 text-[#f2f0ea]/50 hover:border-[#f2f0ea]/40"
                    }`}
                  >
                    <Smartphone size={14} /> UPI / Online
                  </button>
                </div>
              )}
            </div>

            {/* Search + Category Filter */}
            <div className="px-5 py-3 border-b border-[#f2f0ea]/10 flex gap-2">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#f2f0ea]/40" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search items..."
                  className="w-full pl-8 pr-3 py-2 bg-[#f2f0ea]/[0.06] border border-[#f2f0ea]/10 text-sm text-[#f2f0ea] placeholder-[#f2f0ea]/30 focus:outline-none focus:border-[#d8ff3c]/50"
                />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {(["all", "snacks", "cold_drinks", "hot_drinks", "combo"] as const).map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2.5 py-1.5  text-[11px] font-medium transition-all border ${
                      selectedCategory === cat
                        ? "bg-[#ff5c2b]/15 border-[#ff5c2b]/30 text-[#ff5c2b]"
                        : "bg-[#f2f0ea]/[0.06] border-[#f2f0ea]/10 text-[#f2f0ea]/40 hover:text-[#f2f0ea]/70"
                    }`}
                  >
                    {cat === "all" ? "All" : CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>
            </div>

            {/* Items Grid */}
            <div className="px-5 py-4">
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-[#f2f0ea]/40" /></div>
              ) : items.length === 0 ? (
                <div className="text-center py-8 text-[#f2f0ea]/40 text-sm">No inventory items available</div>
              ) : (
                Object.entries(groupedItems).map(([category, categoryItems]) => {
                  const config = CATEGORY_CONFIG[category as InventoryCategory];
                  return (
                    <div key={category} className="mb-5">
                      <div className="flex items-center gap-1.5 mb-2.5">
                        <span style={{ color: config?.color }}>{config?.icon}</span>
                        <span className="text-xs font-semibold text-[#f2f0ea]/50 uppercase tracking-wide">
                          {CATEGORY_LABELS[category as InventoryCategory] || category}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {categoryItems.map(item => {
                          const cartItem = cart.find(c => c.inventory_item_id === item.id);
                          const qty = cartItem?.quantity || 0;
                          return (
                            <div
                              key={item.id}
                              className={`relative  p-3 border transition-all ${
                                qty > 0
                                  ? isOwnerUse ? "bg-[#d8ff3c]/10 border-[#d8ff3c]/30" : "bg-[#ff5c2b]/10 border-[#ff5c2b]/30"
                                  : "bg-[#f2f0ea]/[0.04] border-[#f2f0ea]/10 hover:border-[#f2f0ea]/30"
                              }`}
                            >
                              <div className="flex items-start justify-between mb-1.5">
                                <span className="text-sm font-medium text-[#f2f0ea] leading-tight pr-1">{item.name}</span>
                                {qty > 0 && (
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full text-[#0b0b0c] shrink-0 ${isOwnerUse ? 'bg-[#d8ff3c]' : 'bg-[#ff5c2b]'}`}>{qty}</span>
                                )}
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-[#d8ff3c]">₹{item.price}</span>
                                <span className="text-[10px] text-[#f2f0ea]/30">{item.stock_quantity} left</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-2">
                                {qty > 0 ? (
                                  <>
                                    <button onClick={() => removeFromCart(item.id)} className="flex-1 flex items-center justify-center h-7 bg-white/[0.08] hover:bg-white/[0.10] text-[#f2f0ea]/70 transition-colors">
                                      <Minus size={12} />
                                    </button>
                                    <button onClick={() => addToCart(item)} disabled={qty >= item.stock_quantity} className={`flex-1 flex items-center justify-center h-7  transition-colors disabled:opacity-40 ${isOwnerUse ? 'bg-[#d8ff3c]/20 hover:bg-[#d8ff3c]/30 text-[#d8ff3c]' : 'bg-[#ff5c2b]/20 hover:bg-[#ff5c2b]/30 text-[#ff5c2b]'}`}>
                                      <Plus size={12} />
                                    </button>
                                  </>
                                ) : (
                                  <button onClick={() => addToCart(item)} className={`w-full flex items-center justify-center gap-1 h-7  bg-white/[0.08] text-[#f2f0ea]/50 text-xs font-medium transition-all ${isOwnerUse ? 'hover:bg-[#d8ff3c]/20 hover:text-[#d8ff3c]' : 'hover:bg-[#ff5c2b]/20 hover:text-[#ff5c2b]'}`}>
                                    <Plus size={11} /> Add
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-[#f2f0ea]/10 px-5 py-4 bg-[#111113]">
            {cart.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {cart.map(c => (
                  <span key={c.inventory_item_id} className="text-[11px] px-2 py-0.5 bg-white/[0.08]/60 text-[#f2f0ea]/70 border border-[#f2f0ea]/10">
                    {c.name} ×{c.quantity} <span className={isOwnerUse ? 'text-[#d8ff3c]' : 'text-[#ff5c2b]'}>₹{c.total_price}</span>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="flex-1">
                {cart.length === 0 ? (
                  <p className="text-sm text-[#f2f0ea]/30">Add items to proceed</p>
                ) : (
                  <div>
                    <span className="text-xs text-[#f2f0ea]/40">{cartCount} item{cartCount !== 1 ? "s" : ""} · </span>
                    {isOwnerUse
                      ? <span className="text-base font-bold text-[#d8ff3c]">Owner Use</span>
                      : <span className="text-base font-bold text-[#f2f0ea]">₹{cartTotal.toLocaleString()}</span>
                    }
                  </div>
                )}
              </div>
              <button
                onClick={handleConfirmClick}
                disabled={cart.length === 0 || saving || done}
                className={`flex items-center gap-2 px-5 py-2.5  text-sm font-semibold transition-all ${
                  done
                    ? "bg-[#d8ff3c]/20 text-[#d8ff3c] border border-[#d8ff3c]/30"
                    : cart.length === 0
                    ? "bg-[#f2f0ea]/[0.06] text-[#f2f0ea]/30 cursor-not-allowed"
                    : isOwnerUse
                    ? "bg-[#d8ff3c] hover:bg-[#d8ff3c] text-[#0b0b0c]"
                    : "bg-[#ff5c2b] hover:bg-[#ff5c2b] text-[#f2f0ea]/20"
                }`}
              >
                {done ? <><Check size={14} /> Saved!</>
                  : saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                  : isOwnerUse ? <><Lock size={14} /> Confirm Owner Use</>
                  : "Confirm Sale"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
