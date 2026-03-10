'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, Button, Select } from './ui';
import { supabase } from '@/lib/supabaseClient';
import {
  TrendingUp,
  TrendingDown,
  Download,
  Package,
  DollarSign,
  ShoppingCart,
  AlertTriangle,
  Calendar,
  X,
  BarChart3,
  Percent,
} from 'lucide-react';
import {
  InventoryItem,
  BookingOrder,
  InventoryCategory,
  CATEGORY_LABELS,
  ItemSalesData,
} from '@/types/inventory';
import { getTimezoneOffset } from '../utils';

interface InventoryAnalyticsProps {
  cafeId: string;
}

const CATEGORY_COLORS: Record<InventoryCategory, { bg: string; text: string; bar: string }> = {
  snacks: { bg: 'bg-amber-500/10', text: 'text-amber-500', bar: 'bg-amber-500' },
  cold_drinks: { bg: 'bg-cyan-500/10', text: 'text-cyan-500', bar: 'bg-cyan-500' },
  hot_drinks: { bg: 'bg-red-500/10', text: 'text-red-500', bar: 'bg-red-500' },
  combo: { bg: 'bg-purple-500/10', text: 'text-purple-500', bar: 'bg-purple-500' },
};

export default function InventoryAnalytics({ cafeId }: InventoryAnalyticsProps) {
  const [dateRange, setDateRange] = useState('7d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<BookingOrder[]>([]);
  const [previousOrders, setPreviousOrders] = useState<BookingOrder[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);

  const getDateRange = useCallback((range: string) => {
    const now = new Date();

    const toLocalISODate = (date: Date) => {
      const offset = date.getTimezoneOffset();
      const localDate = new Date(date.getTime() - (offset * 60 * 1000));
      return localDate.toISOString().slice(0, 10);
    };

    const todayStr = toLocalISODate(now);
    let startDate = todayStr;
    let endDate = todayStr;
    let prevStartDate = todayStr;
    let prevEndDate = todayStr;

    if (range === 'today') {
      startDate = todayStr;
      endDate = todayStr;
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      prevStartDate = toLocalISODate(yesterday);
      prevEndDate = prevStartDate;
    } else if (range === '7d') {
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(now.getDate() - 6);
      startDate = toLocalISODate(sevenDaysAgo);
      endDate = todayStr;
      const fourteenDaysAgo = new Date(now);
      fourteenDaysAgo.setDate(now.getDate() - 13);
      prevStartDate = toLocalISODate(fourteenDaysAgo);
      const eightDaysAgo = new Date(now);
      eightDaysAgo.setDate(now.getDate() - 7);
      prevEndDate = toLocalISODate(eightDaysAgo);
    } else if (range === '30d') {
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(now.getDate() - 29);
      startDate = toLocalISODate(thirtyDaysAgo);
      endDate = todayStr;
      const sixtyDaysAgo = new Date(now);
      sixtyDaysAgo.setDate(now.getDate() - 59);
      prevStartDate = toLocalISODate(sixtyDaysAgo);
      const thirtyOneDaysAgo = new Date(now);
      thirtyOneDaysAgo.setDate(now.getDate() - 30);
      prevEndDate = toLocalISODate(thirtyOneDaysAgo);
    } else if (range === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      startDate = toLocalISODate(firstDay);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      endDate = toLocalISODate(lastDay);
      const prevFirstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prevStartDate = toLocalISODate(prevFirstDay);
      const prevLastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      prevEndDate = toLocalISODate(prevLastDay);
    } else if (range === 'all') {
      startDate = '2020-01-01';
      endDate = todayStr;
      prevStartDate = '2019-01-01';
      prevEndDate = '2019-12-31';
    } else if (range === 'custom' && customStart) {
      startDate = customStart;
      endDate = customEnd || customStart;
      const start = new Date(customStart);
      const end = new Date(customEnd || customStart);
      const duration = end.getTime() - start.getTime();
      const prevEnd = new Date(start.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - duration);
      prevStartDate = toLocalISODate(prevStart);
      prevEndDate = toLocalISODate(prevEnd);
    }

    return { startDate, endDate, prevStartDate, prevEndDate };
  }, [customStart, customEnd]);

  const fetchAnalyticsData = useCallback(async () => {
    setLoading(true);
    try {
      const { startDate, endDate, prevStartDate, prevEndDate } = getDateRange(dateRange);
      const now = new Date();



      // Fetch current period orders using inner join to avoid max limit of 1000 IDs in `.in()`
      const { data: currentOrders, error: currentError } = await supabase
        .from('booking_orders')
        .select('*, bookings!inner(id, cafe_id)')
        .eq('bookings.cafe_id', cafeId)
        .neq('bookings.status', 'cancelled')
        .gte('ordered_at', `${startDate}T00:00:00.000${getTimezoneOffset(now)}`)
        .lte('ordered_at', `${endDate}T23:59:59.999${getTimezoneOffset(now)}`);

      if (currentError) console.error("Error fetching current orders:", currentError);
      setOrders(currentOrders || []);

      // Fetch previous period orders using inner join
      const { data: prevOrders, error: prevError } = await supabase
        .from('booking_orders')
        .select('*, bookings!inner(id, cafe_id)')
        .eq('bookings.cafe_id', cafeId)
        .neq('bookings.status', 'cancelled')
        .gte('ordered_at', `${prevStartDate}T00:00:00.000${getTimezoneOffset(now)}`)
        .lte('ordered_at', `${prevEndDate}T23:59:59.999${getTimezoneOffset(now)}`);

      if (prevError) console.error("Error fetching previous orders:", prevError);
      setPreviousOrders(prevOrders || []);

      // Fetch inventory items with cost_price
      const { data: items } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('cafe_id', cafeId);

      setInventoryItems(items || []);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  }, [cafeId, dateRange, getDateRange]);

  useEffect(() => {
    fetchAnalyticsData();
  }, [fetchAnalyticsData]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalRevenue = orders.reduce((sum, o) => sum + (o.total_price || 0), 0);
    const totalItemsSold = orders.reduce((sum, o) => sum + (o.quantity || 0), 0);
    const totalOrders = orders.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Calculate cost and profit
    let totalCost = 0;
    orders.forEach(order => {
      const item = inventoryItems.find(i => i.id === order.inventory_item_id);
      if (item?.cost_price) {
        totalCost += (item.cost_price * order.quantity);
      }
    });
    const totalProfit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    // Previous period
    const prevRevenue = previousOrders.reduce((sum, o) => sum + (o.total_price || 0), 0);
    const prevItemsSold = previousOrders.reduce((sum, o) => sum + (o.quantity || 0), 0);
    const prevOrders = previousOrders.length;

    // Calculate changes
    const revenueChange = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;
    const itemsChange = prevItemsSold > 0 ? ((totalItemsSold - prevItemsSold) / prevItemsSold) * 100 : 0;
    const ordersChange = prevOrders > 0 ? ((totalOrders - prevOrders) / prevOrders) * 100 : 0;

    return {
      totalRevenue,
      totalCost,
      totalProfit,
      profitMargin,
      totalItemsSold,
      totalOrders,
      avgOrderValue,
      revenueChange,
      itemsChange,
      ordersChange,
    };
  }, [orders, previousOrders, inventoryItems]);

  // Most selling items
  const topSellingItems = useMemo(() => {
    const itemSales: Record<string, ItemSalesData> = {};

    orders.forEach(order => {
      const itemId = order.inventory_item_id || order.item_name;
      const item = inventoryItems.find(i => i.id === order.inventory_item_id);

      if (!itemSales[itemId]) {
        itemSales[itemId] = {
          itemId,
          itemName: order.item_name,
          category: item?.category || 'snacks',
          quantitySold: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
          profitMargin: 0,
        };
      }

      itemSales[itemId].quantitySold += order.quantity;
      itemSales[itemId].revenue += order.total_price;

      if (item?.cost_price) {
        const cost = item.cost_price * order.quantity;
        itemSales[itemId].cost += cost;
        itemSales[itemId].profit = itemSales[itemId].revenue - itemSales[itemId].cost;
        itemSales[itemId].profitMargin = itemSales[itemId].revenue > 0
          ? (itemSales[itemId].profit / itemSales[itemId].revenue) * 100
          : 0;
      }
    });

    return Object.values(itemSales)
      .sort((a, b) => b.quantitySold - a.quantitySold)
      .slice(0, 10);
  }, [orders, inventoryItems]);

  const maxQuantity = Math.max(...topSellingItems.map(i => i.quantitySold), 1);

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    const categories: Record<InventoryCategory, { qty: number; revenue: number; profit: number }> = {
      snacks: { qty: 0, revenue: 0, profit: 0 },
      cold_drinks: { qty: 0, revenue: 0, profit: 0 },
      hot_drinks: { qty: 0, revenue: 0, profit: 0 },
      combo: { qty: 0, revenue: 0, profit: 0 },
    };

    orders.forEach(order => {
      const item = inventoryItems.find(i => i.id === order.inventory_item_id);
      const category = item?.category || 'snacks';

      categories[category].qty += order.quantity;
      categories[category].revenue += order.total_price;

      if (item?.cost_price) {
        const cost = item.cost_price * order.quantity;
        categories[category].profit += (order.total_price - cost);
      } else {
        categories[category].profit += order.total_price;
      }
    });

    const totalRevenue = stats.totalRevenue || 1;

    return Object.entries(categories)
      .map(([cat, data]) => ({
        category: cat as InventoryCategory,
        ...data,
        percentage: (data.revenue / totalRevenue) * 100,
      }))
      .filter(c => c.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue);
  }, [orders, inventoryItems, stats.totalRevenue]);

  // Revenue trend
  const revenueTrendData = useMemo(() => {
    const daily: Record<string, number> = {};
    orders.forEach(order => {
      const dateObj = new Date(order.ordered_at);
      const date = dateObj.toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short'
      });
      daily[date] = (daily[date] || 0) + (order.total_price || 0);
    });
    return Object.entries(daily).map(([date, amount]) => ({ date, amount }));
  }, [orders]);

  // Stock alerts
  const stockAlerts = useMemo(() => {
    const lowStock = inventoryItems.filter(i => i.stock_quantity > 0 && i.stock_quantity <= 5 && i.is_available);
    const outOfStock = inventoryItems.filter(i => i.stock_quantity === 0 && i.is_available);
    return { lowStock, outOfStock };
  }, [inventoryItems]);

  // CSV Export
  const exportToCSV = () => {
    const headers = ['Item Name', 'Category', 'Quantity Sold', 'Revenue', 'Cost', 'Profit', 'Margin %'];
    const rows = topSellingItems.map(item => [
      item.itemName,
      CATEGORY_LABELS[item.category],
      item.quantitySold,
      item.revenue,
      item.cost,
      item.profit,
      item.profitMargin.toFixed(1)
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `inventory_analytics_${dateRange}_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Growth indicator component
  const GrowthIndicator = ({ value, suffix = '%' }: { value: number; suffix?: string }) => {
    if (value === 0) return <span className="text-slate-500 text-xs">No change</span>;
    const isPositive = value > 0;
    return (
      <span className={`flex items-center gap-1 text-xs font-medium ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
        {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        {isPositive ? '+' : ''}{value.toFixed(1)}{suffix}
      </span>
    );
  };

  const applyCustomRange = () => {
    if (customStart) {
      setDateRange('custom');
      setShowCustomPicker(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-cyan-500" />
            F&B Analytics
          </h2>
          <p className="text-slate-400 text-sm mt-1">Track sales, profit, and inventory performance</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-slate-900/50 p-1 rounded-xl border border-slate-800">
            <Select
              value={dateRange}
              onChange={(val) => {
                if (val === 'custom') {
                  setShowCustomPicker(true);
                } else {
                  setDateRange(val);
                }
              }}
              options={[
                { label: 'Today', value: 'today' },
                { label: 'Last 7 Days', value: '7d' },
                { label: 'Last 30 Days', value: '30d' },
                { label: 'This Month', value: 'month' },
                { label: 'All Time', value: 'all' },
                { label: 'Custom Range', value: 'custom' },
              ]}
              className="w-36 border-none bg-transparent"
            />
            <Button
              variant="ghost"
              className="h-9 w-9 p-0 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              onClick={exportToCSV}
              title="Export to CSV"
            >
              <Download size={18} />
            </Button>
          </div>
        </div>
      </div>

      {/* Custom Date Range Picker */}
      {showCustomPicker && (
        <Card className="relative animate-in slide-in-from-top-2 duration-200">
          <button
            onClick={() => setShowCustomPicker(false)}
            className="absolute top-4 right-4 p-1 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X size={18} className="text-slate-400" />
          </button>
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={20} className="text-cyan-500" />
            <h3 className="text-lg font-semibold text-white">Custom Date Range</h3>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm text-slate-400 mb-2">Start Date</label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm text-slate-400 mb-2">End Date</label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div className="flex items-end">
              <Button variant="primary" onClick={applyCustomRange} disabled={!customStart}>
                Apply Range
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card padding="lg" className="bg-gradient-to-br from-slate-900 to-slate-900/50 border-slate-800">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-400 mb-1">F&B Revenue</p>
              <p className="text-2xl font-bold text-white">₹{stats.totalRevenue.toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-1">{stats.totalOrders} orders</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
                <DollarSign size={18} />
              </div>
              <GrowthIndicator value={stats.revenueChange} />
            </div>
          </div>
        </Card>

        <Card padding="lg" className="bg-gradient-to-br from-slate-900 to-slate-900/50 border-slate-800">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-400 mb-1">Total Profit</p>
              <p className="text-2xl font-bold text-white">₹{stats.totalProfit.toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-1">After costs</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="p-2 rounded-xl bg-green-500/10 text-green-500">
                <TrendingUp size={18} />
              </div>
              <span className="text-xs text-slate-400">{stats.profitMargin.toFixed(1)}% margin</span>
            </div>
          </div>
        </Card>

        <Card padding="lg" className="bg-gradient-to-br from-slate-900 to-slate-900/50 border-slate-800">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-400 mb-1">Items Sold</p>
              <p className="text-2xl font-bold text-white">{stats.totalItemsSold}</p>
              <p className="text-xs text-slate-500 mt-1">Total units</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
                <ShoppingCart size={18} />
              </div>
              <GrowthIndicator value={stats.itemsChange} />
            </div>
          </div>
        </Card>

        <Card padding="lg" className="bg-gradient-to-br from-slate-900 to-slate-900/50 border-slate-800">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-400 mb-1">Avg Order</p>
              <p className="text-2xl font-bold text-white">₹{Math.round(stats.avgOrderValue)}</p>
              <p className="text-xs text-slate-500 mt-1">Per transaction</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
                <Percent size={18} />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Most Selling Items */}
        <Card className="min-h-[320px]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Package size={20} className="text-cyan-500" />
                Top Selling Items
              </h3>
              <p className="text-sm text-slate-400">By quantity sold</p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-48 text-slate-500">Loading...</div>
          ) : topSellingItems.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-slate-500">No sales data available</div>
          ) : (
            <div className="space-y-3">
              {topSellingItems.slice(0, 5).map((item, index) => {
                const colors = CATEGORY_COLORS[item.category];
                const widthPercent = (item.quantitySold / maxQuantity) * 100;

                return (
                  <div key={item.itemId} className="flex items-center gap-3">
                    <span className="text-slate-500 text-sm w-5">{index + 1}</span>
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium text-white truncate max-w-[150px]">{item.itemName}</span>
                        <span className="text-sm text-slate-400">{item.quantitySold} sold</span>
                      </div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${colors.bar} rounded-full transition-all duration-500`}
                          style={{ width: `${widthPercent}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className={`text-xs ${colors.text}`}>{CATEGORY_LABELS[item.category]}</span>
                        <span className="text-xs text-slate-500">₹{item.revenue.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Category Breakdown */}
        <Card className="min-h-[320px]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <BarChart3 size={20} className="text-purple-500" />
                Sales by Category
              </h3>
              <p className="text-sm text-slate-400">Revenue breakdown</p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-48 text-slate-500">Loading...</div>
          ) : categoryBreakdown.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-slate-500">No sales data available</div>
          ) : (
            <div className="space-y-4">
              {categoryBreakdown.map((cat) => {
                const colors = CATEGORY_COLORS[cat.category];

                return (
                  <div key={cat.category} className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${colors.bg} ${colors.text}`}>
                      <Package size={18} />
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium text-white">{CATEGORY_LABELS[cat.category]}</span>
                        <span className="text-sm text-slate-400">
                          ₹{cat.revenue.toLocaleString()} ({cat.percentage.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${colors.bar} rounded-full transition-all duration-500`}
                          style={{ width: `${cat.percentage}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-xs text-slate-500">{cat.qty} items sold</span>
                        <span className="text-xs text-emerald-400">₹{cat.profit.toLocaleString()} profit</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Revenue Trend */}
      {revenueTrendData.length > 0 && (
        <Card className="min-h-[280px]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <TrendingUp size={20} className="text-emerald-500" />
                Revenue Trend
              </h3>
              <p className="text-sm text-slate-400">Daily F&B earnings</p>
            </div>
          </div>

          <div className="w-full relative pt-6 pb-2">
            {(() => {
              const displayData = revenueTrendData.slice(-7);
              const maxInView = Math.max(...displayData.map(x => x.amount), 100);
              return (
                <div className="flex items-end justify-between px-2 gap-1" style={{ height: '150px' }}>
                  {displayData.map((d, i) => {
                    const barHeight = Math.max((d.amount / maxInView) * 100, 8);
                    const parts = d.date.split(' ');
                    const shortDate = `${parts[0].replace(',', '')} ${parts[1]}`;
                    return (
                      <div key={i} className="flex flex-col items-center gap-2 group flex-1">
                        <div className="w-full flex flex-col items-center h-full justify-end relative">
                          <div className="w-full max-w-[60px] relative flex items-end h-[120px]">
                            <div
                              className="w-full bg-cyan-500/20 border-t-2 border-cyan-500 rounded-t-sm hover:bg-cyan-500/40 transition-all relative"
                              style={{ height: `${barHeight}%` }}
                            >
                              <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-cyan-400 font-medium whitespace-nowrap">
                                ₹{d.amount.toLocaleString()}
                              </div>
                            </div>
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-500 whitespace-nowrap">{shortDate}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
          {revenueTrendData.length > 7 && (
            <p className="text-center text-xs text-slate-500 mt-3">Showing last 7 days of {revenueTrendData.length}</p>
          )}
        </Card>
      )}

      {/* Stock Alerts */}
      {(stockAlerts.lowStock.length > 0 || stockAlerts.outOfStock.length > 0) && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={20} className="text-amber-500" />
            <h3 className="text-lg font-semibold text-white">Stock Alerts</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {stockAlerts.outOfStock.length > 0 && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                <h4 className="text-sm font-medium text-red-400 mb-2">Out of Stock ({stockAlerts.outOfStock.length})</h4>
                <div className="space-y-1">
                  {stockAlerts.outOfStock.slice(0, 5).map(item => (
                    <div key={item.id} className="text-sm text-slate-300 flex justify-between">
                      <span>{item.name}</span>
                      <span className="text-red-400">0 left</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stockAlerts.lowStock.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                <h4 className="text-sm font-medium text-amber-400 mb-2">Low Stock ({stockAlerts.lowStock.length})</h4>
                <div className="space-y-1">
                  {stockAlerts.lowStock.slice(0, 5).map(item => (
                    <div key={item.id} className="text-sm text-slate-300 flex justify-between">
                      <span>{item.name}</span>
                      <span className="text-amber-400">{item.stock_quantity} left</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Empty State */}
      {!loading && orders.length === 0 && (
        <div className="text-center py-12 bg-slate-800/30 rounded-2xl border border-slate-700">
          <Package className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No F&B sales data for this period.</p>
          <p className="text-slate-500 text-sm mt-1">Try selecting a different date range.</p>
        </div>
      )}
    </div>
  );
}
