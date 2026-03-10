// Inventory Types

export type InventoryCategory = 'snacks' | 'cold_drinks' | 'hot_drinks' | 'combo';

export interface InventoryItem {
  id: string;
  cafe_id: string;
  name: string;
  category: InventoryCategory;
  price: number;
  cost_price?: number;
  stock_quantity: number;
  is_available: boolean;
  created_at: string;
}

export interface BookingOrder {
  id: string;
  booking_id: string;
  inventory_item_id: string | null;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  ordered_at: string;
}

export interface CartItem {
  inventory_item_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export const CATEGORY_LABELS: Record<InventoryCategory, string> = {
  snacks: 'Snacks',
  cold_drinks: 'Cold Drinks',
  hot_drinks: 'Hot Drinks',
  combo: 'Combos',
};

export const CATEGORY_ICONS: Record<InventoryCategory, string> = {
  snacks: '🍿',
  cold_drinks: '🥤',
  hot_drinks: '☕',
  combo: '🎁',
};

// Analytics Types
export interface ItemSalesData {
  itemId: string;
  itemName: string;
  category: InventoryCategory;
  quantitySold: number;
  revenue: number;
  cost: number;
  profit: number;
  profitMargin: number;
}

export interface CategoryBreakdown {
  category: InventoryCategory;
  quantitySold: number;
  revenue: number;
  profit: number;
  percentage: number;
}
