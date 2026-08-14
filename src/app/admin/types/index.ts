// Admin dashboard shared types

export type AdminStats = {
  totalCafes: number;
  activeCafes: number;
  pendingCafes: number;
  totalBookings: number;
  todayBookings: number;
  totalUsers: number;
  totalOwners: number;
  totalRevenue: number;
  todayRevenue: number;
  weekRevenue: number;
  monthRevenue: number;
};

export type CafeRow = {
  id: string;
  name: string;
  slug: string;
  address: string;
  city: string | null;
  phone: string | null;
  email: string | null;
  description: string | null;
  opening_hours: string | null;
  owner_id: string;
  is_active: boolean;
  is_featured?: boolean;
  created_at: string;
  price_starts_from: number | null;
  hourly_price: number | null;
  ps5_count: number;
  ps4_count: number;
  xbox_count: number;
  pc_count: number;
  vr_count: number;
  pool_count: number;
  snooker_count: number;
  arcade_count: number;
  steering_wheel_count: number;
  racing_sim_count: number;
  owner_name?: string;
  owner_email?: string;
  owner_phone?: string;
  total_bookings?: number;
  total_revenue?: number;
};

export type UserRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  created_at: string;
  total_bookings?: number;
  total_spent?: number;
  last_booking?: string;
};

export type BookingRow = {
  id: string;
  cafe_id: string;
  user_id: string | null;
  booking_date: string;
  start_time: string;
  duration: number;
  total_amount: number;
  status: string;
  source: string;
  customer_name: string | null;
  customer_phone: string | null;
  created_at: string;
  cafe_name?: string;
  user_name?: string;
};

export type OfflineCustomer = {
  phone: string;
  name: string;
  cafe_name: string;
  cafe_id: string;
  total_bookings: number;
  total_spent: number;
  last_visit: string;
};

export type NavTab = 'overview' | 'cafes' | 'users' | 'offline-customers' | 'bookings' | 'revenue' | 'reports' | 'settings' | 'announcements' | 'audit-logs' | 'coupons' | 'owner-access' | 'subscriptions';

export type AnnouncementRow = {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  target_audience: 'all' | 'users' | 'owners';
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
};

export type AuditLogRow = {
  id: string;
  admin_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

export type CouponRow = {
  id: string;
  cafe_id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  bonus_minutes: number;
  max_uses: number | null;
  uses_count: number;
  is_active: boolean;
  valid_from: string;
  valid_until: string | null;
  created_at: string;
  cafe_name?: string;
};
