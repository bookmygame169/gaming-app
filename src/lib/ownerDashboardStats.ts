import type { SupabaseClient } from "@supabase/supabase-js";
import { getIndiaDateDaysAgo, getIndiaDateString, getIndiaDateTimeParts } from "@/lib/indiaTime";
import { isBillableRevenueBooking, toOwnerAmount } from "@/lib/ownerRevenue";

export type OwnerServerStats = {
  bookingsToday: number;
  pendingBookings: number;
  totalBookings: number;
  todayRevenue: number;
  weekRevenue: number;
  monthRevenue: number;
  quarterRevenue: number;
  totalRevenue: number;
};

type StatRow = {
  booking_date: string | null;
  total_amount: number | string | null;
  status: string | null;
  payment_mode: string | null;
  deleted_at: string | null;
};

const PAGE_SIZE = 1000;

function indiaWeekStartSunday(): string {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
  }).format(new Date());
  const offset = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[weekday] ?? 0;
  return getIndiaDateDaysAgo(offset);
}

function indiaMonthAndQuarterStarts(): { monthStart: string; quarterStart: string } {
  const parts = getIndiaDateTimeParts();
  const month = Number(parts.month);
  const quarterMonth = String(Math.floor((month - 1) / 3) * 3 + 1).padStart(2, "0");
  return {
    monthStart: `${parts.year}-${parts.month}-01`,
    quarterStart: `${parts.year}-${quarterMonth}-01`,
  };
}

function sumRevenue(rows: StatRow[], fromDate?: string): number {
  return rows.reduce((sum, row) => {
    if (!isBillableRevenueBooking(row)) return sum;
    if (fromDate && (!row.booking_date || row.booking_date < fromDate)) return sum;
    return sum + toOwnerAmount(row.total_amount);
  }, 0);
}

async function loadAllStatRows(
  supabase: SupabaseClient,
  cafeIds: string[],
  fromDate?: string
): Promise<StatRow[]> {
  const rows: StatRow[] = [];
  const columns = "id, booking_date, total_amount, status, payment_mode, deleted_at";

  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from("bookings")
      .select(columns)
      .in("cafe_id", cafeIds)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (fromDate) {
      query = query.gte("booking_date", fromDate);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const chunk = (data ?? []) as StatRow[];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }

  return rows;
}

/**
 * Revenue figures for the dashboard, independent of the 300-row booking dump.
 * Nested snack/item lines are ignored here; the booking total is the ledger.
 */
export async function loadOwnerRevenueStats(
  supabase: SupabaseClient,
  cafeIds: string[]
): Promise<OwnerServerStats> {
  const empty: OwnerServerStats = {
    bookingsToday: 0,
    pendingBookings: 0,
    totalBookings: 0,
    todayRevenue: 0,
    weekRevenue: 0,
    monthRevenue: 0,
    quarterRevenue: 0,
    totalRevenue: 0,
  };

  if (cafeIds.length === 0) return empty;

  const today = getIndiaDateString();
  const weekStart = indiaWeekStartSunday();
  const { monthStart, quarterStart } = indiaMonthAndQuarterStarts();

  try {
    const [lifetimeRows, pendingResult, livingResult] = await Promise.all([
      loadAllStatRows(supabase, cafeIds),
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .in("cafe_id", cafeIds)
        .is("deleted_at", null)
        .eq("status", "pending"),
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .in("cafe_id", cafeIds)
        .is("deleted_at", null),
    ]);

    const quarterRows = lifetimeRows.filter(
      (row) => row.booking_date && row.booking_date >= quarterStart
    );
    const billableToday = quarterRows.filter(
      (row) => isBillableRevenueBooking(row) && row.booking_date === today
    );

    return {
      bookingsToday: billableToday.length,
      pendingBookings: pendingResult.count ?? 0,
      totalBookings: livingResult.count ?? 0,
      todayRevenue: billableToday.reduce((sum, row) => sum + toOwnerAmount(row.total_amount), 0),
      weekRevenue: sumRevenue(quarterRows, weekStart),
      monthRevenue: sumRevenue(quarterRows, monthStart),
      quarterRevenue: sumRevenue(quarterRows, quarterStart),
      totalRevenue: sumRevenue(lifetimeRows),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[owner/data] revenue stats failed:", message);
    return empty;
  }
}
