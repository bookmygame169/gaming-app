/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConsoleId } from "@/lib/constants";

export type OwnerStats = {
  cafesCount: number;
  bookingsToday: number;
  recentBookings: number;
  recentRevenue: number;
  todayRevenue: number;
  weekRevenue: number;
  monthRevenue: number;
  quarterRevenue: number;
  totalRevenue: number;
  totalBookings: number;
  pendingBookings: number;
};

export type CafeRow = {
  id: string;
  name: string | null;
  slug?: string | null;
  city?: string | null;
  address?: string | null;
  description?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  opening_hours?: string | null;
  status?: string | null;
  hourly_price?: number | null;
  price_starts_from?: number | null;
  google_maps_url?: string | null;
  instagram_url?: string | null;
  cover_url?: string | null;
  monitor_details?: string | null;
  processor_details?: string | null;
  gpu_details?: string | null;
  ram_details?: string | null;
  accessories_details?: string | null;
  peak_hours?: string | null;
  popular_games?: string | null;
  offers?: string | null;
  ps5_count?: number | null;
  ps4_count?: number | null;
  xbox_count?: number | null;
  pc_count?: number | null;
  pool_count?: number | null;
  snooker_count?: number | null;
  arcade_count?: number | null;
  vr_count?: number | null;
  steering_wheel_count?: number | null;
  racing_sim_count?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  user_id?: string | null;
  is_active?: boolean | null;
};

export type BookingRow = {
  id: string;
  cafe_id: string | null;
  user_id: string | null;
  booking_date: string | null;
  start_time: string | null;
  duration?: number | null;
  total_amount: number | null;
  status: string | null;
  source: string | null;
  payment_mode?: string | null;
  created_at: string | null;
  customer_name?: string | null; // For walk-in bookings only
  customer_phone?: string | null; // For walk-in bookings only
  booking_items?: Array<{
    id: string;
    console: string | null;
    quantity: number | null;
    price: number | null;
  }>;
  user_name?: string | null;
  user_email?: string | null;
  user_phone?: string | null;
  cafe_name?: string | null;
};

export type NavTab = 'dashboard' | 'sessions' | 'customers' | 'stations' | 'subscriptions' | 'memberships' | 'coupons' | 'reports' | 'settings' | 'overview' | 'live-status' | 'bookings' | 'cafe-details' | 'analytics' | 'billing' | 'inventory';

export type PricingTier = {
  qty1_30min: number | null;
  qty1_60min: number | null;
  qty2_30min: number | null;
  qty2_60min: number | null;
  qty3_30min: number | null;
  qty3_60min: number | null;
  qty4_30min: number | null;
  qty4_60min: number | null;
};

export type BillingItem = {
    id: string;
    console: ConsoleId;
    quantity: number;
    duration: number;
    price: number;
};
