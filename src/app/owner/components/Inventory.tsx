// Inventory Management Component
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  Check,
  AlertCircle,
  Loader2,
  Coffee,
  Cookie,
  Gift,
  GlassWater,
} from "lucide-react";
import InventoryAnalytics from "./InventoryAnalytics";
import {
  Chips,
  EmptyRow,
  Field,
  GhostButton,
  Kpis,
  Panel,
  PrimaryButton,
  TableHead,
  TableRow,
} from "./consoleUi";
import { fetchInventory } from "@/app/owner/ownerLookup";
import {
  InventoryItem,
  InventoryCategory,
  CATEGORY_LABELS,
} from "@/types/inventory";

interface InventoryProps {
  cafeId: string;
}

const CATEGORY_CONFIG: Record<InventoryCategory, { icon: React.ReactNode; color: string; emoji: string }> = {
  snacks:      { icon: <Cookie className="w-4 h-4" />,     color: "#ff5c2b", emoji: "🍿" },
  cold_drinks: { icon: <GlassWater className="w-4 h-4" />, color: "#d8ff3c", emoji: "🥤" },
  hot_drinks:  { icon: <Coffee className="w-4 h-4" />,     color: "#ff5c2b", emoji: "☕" },
  combo:       { icon: <Gift className="w-4 h-4" />,       color: "#d8ff3c", emoji: "🎁" },
};

const LOW_STOCK_THRESHOLD = 5;

function parseNonNegativeNumber(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseNonNegativeInteger(value: string, fallback = 0): number {
  return Math.floor(parseNonNegativeNumber(value, fallback));
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
      setItems(await fetchInventory<InventoryItem>(cafeId));
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
    const price = parseNonNegativeNumber(formData.price, NaN);
    const costPrice = formData.cost_price === "" ? null : parseNonNegativeNumber(formData.cost_price, NaN);
    const stockQuantity = parseNonNegativeInteger(formData.stock_quantity, 0);
    if (!Number.isFinite(price)) { setError("Valid price is required"); return; }
    if (costPrice !== null && !Number.isFinite(costPrice)) { setError("Valid cost price is required"); return; }
    try {
      setSaving(true); setError(null);
      const itemData = {
        name: formData.name.trim(),
        category: formData.category,
        price,
        cost_price: costPrice,
        stock_quantity: stockQuantity,
        is_available: formData.is_available,
      };

      const res = editingItem
        ? await fetch("/api/owner/inventory", {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId: editingItem.id, ...itemData }),
          })
        : await fetch("/api/owner/inventory", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cafeId, ...itemData }),
          });

      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || "Failed to save item");

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
      const res = await fetch(`/api/owner/inventory?itemId=${encodeURIComponent(item.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || "Failed to delete item");
      if (result.disabled) {
        alert("Item marked as unavailable (it has sales history).");
      }
      loadItems();
    } catch (err) {
      alert(`Failed to delete: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  async function handleQuickAdd() {
    const price = parseNonNegativeNumber(quickPrice, NaN);
    const quantity = parseNonNegativeInteger(quickQty, 0);
    if (!quickName.trim() || !Number.isFinite(price)) return;
    setQuickSaving(true);
    try {
      const res = await fetch("/api/owner/inventory", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cafeId, name: quickName.trim(), category: "snacks" as InventoryCategory,
          price, stock_quantity: quantity, is_available: true,
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || "Failed to add item");
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
      const res = await fetch("/api/owner/inventory", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, is_available: !item.is_available }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || "Failed to update item");
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
      const res = await fetch("/api/owner/inventory/stock", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, amount: change }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || "Failed to update stock");
      if (typeof result.stock_quantity === "number" && result.stock_quantity !== optimistic) {
        setItems(cur => cur.map(i => i.id === item.id ? { ...i, stock_quantity: result.stock_quantity } : i));
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
        <Loader2 className="h-6 w-6 animate-spin text-[#d8ff3c]" />
      </div>
    );
  }

  const COLUMNS = 'minmax(148px,1.6fr) 92px 116px 96px 150px';
  const stockValue = items.reduce((sum, item) => sum + item.price * item.stock_quantity, 0);
  const outOfStock = items.filter((item) => item.stock_quantity <= 0);

  const categories: { id: InventoryCategory | 'all'; label: string }[] = [
    { id: 'all', label: 'ALL' },
    { id: 'snacks', label: 'SNACKS' },
    { id: 'cold_drinks', label: 'COLD' },
    { id: 'hot_drinks', label: 'HOT' },
    { id: 'combo', label: 'COMBOS' },
  ];

  return (
    <div className="flex flex-col gap-[18px]">
      <Kpis
        items={[
          { label: 'ITEMS ON SALE', value: String(items.filter((i) => i.is_available).length), sub: `${items.length} in the list` },
          {
            label: 'RUNNING LOW',
            value: String(urgentItems.length),
            tone: urgentItems.length > 0 ? 'orange' : 'ink',
            sub: `at or under ${LOW_STOCK_THRESHOLD} left`,
          },
          {
            label: 'OUT OF STOCK',
            value: String(outOfStock.length),
            tone: outOfStock.length > 0 ? 'orange' : 'ink',
            sub: outOfStock.length > 0 ? 'cannot be sold' : 'everything in stock',
          },
          { label: 'STOCK VALUE', value: `₹${Math.round(stockValue).toLocaleString('en-IN')}`, sub: 'at selling price' },
        ]}
      />

      {/* The shelf that is about to embarrass somebody at the counter. */}
      {urgentItems.length > 0 && (
        <div className="flex flex-wrap items-center gap-[9px] border border-[#ff5c2b]/[0.28] bg-[#ff5c2b]/[0.06] px-[15px] py-[13px]">
          <span className="whitespace-nowrap font-mono text-[10px] tracking-[0.16em] text-[#ff5c2b]">
            REORDER · {urgentItems.length}
          </span>
          {urgentItems.slice(0, 6).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => { setRestockingId(item.id); setRestockQty('10'); }}
              className="flex items-center gap-2 border border-[#f2f0ea]/[0.14] bg-[#111113] px-2.5 py-[7px] transition-colors hover:border-[#d8ff3c]"
            >
              <span className="whitespace-nowrap font-mono text-xs font-semibold text-[#f2f0ea]">
                {item.name}
              </span>
              <span
                className="whitespace-nowrap font-mono text-[10px]"
                style={{ color: item.stock_quantity <= 0 ? '#ff5c2b' : 'rgba(242,240,234,.45)' }}
              >
                {item.stock_quantity} LEFT
              </span>
              <span className="font-mono text-[9.5px] tracking-[0.1em] text-[#d8ff3c]">RESTOCK</span>
            </button>
          ))}
        </div>
      )}

      {/* Adding a line without opening anything, for the common case: a name,
          a price, how many arrived. */}
      <Panel className="flex flex-wrap items-center gap-2 px-4 py-3.5">
        <span className="whitespace-nowrap font-mono text-[9.5px] tracking-[0.18em] text-[#f2f0ea]/[0.42]">
          QUICK ADD
        </span>
        <Field value={quickName} onChange={setQuickName} placeholder="ITEM NAME" className="w-[190px]" />
        <Field value={quickPrice} onChange={setQuickPrice} placeholder="PRICE" type="number" className="w-[110px]" />
        <Field value={quickQty} onChange={setQuickQty} placeholder="QTY" type="number" className="w-[100px]" />
        <PrimaryButton onClick={handleQuickAdd} disabled={quickSaving}>
          {quickSaving ? 'SAVING…' : '+ ADD ITEM'}
        </PrimaryButton>
        <span className="min-w-[10px] flex-1" />
        <GhostButton onClick={openAddModal}>FULL FORM →</GhostButton>
      </Panel>

      {error && (
        <div className="border border-[#ff5c2b]/[0.28] bg-[#ff5c2b]/[0.06] px-[15px] py-3 font-mono text-[10.5px] tracking-[0.1em] text-[#ff5c2b]">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-[9px]">
        <Chips
          items={categories.map((category) => ({
            id: category.id,
            label: category.label,
            count:
              category.id === 'all'
                ? items.length
                : items.filter((item) => item.category === category.id).length,
          }))}
          active={filterCategory}
          onPick={(id) => setFilterCategory(id as InventoryCategory | 'all')}
        />
        <span className="h-px min-w-[20px] flex-1 bg-[#f2f0ea]/10" />
        <Field value={searchQuery} onChange={setSearchQuery} placeholder="FIND AN ITEM" className="w-[200px]" />
        <Chips
          items={[
            { id: 'items', label: 'STOCK' },
            { id: 'analytics', label: 'WHAT SELLS' },
          ]}
          active={activeTab}
          onPick={(id) => setActiveTab(id as 'items' | 'analytics')}
        />
      </div>

      {activeTab === 'analytics' ? (
        <InventoryAnalytics cafeId={cafeId} />
      ) : (
        <Panel>
          <TableHead columns={COLUMNS}>
            <span>ITEM</span>
            <span className="text-right">PRICE</span>
            <span className="text-center">IN STOCK</span>
            <span className="text-right">MARGIN</span>
            <span className="text-right">ACTIONS</span>
          </TableHead>

          {filteredItems.length === 0 ? (
            <EmptyRow>
              {items.length === 0
                ? 'Nothing on the shelf yet. Add an item above and it can be sold against a session.'
                : 'No item matches that filter.'}
            </EmptyRow>
          ) : (
            filteredItems.map((item) => {
              const low = item.stock_quantity <= LOW_STOCK_THRESHOLD;
              const out = item.stock_quantity <= 0;
              const margin = item.cost_price ? item.price - item.cost_price : null;
              const marginPct = item.cost_price && item.price > 0
                ? Math.round(((item.price - item.cost_price) / item.price) * 100)
                : null;

              return (
                <TableRow
                  key={item.id}
                  columns={COLUMNS}
                  edge={out ? '#ff5c2b' : low ? 'rgba(255,92,43,.5)' : 'transparent'}
                >
                  <div className="flex min-w-0 flex-col gap-[3px]">
                    <span
                      className="truncate text-[13.5px] font-bold"
                      style={{ color: item.is_available ? '#f2f0ea' : 'rgba(242,240,234,.4)' }}
                    >
                      {item.name}
                    </span>
                    <span className="truncate font-mono text-[10px] tracking-[0.1em] text-[#f2f0ea]/35">
                      {item.category.replace('_', ' ').toUpperCase()}
                      {!item.is_available ? ' · OFF SALE' : ''}
                    </span>
                  </div>

                  <span className="whitespace-nowrap text-right text-[13px] font-extrabold text-[#f2f0ea]">
                    ₹{item.price}
                  </span>

                  {restockingId === item.id ? (
                    <div className="flex items-center justify-center gap-1.5">
                      <input
                        ref={restockInputRef}
                        value={restockQty}
                        onChange={(e) => setRestockQty(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRestock(item);
                          if (e.key === 'Escape') setRestockingId(null);
                        }}
                        className="h-[26px] w-[60px] border border-[#d8ff3c] bg-transparent px-2 text-center font-mono text-[11px] text-[#f2f0ea] outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleRestock(item)}
                        disabled={restockSaving}
                        className="h-[26px] border border-[#d8ff3c] bg-[#d8ff3c]/[0.12] px-2 font-mono text-[9.5px] tracking-[0.1em] text-[#d8ff3c] disabled:opacity-40"
                      >
                        {restockSaving ? '…' : 'ADD'}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setRestockingId(item.id); setRestockQty('10'); }}
                      title="Add stock"
                      className="mx-auto flex items-center gap-1.5"
                    >
                      <span
                        className="text-[15px] font-extrabold"
                        style={{ color: out ? '#ff5c2b' : low ? '#ffa53c' : '#f2f0ea' }}
                      >
                        {item.stock_quantity}
                      </span>
                      <span className="font-mono text-[9.5px] tracking-[0.1em] text-[#f2f0ea]/35">+</span>
                    </button>
                  )}

                  <div className="flex flex-col items-end gap-[3px]">
                    {margin !== null ? (
                      <>
                        <span className="whitespace-nowrap font-mono text-[11.5px] text-[#d8ff3c]">
                          +₹{margin}
                        </span>
                        <span className="whitespace-nowrap font-mono text-[10px] text-[#f2f0ea]/35">
                          {marginPct}%
                        </span>
                      </>
                    ) : (
                      <span className="font-mono text-[10px] text-[#f2f0ea]/30">NO COST SET</span>
                    )}
                  </div>

                  <div className="flex justify-end gap-[5px]">
                    <button
                      type="button"
                      title="Edit this item"
                      onClick={() => openEditModal(item)}
                      className="flex h-[26px] items-center border border-[#f2f0ea]/[0.14] px-[9px] font-mono text-[9.5px] tracking-[0.1em] text-[#f2f0ea]/55 transition-colors hover:border-[#d8ff3c] hover:text-[#d8ff3c]"
                    >
                      EDIT
                    </button>
                    <button
                      type="button"
                      title={item.is_available ? 'Take off sale' : 'Put back on sale'}
                      onClick={() => toggleAvailability(item)}
                      className="flex h-[26px] items-center border border-[#f2f0ea]/[0.14] px-[9px] font-mono text-[9.5px] tracking-[0.1em] text-[#f2f0ea]/55 transition-colors hover:border-[#f2f0ea] hover:text-[#f2f0ea]"
                    >
                      {item.is_available ? 'OFF SALE' : 'ON SALE'}
                    </button>
                    <button
                      type="button"
                      title="Remove this item"
                      onClick={() => handleDelete(item)}
                      className="flex h-[26px] items-center border border-[#f2f0ea]/[0.14] px-[9px] font-mono text-[9.5px] tracking-[0.1em] text-[#f2f0ea]/55 transition-colors hover:border-[#ff5c2b] hover:text-[#ff5c2b]"
                    >
                      DELETE
                    </button>
                  </div>
                </TableRow>
              );
            })
          )}

          <div className="flex items-center gap-3.5 border-t border-[#f2f0ea]/10 px-4 py-3 font-mono text-[10.5px] text-[#f2f0ea]/40">
            <span>{filteredItems.length} of {items.length} items</span>
            <span className="flex-1" />
            <span>₹{Math.round(stockValue).toLocaleString('en-IN')} ON THE SHELF</span>
          </div>
        </Panel>
      )}

      {/* ── Add/Edit Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0b0b0c]/90">
          <div className="bg-[#0d0d14] border border-white/[0.10] w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-[#f2f0ea]">{editingItem ? "Edit Item" : "Add New Item"}</h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-[#f2f0ea]/[0.06] transition">
                <X className="w-5 h-5 text-[#f2f0ea]/50" />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-[#ff5c2b]/20 border border-[#ff5c2b]/30 flex items-center gap-2 text-[#ff5c2b]">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#f2f0ea]/70 mb-1">Item Name</label>
                <input
                  type="text" value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Coca Cola"
                  className="w-full px-4 py-2.5 bg-[#f2f0ea]/[0.06] border border-[#f2f0ea]/10 text-[#f2f0ea] placeholder-[#f2f0ea]/50 focus:outline-none focus:border-[#d8ff3c]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#f2f0ea]/70 mb-2">Category</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(CATEGORY_LABELS) as InventoryCategory[]).map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setFormData({ ...formData, category: cat })}
                      className={`flex items-center gap-2 px-3 py-2.5  border text-sm font-medium transition ${
                        formData.category === cat
                          ? "border-[#d8ff3c]/60 bg-[#d8ff3c]/15 text-[#d8ff3c]"
                          : "border-[#f2f0ea]/10 bg-[#f2f0ea]/[0.04] text-[#f2f0ea]/50 hover:text-[#f2f0ea]"
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
                  <label className="block text-sm font-medium text-[#f2f0ea]/70 mb-1">Selling Price (₹)</label>
                  <input
                    type="number" value={formData.price}
                    onChange={e => setFormData({ ...formData, price: e.target.value })}
                    placeholder="0" min="0"
                    className="w-full px-4 py-2.5 bg-[#f2f0ea]/[0.06] border border-[#f2f0ea]/10 text-[#f2f0ea] placeholder-[#f2f0ea]/50 focus:outline-none focus:border-[#d8ff3c]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#f2f0ea]/70 mb-1">Cost Price (₹)</label>
                  <input
                    type="number" value={formData.cost_price}
                    onChange={e => setFormData({ ...formData, cost_price: e.target.value })}
                    placeholder="Optional" min="0"
                    className="w-full px-4 py-2.5 bg-[#f2f0ea]/[0.06] border border-[#f2f0ea]/10 text-[#f2f0ea] placeholder-[#f2f0ea]/50 focus:outline-none focus:border-[#d8ff3c]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#f2f0ea]/70 mb-1">Stock Quantity</label>
                <input
                  type="number" value={formData.stock_quantity}
                  onChange={e => setFormData({ ...formData, stock_quantity: e.target.value })}
                  placeholder="0" min="0"
                  className="w-full px-4 py-2.5 bg-[#f2f0ea]/[0.06] border border-[#f2f0ea]/10 text-[#f2f0ea] placeholder-[#f2f0ea]/50 focus:outline-none focus:border-[#d8ff3c]"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, is_available: !formData.is_available })}
                  className={`relative w-12 h-6 rounded-full transition ${formData.is_available ? "bg-[#d8ff3c]" : "bg-[#f2f0ea]/[0.08]"}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${formData.is_available ? "translate-x-7" : "translate-x-1"}`} />
                </button>
                <span className="text-[#f2f0ea]/70">Available for sale</span>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 bg-[#f2f0ea]/[0.06] hover:bg-[#f2f0ea]/[0.08] text-[#f2f0ea] font-medium transition">
                Cancel
              </button>
              <button
                onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 bg-[#d8ff3c] hover:bg-[#d8ff3c] text-[#f2f0ea] font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
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
