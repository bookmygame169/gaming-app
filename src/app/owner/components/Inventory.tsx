// Inventory Management Component
"use client";

import { useState, useEffect, useCallback } from "react";
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
  GhostButton,
  Kpis,
  Panel,
  TableHead,
  TableRow,
} from "./consoleUi";
import { fetchInventory, fetchOrdersInRange } from "@/app/owner/ownerLookup";
import {
  InventoryItem,
  InventoryCategory,
  BookingOrder,
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
  const [lowOnly, setLowOnly] = useState(false);
  // Units sold per item over the last seven days. The design's SOLD 7D column
  // and the DAYS LEFT beside it both come from this: stock on its own says how
  // much is there, not how long it lasts.
  const [sold7d, setSold7d] = useState<Record<string, number>>({});

  // Quick add
  const [quickName, setQuickName] = useState("");
  const [quickPrice, setQuickPrice] = useState("");
  const [quickQty, setQuickQty] = useState("");
  const [quickCost, setQuickCost] = useState("");
  const [quickCat, setQuickCat] = useState<InventoryCategory>("snacks");
  const [quickSaving, setQuickSaving] = useState(false);
  // The design's add row is folded away until asked for, rather than standing
  // above the table on every visit.
  const [addOpen, setAddOpen] = useState(false);

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
    // The cafe arrives a tick after the first render, and the lookup rejects an
    // empty id — which is a 400 in the console on every visit to this tab.
    if (!cafeId) return;
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

  // Seven days of counter sales, tallied per item. Failure is quiet on purpose:
  // this decorates the table, and an inventory list that will not load because
  // a sales query timed out is worse than one without a trend column.
  useEffect(() => {
    if (!cafeId) return;
    let cancelled = false;
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    fetchOrdersInRange<BookingOrder>(cafeId, start.toISOString(), end.toISOString())
      .then((orders) => {
        if (cancelled) return;
        const tally: Record<string, number> = {};
        for (const order of orders) {
          if (!order.inventory_item_id) continue;
          tally[order.inventory_item_id] = (tally[order.inventory_item_id] || 0) + (order.quantity || 0);
        }
        setSold7d(tally);
      })
      .catch(() => { /* the column simply stays empty */ });
    return () => { cancelled = true; };
  }, [cafeId]);

  const filteredItems = items.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === "all" || item.category === filterCategory;
    const matchesLow = !lowOnly || item.stock_quantity <= LOW_STOCK_THRESHOLD;
    return matchesSearch && matchesCategory && matchesLow;
  });

  /** How long the shelf lasts at last week's rate. */
  function daysLeftFor(item: InventoryItem): number | null {
    const perDay = (sold7d[item.id] || 0) / 7;
    if (perDay <= 0) return null;
    return Math.floor(item.stock_quantity / perDay);
  }

  const busiest = Math.max(1, ...items.map((item) => sold7d[item.id] || 0));

  const exportItemsCsv = () => {
    const header = ['Item', 'Category', 'Price', 'Cost', 'In stock', 'Sold 7d', 'Days left', 'On sale'];
    const rows = filteredItems.map((item) => {
      const days = daysLeftFor(item);
      return [
        item.name,
        CATEGORY_LABELS[item.category] || item.category,
        String(item.price),
        item.cost_price != null ? String(item.cost_price) : '',
        String(item.stock_quantity),
        String(sold7d[item.id] || 0),
        days === null ? '' : String(days),
        item.is_available ? 'yes' : 'no',
      ];
    });
    const escape = (cell: string) => `"${String(cell).replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map((cols) => cols.map(escape).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };


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
          cafeId, name: quickName.trim(), category: quickCat,
          price, cost_price: parseNonNegativeNumber(quickCost, 0) || null,
          stock_quantity: quantity, is_available: true,
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || "Failed to add item");
      setQuickName(""); setQuickPrice(""); setQuickQty(""); setQuickCost("");
      setAddOpen(false);
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

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[#d8ff3c]" />
      </div>
    );
  }

  const COLUMNS = 'minmax(148px,1.6fr) 92px 116px 84px 86px 116px';
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
      {/* The design's own row above everything: which view, what it holds,
          and the one button that adds to it. */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex gap-px border border-[#f2f0ea]/[0.12] bg-[#f2f0ea]/[0.12]">
          {([
            { id: 'items', label: 'ITEMS' },
            { id: 'analytics', label: 'ANALYTICS' },
          ] as const).map((tab) => {
            const on = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className="whitespace-nowrap px-[18px] py-2.5 font-mono text-[10.5px] tracking-[0.14em] transition-colors"
                style={
                  on
                    ? { background: 'rgba(216,255,60,.14)', color: '#d8ff3c' }
                    : { background: '#111113', color: 'rgba(242,240,234,.5)' }
                }
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <span className="h-px min-w-[20px] flex-1 bg-[#f2f0ea]/10" />
        <span className="whitespace-nowrap font-mono text-[10.5px] text-[#f2f0ea]/40">
          {items.length} items · {urgentItems.length} need attention
        </span>
        <button
          type="button"
          onClick={() => setAddOpen((open) => !open)}
          className="h-[38px] whitespace-nowrap border px-4 font-mono text-[10.5px] font-semibold tracking-[0.14em] transition-colors"
          style={
            addOpen
              ? { borderColor: '#d8ff3c', background: 'rgba(216,255,60,.12)', color: '#d8ff3c' }
              : { borderColor: 'rgba(242,240,234,.18)', color: 'rgba(242,240,234,.72)' }
          }
        >
          {addOpen ? '✕ CLOSE' : '+ ADD ITEM'}
        </button>
      </div>

      {activeTab === 'analytics' ? <InventoryAnalytics cafeId={cafeId} /> : (<>
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
              onClick={() => updateStock(item, 24)}
              title={`Add 24 to ${item.name}`}
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
              <span className="font-mono text-[9.5px] tracking-[0.1em] text-[#d8ff3c]">+24</span>
            </button>
          ))}
          <span className="min-w-[10px] flex-1" />
          <button
            type="button"
            onClick={() => urgentItems.forEach((item) => updateStock(item, 24))}
            className="whitespace-nowrap font-mono text-[10px] tracking-[0.14em] text-[#f2f0ea]/60 transition-colors hover:text-[#d8ff3c]"
          >
            RESTOCK ALL →
          </button>
        </div>
      )}

      {/* The design's add row: name, what it sells for, what it cost, how many
          arrived, and the category it belongs to. */}
      {addOpen && (
        <div
          className="grid gap-2.5 border border-[#d8ff3c]/30 bg-[#111113] p-[15px]"
          style={{ gridTemplateColumns: 'minmax(0,1.6fr) 110px 110px 110px 130px' }}
        >
          <input
            value={quickName}
            onChange={(e) => setQuickName(e.target.value)}
            placeholder="Item name"
            className="border border-[#f2f0ea]/[0.14] bg-[#0e0e10] px-[13px] py-3 text-[14px] font-semibold text-[#f2f0ea] placeholder-[#f2f0ea]/30 focus:border-[#d8ff3c] focus:outline-none"
          />
          <input
            value={quickPrice}
            onChange={(e) => setQuickPrice(e.target.value)}
            placeholder="₹ sell"
            inputMode="decimal"
            className="border border-[#f2f0ea]/[0.14] bg-[#0e0e10] px-[13px] py-3 font-mono text-[13px] text-[#f2f0ea] placeholder-[#f2f0ea]/30 focus:border-[#d8ff3c] focus:outline-none"
          />
          <input
            value={quickCost}
            onChange={(e) => setQuickCost(e.target.value)}
            placeholder="₹ cost"
            inputMode="decimal"
            className="border border-[#f2f0ea]/[0.14] bg-[#0e0e10] px-[13px] py-3 font-mono text-[13px] text-[#f2f0ea] placeholder-[#f2f0ea]/30 focus:border-[#d8ff3c] focus:outline-none"
          />
          <input
            value={quickQty}
            onChange={(e) => setQuickQty(e.target.value)}
            placeholder="Qty"
            inputMode="numeric"
            className="border border-[#f2f0ea]/[0.14] bg-[#0e0e10] px-[13px] py-3 font-mono text-[13px] text-[#f2f0ea] placeholder-[#f2f0ea]/30 focus:border-[#d8ff3c] focus:outline-none"
          />
          <button
            type="button"
            onClick={handleQuickAdd}
            disabled={quickSaving || !quickName.trim() || !quickPrice.trim()}
            className="bg-[#d8ff3c] font-mono text-[10.5px] font-semibold tracking-[0.14em] text-[#0b0b0c] transition-transform hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
          >
            {quickSaving ? 'SAVING…' : 'SAVE ITEM'}
          </button>

          <div className="col-span-full flex flex-wrap items-center gap-1.5">
            {categories.filter((c) => c.id !== 'all').map((category) => {
              const on = quickCat === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setQuickCat(category.id as InventoryCategory)}
                  className="px-[11px] py-2 font-mono text-[10.5px] transition-colors"
                  style={
                    on
                      ? { border: '1px solid #d8ff3c', background: 'rgba(216,255,60,.12)', color: '#d8ff3c' }
                      : { border: '1px solid rgba(242,240,234,.14)', color: 'rgba(242,240,234,.5)' }
                  }
                >
                  {category.label}
                </button>
              );
            })}
            <span className="min-w-[10px] flex-1" />
            <GhostButton onClick={openAddModal}>FULL FORM →</GhostButton>
          </div>
        </div>
      )}

      {error && (
        <div className="border border-[#ff5c2b]/[0.28] bg-[#ff5c2b]/[0.06] px-[15px] py-3 font-mono text-[10.5px] tracking-[0.1em] text-[#ff5c2b]">
          {error}
        </div>
      )}

      {/* Search leads, categories slice, and the one toggle that answers the
          question this screen exists for. */}
      <div className="flex flex-wrap items-center gap-[9px]">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search items…"
          className="min-w-[180px] flex-1 border border-[#f2f0ea]/[0.14] bg-[#111113] px-3.5 py-[11px] font-mono text-[12.5px] text-[#f2f0ea] placeholder-[#f2f0ea]/30 transition-colors focus:border-[#d8ff3c] focus:outline-none"
        />
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
        <button
          type="button"
          onClick={() => setLowOnly((on) => !on)}
          className="flex items-center gap-2 whitespace-nowrap px-3 py-2.5 font-mono text-[10.5px] tracking-[0.1em] transition-colors"
          style={
            lowOnly
              ? { border: '1px solid #ff5c2b', background: 'rgba(255,92,43,.10)', color: '#ff5c2b' }
              : { border: '1px solid rgba(242,240,234,.14)', color: 'rgba(242,240,234,.5)' }
          }
        >
          {lowOnly ? '✓' : '○'} NEEDS ATTENTION
        </button>
      </div>

      {(
        <Panel>
          <TableHead columns={COLUMNS}>
            <span>ITEM</span>
            <span className="text-right">PRICE · MARGIN</span>
            <span className="text-center">IN STOCK</span>
            <span className="text-right">SOLD 7D</span>
            <span className="text-right">DAYS LEFT</span>
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
              const marginPct = item.cost_price && item.price > 0
                ? Math.round(((item.price - item.cost_price) / item.price) * 100)
                : null;

              const sold = sold7d[item.id] || 0;
              const daysLeft = daysLeftFor(item);

              return (
                <TableRow
                  key={item.id}
                  columns={COLUMNS}
                  edge={out ? '#ff5c2b' : low ? 'rgba(255,92,43,.5)' : 'transparent'}
                >
                  <div className="flex min-w-0 flex-col gap-[3px]">
                    <div className="flex min-w-0 items-center gap-[7px]">
                      <span
                        className="truncate text-[13.5px] font-bold"
                        style={{ color: item.is_available ? '#f2f0ea' : 'rgba(242,240,234,.4)' }}
                      >
                        {item.name}
                      </span>
                      {!item.is_available && (
                        <span className="shrink-0 bg-[#f2f0ea]/[0.07] px-1.5 py-0.5 font-mono text-[8.5px] tracking-[0.12em] text-[#f2f0ea]/40">
                          OFF MENU
                        </span>
                      )}
                    </div>
                    <span className="truncate font-mono text-[10px] tracking-[0.1em] text-[#f2f0ea]/35">
                      {(CATEGORY_LABELS[item.category] || item.category).toUpperCase()}
                    </span>
                  </div>

                  {/* Price carries its margin, and the cost it came from sits
                      under it — the design keeps all three in one column. */}
                  <div className="flex min-w-0 flex-col items-end gap-[3px]">
                    <span className="whitespace-nowrap text-[13px] font-extrabold text-[#f2f0ea]">
                      ₹{item.price}
                      {marginPct !== null && (
                        <span
                          className="ml-1 font-mono text-[11px] font-medium"
                          style={{ color: marginPct >= 40 ? '#d8ff3c' : marginPct >= 20 ? '#f2f0ea' : '#ff5c2b' }}
                        >
                          {marginPct >= 0 ? '+' : ''}{marginPct}%
                        </span>
                      )}
                    </span>
                    <span className="whitespace-nowrap font-mono text-[10px] text-[#f2f0ea]/35">
                      {item.cost_price != null ? `cost ₹${item.cost_price}` : 'no cost set'}
                    </span>
                  </div>

                  {/* The design's stepper. updateStock already writes
                      optimistically and reconciles, so a click lands at once. */}
                  <div className="flex items-center justify-center gap-px bg-[#f2f0ea]/10">
                    <button
                      type="button"
                      title="One off the shelf"
                      onClick={() => updateStock(item, -1)}
                      disabled={item.stock_quantity <= 0}
                      className="flex h-7 w-7 items-center justify-center bg-[#17171a] font-mono text-[13px] text-[#f2f0ea]/60 transition-colors hover:bg-[#232328] hover:text-[#f2f0ea] disabled:opacity-30"
                    >
                      −
                    </button>
                    <span
                      className="flex h-7 w-11 items-center justify-center bg-[#17171a] font-mono text-[12px]"
                      style={{ color: out ? '#ff5c2b' : low ? '#ffa53c' : '#f2f0ea' }}
                    >
                      {item.stock_quantity}
                    </span>
                    <button
                      type="button"
                      title="One onto the shelf"
                      onClick={() => updateStock(item, 1)}
                      className="flex h-7 w-7 items-center justify-center bg-[#17171a] font-mono text-[13px] text-[#f2f0ea]/60 transition-colors hover:bg-[#232328] hover:text-[#d8ff3c]"
                    >
                      ＋
                    </button>
                  </div>

                  <div className="flex min-w-0 flex-col items-end gap-[5px]">
                    <span className="font-mono text-[12px] text-[#f2f0ea]/75">{sold}</span>
                    <div className="h-1 w-full bg-[#f2f0ea]/[0.08]">
                      <div
                        className="ml-auto h-1"
                        style={{
                          width: `${Math.round((sold / busiest) * 100)}%`,
                          background: sold > 0 ? '#d8ff3c' : 'transparent',
                        }}
                      />
                    </div>
                  </div>

                  {/* Days of cover at last week's rate. "—" where nothing sold:
                      a shelf with no sales does not last forever, it just has
                      no rate to divide by, and ∞ would read as healthy. */}
                  <span
                    className="text-right font-mono text-[12px]"
                    style={{
                      color: daysLeft === null
                        ? 'rgba(242,240,234,.3)'
                        : daysLeft <= 2 ? '#ff5c2b' : daysLeft <= 7 ? '#ffa53c' : 'rgba(242,240,234,.75)',
                    }}
                  >
                    {daysLeft === null ? '—' : `${daysLeft}d`}
                  </span>

                  <div className="flex justify-end gap-[5px]">
                    <button
                      type="button"
                      title={item.is_available ? 'Take off the menu' : 'Put back on the menu'}
                      onClick={() => toggleAvailability(item)}
                      className="flex h-[26px] w-[26px] items-center justify-center border font-mono text-[11px] transition-colors hover:border-[#f2f0ea]"
                      style={
                        item.is_available
                          ? { borderColor: 'rgba(216,255,60,.4)', color: '#d8ff3c' }
                          : { borderColor: 'rgba(242,240,234,.14)', color: 'rgba(242,240,234,.35)' }
                      }
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      title="Edit this item"
                      onClick={() => openEditModal(item)}
                      className="flex h-[26px] w-[26px] items-center justify-center border border-[#f2f0ea]/[0.14] font-mono text-[11px] text-[#f2f0ea]/55 transition-colors hover:border-[#f2f0ea] hover:text-[#f2f0ea]"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      title="Restock +24"
                      onClick={() => updateStock(item, 24)}
                      className="flex h-[26px] w-[26px] items-center justify-center border font-mono text-[11px] transition-colors hover:border-[#d8ff3c] hover:text-[#d8ff3c]"
                      style={
                        low
                          ? { borderColor: 'rgba(216,255,60,.4)', color: '#d8ff3c' }
                          : { borderColor: 'rgba(242,240,234,.14)', color: 'rgba(242,240,234,.55)' }
                      }
                    >
                      ⟳
                    </button>
                    <button
                      type="button"
                      title="Remove this item"
                      onClick={() => handleDelete(item)}
                      className="flex h-[26px] w-[26px] items-center justify-center border border-[#f2f0ea]/[0.14] font-mono text-[11px] text-[#f2f0ea]/40 transition-colors hover:border-[#ff5c2b] hover:text-[#ff5c2b]"
                    >
                      ✕
                    </button>
                  </div>
                </TableRow>
              );
            })
          )}

          {/* The design's footer strip, with the way out of it on the right. */}
          <div className="flex items-center gap-3.5 border-t border-[#f2f0ea]/10 px-4 py-3 font-mono text-[10.5px] text-[#f2f0ea]/40">
            <span className="truncate">
              {filteredItems.length} of {items.length} items · ₹{Math.round(stockValue).toLocaleString('en-IN')} on the shelf
            </span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={exportItemsCsv}
              className="whitespace-nowrap tracking-[0.14em] transition-colors hover:text-[#d8ff3c]"
            >
              EXPORT CSV →
            </button>
          </div>
        </Panel>
      )}
      </>)}

      {/* ── Add/Edit Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0b0b0c]/90">
          <div className="bg-[#0d0d14] border border-white/[0.10] w-full max-w-md p-6">
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
                className="flex-1 py-2.5 bg-[#d8ff3c] hover:bg-[#d8ff3c] text-[#0b0b0c] font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
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
