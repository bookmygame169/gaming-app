// Inventory Management Component - Can be removed along with inventory feature
"use client";

import { useState, useEffect, useCallback } from "react";
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

const CATEGORY_CONFIG: Record<InventoryCategory, { icon: React.ReactNode; color: string }> = {
  snacks: { icon: <Cookie className="w-4 h-4" />, color: "#f59e0b" },
  cold_drinks: { icon: <GlassWater className="w-4 h-4" />, color: "#06b6d4" },
  hot_drinks: { icon: <Coffee className="w-4 h-4" />, color: "#ef4444" },
  combo: { icon: <Gift className="w-4 h-4" />, color: "#8b5cf6" },
};

export default function Inventory({ cafeId }: InventoryProps) {
  const [activeTab, setActiveTab] = useState<'items' | 'analytics'>('items');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<InventoryCategory | "all">("all");

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    name: "",
    category: "snacks" as InventoryCategory,
    price: "",
    cost_price: "",
    stock_quantity: "",
    is_available: true,
  });

  // Load inventory items
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

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // Filter items
  const filteredItems = items.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === "all" || item.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  // Group by category
  const groupedItems = filteredItems.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<InventoryCategory, InventoryItem[]>);

  // Open add modal
  function openAddModal() {
    setEditingItem(null);
    setFormData({
      name: "",
      category: "snacks",
      price: "",
      cost_price: "",
      stock_quantity: "",
      is_available: true,
    });
    setError(null);
    setShowModal(true);
  }

  // Open edit modal
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

  // Save item
  async function handleSave() {
    if (!formData.name.trim()) {
      setError("Name is required");
      return;
    }
    if (formData.price === "" || parseFloat(formData.price) < 0) {
      setError("Valid price is required (can be 0 for free items)");
      return;
    }

    try {
      setSaving(true);
      setError(null);

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
        // Update existing
        const { error } = await supabase
          .from("inventory_items")
          .update(itemData)
          .eq("id", editingItem.id);

        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabase
          .from("inventory_items")
          .insert(itemData);

        if (error) throw error;
      }

      setShowModal(false);
      loadItems();
    } catch (err) {
      console.error("Error saving item:", err);
      setError(err instanceof Error ? err.message : "Failed to save item");
    } finally {
      setSaving(false);
    }
  }

  // Delete item
  async function handleDelete(item: InventoryItem) {
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;

    try {
      // First check if item has any associated orders
      const { data: orders, error: checkError } = await supabase
        .from("booking_orders")
        .select("id")
        .eq("inventory_item_id", item.id)
        .limit(1);

      if (checkError) {
        console.error("Error checking orders:", checkError);
      }

      if (orders && orders.length > 0) {
        // Item has orders, just mark as unavailable instead of deleting
        const { error: updateError } = await supabase
          .from("inventory_items")
          .update({ is_available: false, stock_quantity: 0 })
          .eq("id", item.id);

        if (updateError) throw updateError;
        alert("Item has been marked as unavailable (it has associated orders).");
        loadItems();
        return;
      }

      // No orders, safe to delete
      const { error, data } = await supabase
        .from("inventory_items")
        .delete()
        .eq("id", item.id)
        .select();

      console.log("Delete result:", { error, data, itemId: item.id });

      if (error) {
        console.error("Delete error details:", JSON.stringify(error, null, 2));
        throw error;
      }

      loadItems();
    } catch (err) {
      console.error("Error deleting item:", err);
      alert(`Failed to delete item: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  // Toggle availability
  async function toggleAvailability(item: InventoryItem) {
    try {
      const { error } = await supabase
        .from("inventory_items")
        .update({ is_available: !item.is_available })
        .eq("id", item.id);

      if (error) throw error;
      loadItems();
    } catch (err) {
      console.error("Error toggling availability:", err);
    }
  }

  // Update stock
  async function updateStock(item: InventoryItem, change: number) {
    const newStock = Math.max(0, item.stock_quantity + change);
    try {
      const { error } = await supabase
        .from("inventory_items")
        .update({ stock_quantity: newStock })
        .eq("id", item.id);

      if (error) throw error;
      loadItems();
    } catch (err) {
      console.error("Error updating stock:", err);
    }
  }

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
            Inventory
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Manage snacks, drinks, and combos
          </p>
        </div>
        {activeTab === 'items' && (
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl font-semibold transition"
          >
            <Plus className="w-5 h-5" />
            Add Item
          </button>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-slate-700 pb-2">
        <button
          onClick={() => setActiveTab('items')}
          className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition ${
            activeTab === 'items'
              ? 'bg-cyan-500/20 text-cyan-400 border-b-2 border-cyan-500'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Package className="w-4 h-4" />
          Items
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition ${
            activeTab === 'analytics'
              ? 'bg-cyan-500/20 text-cyan-400 border-b-2 border-cyan-500'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Analytics
        </button>
      </div>

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <InventoryAnalytics cafeId={cafeId} />
      )}

      {/* Items Tab Content */}
      {activeTab === 'items' && (
        <>
          {/* Filters */}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Search items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500"
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value as InventoryCategory | "all")}
          className="px-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-cyan-500"
        >
          <option value="all">All Categories</option>
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <div className="text-2xl font-bold text-white">{items.length}</div>
          <div className="text-sm text-slate-400">Total Items</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <div className="text-2xl font-bold text-green-400">
            {items.filter(i => i.is_available).length}
          </div>
          <div className="text-sm text-slate-400">Available</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <div className="text-2xl font-bold text-amber-400">
            {items.filter(i => i.stock_quantity > 0 && i.stock_quantity <= 5).length}
          </div>
          <div className="text-sm text-slate-400">Low Stock</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <div className="text-2xl font-bold text-red-400">
            {items.filter(i => i.stock_quantity === 0).length}
          </div>
          <div className="text-sm text-slate-400">Out of Stock</div>
        </div>
      </div>

      {/* Items List */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-12 bg-slate-800/30 rounded-2xl border border-slate-700">
          <Package className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">
            {items.length === 0 ? "No items yet. Add your first item!" : "No items match your search."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedItems).map(([category, categoryItems]) => {
            const config = CATEGORY_CONFIG[category as InventoryCategory];
            return (
              <div key={category}>
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="p-1.5 rounded-lg"
                    style={{ backgroundColor: `${config.color}20` }}
                  >
                    <div style={{ color: config.color }}>{config.icon}</div>
                  </div>
                  <h3 className="font-semibold text-white">
                    {CATEGORY_LABELS[category as InventoryCategory]}
                  </h3>
                  <span className="text-sm text-slate-400">({categoryItems.length})</span>
                </div>

                <div className="grid gap-3">
                  {categoryItems.map((item) => (
                    <div
                      key={item.id}
                      className={`bg-slate-800/50 border rounded-xl p-4 flex items-center justify-between gap-4 ${
                        item.is_available ? "border-slate-700" : "border-red-500/30 opacity-60"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white truncate">{item.name}</span>
                          {!item.is_available && (
                            <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full">
                              Unavailable
                            </span>
                          )}
                          {item.stock_quantity === 0 && item.is_available && (
                            <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full">
                              Out of Stock
                            </span>
                          )}
                          {item.stock_quantity > 0 && item.stock_quantity <= 5 && (
                            <span className="text-xs px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded-full">
                              Low Stock
                            </span>
                          )}
                        </div>
                        <div className="text-lg font-bold text-cyan-400 mt-1">
                          ₹{item.price}
                        </div>
                      </div>

                      {/* Stock controls */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateStock(item, -1)}
                          disabled={item.stock_quantity === 0}
                          className="w-8 h-8 flex items-center justify-center bg-slate-700 hover:bg-slate-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          -
                        </button>
                        <span className="w-12 text-center font-medium text-white">
                          {item.stock_quantity}
                        </span>
                        <button
                          onClick={() => updateStock(item, 1)}
                          className="w-8 h-8 flex items-center justify-center bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
                        >
                          +
                        </button>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleAvailability(item)}
                          className={`p-2 rounded-lg transition ${
                            item.is_available
                              ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                              : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                          }`}
                          title={item.is_available ? "Mark unavailable" : "Mark available"}
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEditModal(item)}
                          className="p-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(item)}
                          className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">
                {editingItem ? "Edit Item" : "Add New Item"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-slate-800 rounded-lg transition"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-xl flex items-center gap-2 text-red-400">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Item Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Coca Cola"
                  className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Category
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as InventoryCategory })}
                  className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                >
                  {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Selling Price (₹)
                  </label>
                  <input
                    type="number"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="0"
                    min="0"
                    step="1"
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Cost Price (₹)
                  </label>
                  <input
                    type="number"
                    value={formData.cost_price}
                    onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
                    placeholder="Optional"
                    min="0"
                    step="1"
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Stock Quantity
                </label>
                <input
                  type="number"
                  value={formData.stock_quantity}
                  onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value })}
                  placeholder="0"
                  min="0"
                  className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, is_available: !formData.is_available })}
                  className={`relative w-12 h-6 rounded-full transition ${
                    formData.is_available ? "bg-cyan-500" : "bg-slate-700"
                  }`}
                >
                  <div
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      formData.is_available ? "translate-x-7" : "translate-x-1"
                    }`}
                  />
                </button>
                <span className="text-slate-300">Available for sale</span>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    {editingItem ? "Update" : "Add Item"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
