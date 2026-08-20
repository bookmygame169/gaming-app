/**
 * The admin console's read path.
 *
 * These queries used to run in the browser against the public key, which only
 * worked while row-level security was off. They live on the server now, behind
 * the admin cookie, in /api/admin/lookup.
 */

async function lookup<T>(body: Record<string, unknown>, pick: (json: Record<string, unknown>) => T, fallback: T): Promise<T> {
  try {
    const res = await fetch("/api/admin/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error(`admin lookup "${body.shape}" failed:`, res.status);
      return fallback;
    }

    return pick(await res.json());
  } catch (err) {
    console.error(`admin lookup "${body.shape}" failed:`, err);
    return fallback;
  }
}

const rows = <T,>(json: Record<string, unknown>) => (json.rows as T[]) || [];

export type BookingStats = {
  totalBookings: number;
  todayBookings: number;
  revenueToday: number;
  revenueWeek: number;
  revenueMonth: number;
  revenueAll: number;
};

const ZERO_STATS: BookingStats = {
  totalBookings: 0, todayBookings: 0,
  revenueToday: 0, revenueWeek: 0, revenueMonth: 0, revenueAll: 0,
};

export function fetchBookingStats(today: string, weekStart: string, monthStart: string): Promise<BookingStats> {
  return lookup<BookingStats>(
    { shape: "booking-stats", today, weekStart, monthStart },
    (json) => json as unknown as BookingStats,
    ZERO_STATS
  );
}

export type Rollup = { bookings: number; revenue: number };
export type UserRollup = Rollup & { lastBookingAt: string | null };

export function fetchCafeRollup(): Promise<Record<string, Rollup>> {
  return lookup({ shape: "cafe-rollup" }, (json) => (json.byCafe as Record<string, Rollup>) || {}, {});
}

export function fetchUserRollup(): Promise<Record<string, UserRollup>> {
  return lookup({ shape: "user-rollup" }, (json) => (json.byUser as Record<string, UserRollup>) || {}, {});
}

export function fetchAdminBookings<T>(limit = 200): Promise<T[]> {
  return lookup<T[]>({ shape: "bookings-list", limit }, rows, []);
}

export function fetchAdminCustomers<T>(): Promise<T[]> {
  return lookup<T[]>({ shape: "customers" }, rows, []);
}

export function fetchAdminCoupons<T>(): Promise<T[]> {
  return lookup<T[]>({ shape: "coupons" }, rows, []);
}

export function fetchAdminMembershipPlans<T>(): Promise<T[]> {
  return lookup<T[]>({ shape: "membership-plans" }, rows, []);
}

export function fetchAdminSubscriptions<T>(): Promise<T[]> {
  return lookup<T[]>({ shape: "subscriptions" }, rows, []);
}

export function fetchAdminCafeBookings<T>(cafeId: string): Promise<T[]> {
  return lookup<T[]>({ shape: "cafe-bookings", cafeId }, rows, []);
}

export function fetchAdminCafeMembershipPlans<T>(cafeId: string): Promise<T[]> {
  return lookup<T[]>({ shape: "cafe-membership-plans", cafeId }, rows, []);
}

export function fetchAdminCafeCoupons<T>(cafeId: string): Promise<T[]> {
  return lookup<T[]>({ shape: "cafe-coupons", cafeId }, rows, []);
}

export function fetchAdminUserBookings<T>(userId: string): Promise<T[]> {
  return lookup<T[]>({ shape: "user-bookings", userId }, rows, []);
}

export function fetchAdminReportBookings<T>(from: string): Promise<T[]> {
  return lookup<T[]>({ shape: "report-bookings", from }, rows, []);
}
