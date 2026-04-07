"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  X, Plus, Minus, ShoppingCart, Search, Loader2, Check,
  Coffee, Cookie, Gift, GlassWater, Banknote, Smartphone, User, Lock, ChevronRight,
} from "lucide-react";
import { InventoryItem, InventoryCategory, CartItem, CATEGORY_LABELS } from "@/types/inventory";

interface SnackSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  cafeId: string;
  onSaleComplete: () => void;
}

const CATEGORY_CONFIG: Record<InventoryCategory, { icon: React.ReactNode; color: string }> = {
  snacks:      { icon: <Cookie className="w-4 h-4" />,     color: "#f59e0b" },
  cold_drinks: { icon: <GlassWater className="w-4 h-4" />, color: "#06b6d4" },
  hot_drinks:  { icon: <Coffee className="w-4 h-4" />,     color: "#ef4444" },
  combo:       { icon: <Gift className="w-4 h-4" />,       color: "#8b5cf6" },
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
      const { data, error } = await supabase
        .from("inventory_items")
        .select("*")
        .eq("cafe_id", cafeId)
        .eq("is_available", true)
        .gt("stock_quantity", 0)
        .order("category")
        .order("name");
      if (error) throw error;
      setItems(data || []);
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
    const [bookingsRes, profilesRes] = await Promise.all([
      supabase
        .from("bookings")
        .select("customer_name, customer_phone")
        .eq("cafe_id", cafeId)
        .ilike("customer_name", `%${query}%`)
        .not("customer_name", "is", null)
        .limit(8),
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

    bookingsRes.data?.forEach((b) => {
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
      const res = await fetch("/api/owner/snack-sale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed");
      }
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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-700/60 shadow-2xl overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/40">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isOwnerUse ? 'bg-purple-500/15' : 'bg-orange-500/15'}`}>
                <ShoppingCart size={16} className={isOwnerUse ? 'text-purple-400' : 'text-orange-400'} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-100">Snack Sale</h2>
                <p className="text-[11px] text-slate-500">No gaming session required</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-700/60 text-slate-400 hover:text-slate-200 transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Customer / Owner Toggle */}
            <div className="px-5 py-4 border-b border-slate-700/30">
              <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wide mb-2.5">Who is this for?</p>
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setIsOwnerUse(false)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                    !isOwnerUse
                      ? "bg-orange-500/15 border-orange-500/40 text-orange-400"
                      : "bg-slate-800 border-slate-600/40 text-slate-400 hover:border-slate-500"
                  }`}
                >
                  <User size={14} /> Customer
                </button>
                <button
                  onClick={() => setIsOwnerUse(true)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                    isOwnerUse
                      ? "bg-purple-500/15 border-purple-500/40 text-purple-400"
                      : "bg-slate-800 border-slate-600/40 text-slate-400 hover:border-slate-500"
                  }`}
                >
                  <Lock size={14} /> Owner (Me)
                </button>
              </div>

              {/* Owner info notice */}
              {isOwnerUse ? (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-purple-500/8 border border-purple-500/20">
                  <Lock size={12} className="text-purple-400 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-purple-300/80">
                    Recorded as owner use. <span className="font-semibold">Not counted in revenue.</span> PIN required to confirm.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative" ref={suggestionsRef}>
                    <label className="text-[11px] text-slate-500 font-medium uppercase tracking-wide block mb-1.5">Customer Name (optional)</label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={e => { setCustomerName(e.target.value); setShowSuggestions(true); }}
                      onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                      placeholder="Walk-in customer"
                      autoComplete="off"
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600/50 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
                    />
                    {showSuggestions && suggestions.length > 0 && (
                      <div className="absolute z-10 left-0 right-0 mt-1 rounded-xl bg-slate-800 border border-slate-600/60 shadow-xl overflow-hidden">
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
                            className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-700/60 transition-colors border-b border-slate-700/30 last:border-0"
                          >
                            <div>
                              <p className="text-sm text-slate-200 font-medium">{s.name}</p>
                              {s.phone && <p className="text-[11px] text-slate-500">{s.phone}</p>}
                            </div>
                            <ChevronRight size={12} className="text-slate-600 shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 font-medium uppercase tracking-wide block mb-1.5">Phone (optional)</label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={e => setCustomerPhone(e.target.value)}
                      placeholder="9XXXXXXXXX"
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600/50 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
                    />
                  </div>
                </div>
              )}

              {/* Payment Mode — only for customer */}
              {!isOwnerUse && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => setPaymentMode("cash")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all border ${
                      paymentMode === "cash"
                        ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                        : "bg-slate-800 border-slate-600/40 text-slate-400 hover:border-slate-500"
                    }`}
                  >
                    <Banknote size={14} /> Cash
                  </button>
                  <button
                    onClick={() => setPaymentMode("online")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all border ${
                      paymentMode === "online"
                        ? "bg-blue-500/15 border-blue-500/40 text-blue-400"
                        : "bg-slate-800 border-slate-600/40 text-slate-400 hover:border-slate-500"
                    }`}
                  >
                    <Smartphone size={14} /> UPI / Online
                  </button>
                </div>
              )}
            </div>

            {/* Search + Category Filter */}
            <div className="px-5 py-3 border-b border-slate-700/30 flex gap-2">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search items..."
                  className="w-full pl-8 pr-3 py-2 rounded-lg bg-slate-800 border border-slate-600/50 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
                />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {(["all", "snacks", "cold_drinks", "hot_drinks", "combo"] as const).map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
                      selectedCategory === cat
                        ? "bg-orange-500/15 border-orange-500/30 text-orange-400"
                        : "bg-slate-800 border-slate-600/40 text-slate-500 hover:text-slate-300"
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
                <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
              ) : items.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">No inventory items available</div>
              ) : (
                Object.entries(groupedItems).map(([category, categoryItems]) => {
                  const config = CATEGORY_CONFIG[category as InventoryCategory];
                  return (
                    <div key={category} className="mb-5">
                      <div className="flex items-center gap-1.5 mb-2.5">
                        <span style={{ color: config?.color }}>{config?.icon}</span>
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
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
                              className={`relative rounded-xl p-3 border transition-all ${
                                qty > 0
                                  ? isOwnerUse ? "bg-purple-500/10 border-purple-500/30" : "bg-orange-500/10 border-orange-500/30"
                                  : "bg-slate-800/60 border-slate-700/40 hover:border-slate-600"
                              }`}
                            >
                              <div className="flex items-start justify-between mb-1.5">
                                <span className="text-sm font-medium text-slate-200 leading-tight pr-1">{item.name}</span>
                                {qty > 0 && (
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white shrink-0 ${isOwnerUse ? 'bg-purple-500' : 'bg-orange-500'}`}>{qty}</span>
                                )}
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-emerald-400">₹{item.price}</span>
                                <span className="text-[10px] text-slate-600">{item.stock_quantity} left</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-2">
                                {qty > 0 ? (
                                  <>
                                    <button onClick={() => removeFromCart(item.id)} className="flex-1 flex items-center justify-center h-7 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors">
                                      <Minus size={12} />
                                    </button>
                                    <button onClick={() => addToCart(item)} disabled={qty >= item.stock_quantity} className={`flex-1 flex items-center justify-center h-7 rounded-lg transition-colors disabled:opacity-40 ${isOwnerUse ? 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-400' : 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-400'}`}>
                                      <Plus size={12} />
                                    </button>
                                  </>
                                ) : (
                                  <button onClick={() => addToCart(item)} className={`w-full flex items-center justify-center gap-1 h-7 rounded-lg bg-slate-700 text-slate-400 text-xs font-medium transition-all ${isOwnerUse ? 'hover:bg-purple-500/20 hover:text-purple-400' : 'hover:bg-orange-500/20 hover:text-orange-400'}`}>
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
          <div className="border-t border-slate-700/40 px-5 py-4 bg-slate-900">
            {cart.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {cart.map(c => (
                  <span key={c.inventory_item_id} className="text-[11px] px-2 py-0.5 rounded-md bg-slate-700/60 text-slate-300 border border-slate-600/30">
                    {c.name} ×{c.quantity} <span className={isOwnerUse ? 'text-purple-400' : 'text-orange-400'}>₹{c.total_price}</span>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="flex-1">
                {cart.length === 0 ? (
                  <p className="text-sm text-slate-600">Add items to proceed</p>
                ) : (
                  <div>
                    <span className="text-xs text-slate-500">{cartCount} item{cartCount !== 1 ? "s" : ""} · </span>
                    {isOwnerUse
                      ? <span className="text-base font-bold text-purple-400">Owner Use</span>
                      : <span className="text-base font-bold text-slate-100">₹{cartTotal.toLocaleString()}</span>
                    }
                  </div>
                )}
              </div>
              <button
                onClick={handleConfirmClick}
                disabled={cart.length === 0 || saving || done}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  done
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : cart.length === 0
                    ? "bg-slate-700/50 text-slate-600 cursor-not-allowed"
                    : isOwnerUse
                    ? "bg-purple-500 hover:bg-purple-400 text-white shadow-lg shadow-purple-500/20"
                    : "bg-orange-500 hover:bg-orange-400 text-white shadow-lg shadow-orange-500/20"
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
