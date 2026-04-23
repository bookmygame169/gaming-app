// Inventory Management Component
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Package,
  Plus,
  Pencil,
  Trash2,
  Search,
  X,
  Check,
  AlertCircle,
  Loader2,
  Coffee,
  Cookie,
  Gift,
  GlassWater,
  BarChart3,
  RefreshCw,
  TrendingUp,
  ShoppingCart,
} from "lucide-react";
import InventoryAnalytics from "./InventoryAnalytics";
import {
  InventoryItem,
  InventoryCategory,
  CATEGORY_LABELS,
} from "@/types/inventory";

interface InventoryProps {
  cafeId: string;
}

const CATEGORY_CONFIG: Record<InventoryCategory, { icon: React.ReactNode; color: string; emoji: string }> = {
  snacks:      { icon: <Cookie className="w-4 h-4" />,     color: "#f59e0b", emoji: "🍿" },
  cold_drinks: { icon: <GlassWater className="w-4 h-4" />, color: "#06b6d4", emoji: "🥤" },
  hot_drinks:  { icon: <Coffee className="w-4 h-4" />,     color: "#ef4444", emoji: "☕" },
  combo:       { icon: <Gift className="w-4 h-4" />,       color: "#8b5cf6", emoji: "🎁" },
};

const LOW_STOCK_THRESHOLD = 5;

function StockBadge({ qty }: { qty: number }) {
  if (qty === 0)  return <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-red-500/15 text-red-400 font-bold text-sm border border-red-500/20">0 left</span>;
  if (qty <= LOW_STOCK_THRESHOLD) return <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-400 font-bold text-sm border border-amber-500/20">{qty} left</span>;
  return <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 font-bold text-sm border border-emerald-500/20">{qty} left</span>;
}

export default function Inventory({ cafeId }: InventoryProps) {
  const [activeTab, setActiveTab] = useState<"items" | "analytics">("items");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<InventoryCategory | "all">("all");

  // Restock inline state
  const [restockingId, setRestockingId] = useState<string | null>(null);
  const [restockQty, setRestockQty] = useState("10");
  const [restockSaving, setRestockSaving] = useState(false);
  const restockInputRef = useRef<HTMLInputElement>(null);

  // Quick add
  const [quickName, setQuickName] = useState("");
  const [quickPrice, setQuickPrice] = useState("");
  const [quickQty, setQuickQty] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    category: "snacks" as InventoryCategory,
    price: "",
    cost_price: "",
    stock_quantity: "",
    is_available: true,
  });

  const loadItems = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("inventory_items")
        .select("*")
        .eq("cafe_id", cafeId)
        .order("category", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      setItems(data || []);
    } catch (err) {
      console.error("Error loading inventory:", err);
      setError("Failed to load inventory");
    } finally {
      setLoading(false);
    }
  }, [cafeId]);

  useEffect(() => { loadItems(); }, [loadItems]);

  // Focus restock input when opened
  useEffect(() => {
    if (restockingId) setTimeout(() => restockInputRef.current?.focus(), 50);
  }, [restockingId]);

  const filteredItems = items.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === "all" || item.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const groupedItems = filteredItems.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<InventoryCategory, InventoryItem[]>);

  const urgentItems = items.filter(i => i.stock_quantity <= LOW_STOCK_THRESHOLD && i.is_available);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function openAddModal() {
    setEditingItem(null);
    setFormData({ name: "", category: "snacks", price: "", cost_price: "", stock_quantity: "", is_available: true });
    setError(null);
    setShowModal(true);
  }

  function openEditModal(item: InventoryItem) {
    setEditingItem(item);
    setFormData({
      name: item.name,
      category: item.category,
      price: item.price.toString(),
      cost_price: item.cost_price?.toString() || "",
      stock_quantity: item.stock_quantity.toString(),
      is_available: item.is_available,
    });
    setError(null);
    setShowModal(true);
  }

  async function handleSave() {
    if (!formData.name.trim()) { setError("Name is required"); return; }
    if (formData.price === "" || parseFloat(formData.price) < 0) { setError("Valid price is required"); return; }
    try {
      setSaving(true); setError(null);
      const itemData = {
        cafe_id: cafeId,
        name: formData.name.trim(),
        category: formData.category,
        price: parseFloat(formData.price),
        cost_price: formData.cost_price ? parseFloat(formData.cost_price) : null,
        stock_quantity: parseInt(formData.stock_quantity) || 0,
        is_available: formData.is_available,
      };
      if (editingItem) {
        const { error } = await supabase.from("inventory_items").update(itemData).eq("id", editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("inventory_items").insert(itemData);
        if (error) throw error;
      }
      setShowModal(false);
      loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save item");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: InventoryItem) {
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    try {
      const { data: orders } = await supabase.from("booking_orders").select("id").eq("inventory_item_id", item.id).limit(1);
      if (orders && orders.length > 0) {
        await supabase.from("inventory_items").update({ is_available: false, stock_quantity: 0 }).eq("id", item.id);
        alert("Item marked as unavailable (it has sales history).");
        loadItems(); return;
      }
      const { error } = await supabase.from("inventory_items").delete().eq("id", item.id);
      if (error) throw error;
      loadItems();
    } catch (err) {
      alert(`Failed to delete: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  async function handleQuickAdd() {
    if (!quickName.trim() || !quickPrice) return;
    setQuickSaving(true);
    try {
      const { error } = await supabase.from("inventory_items").insert({
        cafe_id: cafeId, name: quickName.trim(), category: "snacks" as InventoryCategory,
        price: parseFloat(quickPrice), stock_quantity: parseInt(quickQty) || 0, is_available: true,
      });
      if (error) throw error;
      setQuickName(""); setQuickPrice(""); setQuickQty("");
      loadItems();
    } catch (err) {
      console.error("Quick add error:", err);
    } finally {
      setQuickSaving(false);
    }
  }

  async function toggleAvailability(item: InventoryItem) {
    try {
      const { error } = await supabase.from("inventory_items").update({ is_available: !item.is_available }).eq("id", item.id);
      if (error) throw error;
      loadItems();
    } catch (err) {
      console.error("Error toggling availability:", err);
    }
  }

  async function updateStock(item: InventoryItem, change: number) {
    if (change < 0 && item.stock_quantity <= 0) return;
    const optimistic = Math.max(0, item.stock_quantity + change);
    setItems(cur => cur.map(i => i.id === item.id ? { ...i, stock_quantity: optimistic } : i));
    try {
      const { data: auth, error } = await supabase.rpc("increment_inventory_stock", { row_id: item.id, amount: change });
      if (error) throw error;
      if (typeof auth === "number" && auth !== optimistic) {
        setItems(cur => cur.map(i => i.id === item.id ? { ...i, stock_quantity: auth } : i));
      }
    } catch (err) {
      console.error("Stock update error:", err);
      loadItems();
    }
  }

  async function handleRestock(item: InventoryItem) {
    const qty = parseInt(restockQty);
    if (!qty || qty <= 0) return;
    setRestockSaving(true);
    await updateStock(item, qty);
    setRestockSaving(false);
    setRestockingId(null);
    setRestockQty("10");
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Package className="w-6 h-6 text-cyan-500" />
            Stock & Inventory
          </h2>
          <p className="text-slate-400 text-sm mt-1">Snacks, drinks, and combos</p>
        </div>
        {activeTab === "items" && (
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl font-semibold transition"
          >
            <Plus className="w-5 h-5" /> Add Item
          </button>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="overflow-x-auto no-scrollbar">
        <div className="flex w-max min-w-full gap-2 border-b border-white/[0.09] pb-2">
        {(["items", "analytics"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition ${
              activeTab === tab
                ? "bg-cyan-500/20 text-cyan-400 border-b-2 border-cyan-500"
                : "text-slate-400 hover:text-white hover:bg-white/[0.04]"
            }`}
          >
            {tab === "items" ? <Package className="w-4 h-4" /> : <BarChart3 className="w-4 h-4" />}
            {tab === "items" ? "Items" : "Analytics"}
          </button>
        ))}
        </div>
      </div>

      {activeTab === "analytics" && <InventoryAnalytics cafeId={cafeId} />}

      {activeTab === "items" && (
        <div className="space-y-5">

          {/* ── Stats row ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total Items",   value: items.length,                                               color: "text-white",        bg: "bg-white/[0.04]",      icon: <ShoppingCart className="w-4 h-4" /> },
              { label: "Available",     value: items.filter(i => i.is_available).length,                   color: "text-emerald-400",  bg: "bg-emerald-500/[0.07]",icon: <Check className="w-4 h-4" /> },
              { label: "Low Stock",     value: items.filter(i => i.stock_quantity > 0 && i.stock_quantity <= LOW_STOCK_THRESHOLD).length, color: "text-amber-400", bg: "bg-amber-500/[0.07]", icon: <TrendingUp className="w-4 h-4" /> },
              { label: "Out of Stock",  value: items.filter(i => i.stock_quantity === 0).length,            color: "text-red-400",      bg: "bg-red-500/[0.07]",    icon: <AlertCircle className="w-4 h-4" /> },
            ].map(s => (
              <div key={s.label} className={`${s.bg} border border-white/[0.09] rounded-xl p-4 flex items-center gap-3`}>
                <div className={`${s.color} opacity-70`}>{s.icon}</div>
                <div>
                  <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-slate-500">{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Urgent: needs restocking ── */}
          {urgentItems.length > 0 && (
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.05] p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-semibold text-amber-400">Needs Restocking ({urgentItems.length})</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {urgentItems.map(item => (
                  <div key={item.id} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08]">
                    <span className="text-sm text-white">{item.name}</span>
                    <StockBadge qty={item.stock_quantity} />
                    <button
                      onClick={() => { setRestockingId(item.id); setRestockQty("10"); }}
                      className="text-xs px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/30 transition font-semibold"
                    >
                      Restock
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Quick add bar ── */}
          <div className="grid grid-cols-1 gap-2 p-3 bg-white/[0.03] border border-white/[0.08] rounded-xl sm:grid-cols-[minmax(0,1fr)_96px_88px_auto] sm:items-center">
            <input
              type="text" placeholder="Item name" value={quickName}
              onChange={e => setQuickName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleQuickAdd()}
              className="w-full min-w-0 px-3 py-2.5 bg-white/[0.05] border border-white/[0.09] rounded-lg text-white placeholder-slate-600 text-sm focus:outline-none focus:border-cyan-500/60"
            />
            <input
              type="number" placeholder="₹ Price" value={quickPrice}
              onChange={e => setQuickPrice(e.target.value)}
              className="w-full px-3 py-2.5 bg-white/[0.05] border border-white/[0.09] rounded-lg text-white placeholder-slate-600 text-sm focus:outline-none focus:border-cyan-500/60"
            />
            <input
              type="number" placeholder="Qty" value={quickQty}
              onChange={e => setQuickQty(e.target.value)}
              className="w-full px-3 py-2.5 bg-white/[0.05] border border-white/[0.09] rounded-lg text-white placeholder-slate-600 text-sm focus:outline-none focus:border-cyan-500/60"
            />
            <button
              onClick={handleQuickAdd}
              disabled={!quickName || !quickPrice || quickSaving}
              className="flex w-full items-center justify-center gap-1.5 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors sm:w-auto"
            >
              {quickSaving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Add
            </button>
          </div>

          {/* ── Filters ── */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text" placeholder="Search items..." value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white/[0.04] border border-white/[0.09] rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {(["all", ...Object.keys(CATEGORY_LABELS)] as (InventoryCategory | "all")[]).map(cat => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition ${
                    filterCategory === cat
                      ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
                      : "bg-white/[0.04] text-slate-400 border border-white/[0.09] hover:text-white"
                  }`}
                >
                  {cat === "all" ? "All" : `${CATEGORY_CONFIG[cat as InventoryCategory].emoji} ${CATEGORY_LABELS[cat as InventoryCategory]}`}
                </button>
              ))}
            </div>
          </div>

          {/* ── Items ── */}
          {filteredItems.length === 0 ? (
            <div className="text-center py-16 bg-white/[0.03] rounded-2xl border border-white/[0.09]">
              <Package className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">
                {items.length === 0 ? "No items yet. Add your first item!" : "No items match your search."}
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {Object.entries(groupedItems).map(([category, categoryItems]) => {
                const config = CATEGORY_CONFIG[category as InventoryCategory];
                return (
                  <div key={category}>
                    {/* Category header */}
                    <div className="flex items-center gap-2 mb-3">
                      <div className="p-1.5 rounded-lg" style={{ backgroundColor: `${config.color}20` }}>
                        <div style={{ color: config.color }}>{config.icon}</div>
                      </div>
                      <h3 className="font-semibold text-white">{CATEGORY_LABELS[category as InventoryCategory]}</h3>
                      <span className="text-sm text-slate-500">({categoryItems.length})</span>
                    </div>

                    {/* Cards grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {categoryItems.map(item => {
                        const margin = item.cost_price && item.cost_price > 0
                          ? Math.round(((item.price - item.cost_price) / item.price) * 100)
                          : null;
                        const isRestocking = restockingId === item.id;

                        return (
                          <div
                            key={item.id}
                            className={`rounded-2xl border p-4 flex flex-col gap-3 transition-all ${
                              !item.is_available
                                ? "border-white/[0.06] bg-white/[0.02] opacity-50"
                                : item.stock_quantity === 0
                                  ? "border-red-500/20 bg-red-500/[0.03]"
                                  : item.stock_quantity <= LOW_STOCK_THRESHOLD
                                    ? "border-amber-500/20 bg-amber-500/[0.03]"
                                    : "border-white/[0.09] bg-white/[0.04]"
                            }`}
                          >
                            {/* Top row: name + actions */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-semibold text-white truncate">{item.name}</span>
                                  {!item.is_available && (
                                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-500/20 text-slate-400 rounded-full">Off</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  <span className="text-lg font-bold text-white">₹{item.price}</span>
                                  {item.cost_price ? (
                                    <span className="text-xs text-slate-500">cost ₹{item.cost_price}</span>
                                  ) : null}
                                  {margin !== null && (
                                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-lg ${margin >= 40 ? "bg-emerald-500/15 text-emerald-400" : margin >= 20 ? "bg-amber-500/15 text-amber-400" : "bg-red-500/15 text-red-400"}`}>
                                      {margin}% margin
                                    </span>
                                  )}
                                </div>
                              </div>
                              {/* Item action buttons */}
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  onClick={() => toggleAvailability(item)}
                                  title={item.is_available ? "Mark unavailable" : "Mark available"}
                                  className={`h-9 w-9 flex items-center justify-center rounded-lg transition ${item.is_available ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30" : "bg-white/[0.08] text-slate-400 hover:bg-white/[0.10]"}`}
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => openEditModal(item)} className="h-9 w-9 flex items-center justify-center bg-white/[0.08] hover:bg-white/[0.12] text-slate-300 rounded-lg transition">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => handleDelete(item)} className="h-9 w-9 flex items-center justify-center bg-red-500/15 hover:bg-red-500/25 text-red-400 rounded-lg transition">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Stock row */}
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex items-center justify-between gap-2 sm:justify-start">
                                <StockBadge qty={item.stock_quantity} />
                                {/* Fine +/- controls */}
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => updateStock(item, -1)}
                                    disabled={item.stock_quantity === 0}
                                    className="w-8 h-8 flex items-center justify-center bg-white/[0.07] hover:bg-white/[0.12] text-white rounded-lg disabled:opacity-30 text-sm font-bold transition"
                                  >−</button>
                                  <button
                                    onClick={() => updateStock(item, 1)}
                                    className="w-8 h-8 flex items-center justify-center bg-white/[0.07] hover:bg-white/[0.12] text-white rounded-lg text-sm font-bold transition"
                                  >+</button>
                                </div>
                              </div>

                              {/* Restock button */}
                              <button
                                onClick={() => {
                                  setRestockingId(isRestocking ? null : item.id);
                                  setRestockQty("10");
                                }}
                                className={`flex w-full items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-semibold border transition sm:w-auto ${
                                  isRestocking
                                    ? "bg-cyan-500/25 text-cyan-300 border-cyan-500/40"
                                    : "bg-white/[0.05] text-slate-400 border-white/[0.09] hover:text-cyan-400 hover:border-cyan-500/30"
                                }`}
                              >
                                <RefreshCw className="w-3 h-3" />
                                Restock
                              </button>
                            </div>

                            {/* Inline restock panel */}
                            {isRestocking && (
                              <div className="flex flex-col gap-2 pt-3 border-t border-white/[0.08] sm:flex-row sm:items-center">
                                <span className="text-xs text-slate-400 shrink-0">Add qty:</span>
                                <input
                                  ref={restockInputRef}
                                  type="number"
                                  min="1"
                                  value={restockQty}
                                  onChange={e => setRestockQty(e.target.value)}
                                  onKeyDown={e => { if (e.key === "Enter") handleRestock(item); if (e.key === "Escape") setRestockingId(null); }}
                                  className="w-full px-2 py-2 bg-white/[0.07] border border-white/[0.10] rounded-lg text-white text-sm text-center focus:outline-none focus:border-cyan-500 sm:w-20"
                                />
                                <button
                                  onClick={() => handleRestock(item)}
                                  disabled={restockSaving || !restockQty || parseInt(restockQty) <= 0}
                                  className="flex w-full items-center justify-center gap-1 px-3 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition sm:w-auto"
                                >
                                  {restockSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                  Confirm
                                </button>
                                <button onClick={() => setRestockingId(null)} className="flex w-full items-center justify-center rounded-lg border border-white/[0.08] px-3 py-2 text-slate-500 hover:text-white transition sm:w-auto sm:border-0 sm:p-1">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
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
      )}

      {/* ── Add/Edit Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="bg-[#0d0d14] border border-white/[0.10] rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">{editingItem ? "Edit Item" : "Add New Item"}</h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/[0.06] rounded-lg transition">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-xl flex items-center gap-2 text-red-400">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Item Name</label>
                <input
                  type="text" value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Coca Cola"
                  className="w-full px-4 py-2.5 bg-white/[0.06] border border-white/[0.09] rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Category</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(CATEGORY_LABELS) as InventoryCategory[]).map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setFormData({ ...formData, category: cat })}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition ${
                        formData.category === cat
                          ? "border-cyan-500/60 bg-cyan-500/15 text-cyan-400"
                          : "border-white/[0.09] bg-white/[0.04] text-slate-400 hover:text-white"
                      }`}
                    >
                      <span>{CATEGORY_CONFIG[cat].emoji}</span>
                      {CATEGORY_LABELS[cat]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Selling Price (₹)</label>
                  <input
                    type="number" value={formData.price}
                    onChange={e => setFormData({ ...formData, price: e.target.value })}
                    placeholder="0" min="0"
                    className="w-full px-4 py-2.5 bg-white/[0.06] border border-white/[0.09] rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Cost Price (₹)</label>
                  <input
                    type="number" value={formData.cost_price}
                    onChange={e => setFormData({ ...formData, cost_price: e.target.value })}
                    placeholder="Optional" min="0"
                    className="w-full px-4 py-2.5 bg-white/[0.06] border border-white/[0.09] rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Stock Quantity</label>
                <input
                  type="number" value={formData.stock_quantity}
                  onChange={e => setFormData({ ...formData, stock_quantity: e.target.value })}
                  placeholder="0" min="0"
                  className="w-full px-4 py-2.5 bg-white/[0.06] border border-white/[0.09] rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, is_available: !formData.is_available })}
                  className={`relative w-12 h-6 rounded-full transition ${formData.is_available ? "bg-cyan-500" : "bg-white/[0.08]"}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${formData.is_available ? "translate-x-7" : "translate-x-1"}`} />
                </button>
                <span className="text-slate-300">Available for sale</span>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 bg-white/[0.06] hover:bg-white/[0.08] text-white rounded-xl font-medium transition">
                Cancel
              </button>
              <button
                onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : <><Check className="w-4 h-4" />{editingItem ? "Update" : "Add Item"}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
