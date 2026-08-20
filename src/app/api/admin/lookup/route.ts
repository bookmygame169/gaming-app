import { NextRequest, NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/lookup
 *
 * The admin console's reads of the tables that browsers may no longer touch.
 *
 * Same reasoning as /api/owner/lookup: the console signs in with its own
 * cookie, not a Supabase session, so its requests are anonymous to Postgres
 * and no policy can tell them from anyone else's. Shapes are fixed here; the
 * caller names one and never a table, column or filter.
 *
 * Two of these also fix an N+1. The console was fetching a booking count and a
 * revenue total per café, and again per user, in a loop from the browser — one
 * round trip each, several dozen in all. They are single passes now.
 */

/** The columns every booking list here returns. Fixed, and never passed in. */
const BOOKING_COLUMNS =
  `id, cafe_id, user_id, booking_date, start_time, duration, total_amount,
   status, source, customer_name, customer_phone, created_at`;

function sum(rows: { total_amount?: number | string | null }[]): number {
  return rows.reduce((total, row) => total + (Number(row.total_amount) || 0), 0);
}

export async function POST(request: NextRequest) {
  try {
    const { context, response } = await requireAdminContext(request);
    if (response) return response;

    const supabase = context!.supabase;
    const body = await request.json().catch(() => ({}));
    const shape = String(body?.shape || "");

    switch (shape) {
      case "booking-stats": {
        const today = String(body?.today || "");
        const weekStart = String(body?.weekStart || "");
        const monthStart = String(body?.monthStart || "");

        const live = supabase.from("bookings").select("total_amount, booking_date").is("deleted_at", null);

        const [{ count: total }, { count: todayCount }, { data: revenueRows }] = await Promise.all([
          supabase.from("bookings").select("id", { count: "exact", head: true }).is("deleted_at", null),
          supabase
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .eq("booking_date", today)
            .is("deleted_at", null),
          live.neq("status", "cancelled"),
        ]);

        const rows = revenueRows || [];
        const onOrAfter = (from: string) =>
          rows.filter((row) => String(row.booking_date || "") >= from);

        return NextResponse.json({
          totalBookings: total ?? 0,
          todayBookings: todayCount ?? 0,
          revenueToday: sum(rows.filter((row) => row.booking_date === today)),
          revenueWeek: sum(onOrAfter(weekStart)),
          revenueMonth: sum(onOrAfter(monthStart)),
          revenueAll: sum(rows),
        });
      }

      case "cafe-rollup": {
        // One pass, then grouped here. This replaced two queries per café in a
        // browser loop.
        const { data, error } = await supabase
          .from("bookings")
          .select("cafe_id, total_amount, status")
          .is("deleted_at", null);

        if (error) throw error;

        const byCafe: Record<string, { bookings: number; revenue: number }> = {};
        for (const row of data || []) {
          const key = String(row.cafe_id);
          byCafe[key] ??= { bookings: 0, revenue: 0 };
          byCafe[key].bookings += 1;
          if (row.status !== "cancelled") {
            byCafe[key].revenue += Number(row.total_amount) || 0;
          }
        }

        return NextResponse.json({ byCafe });
      }

      case "user-rollup": {
        const { data, error } = await supabase
          .from("bookings")
          .select("user_id, total_amount, created_at, status")
          .not("user_id", "is", null)
          .is("deleted_at", null);

        if (error) throw error;

        const byUser: Record<string, { bookings: number; revenue: number; lastBookingAt: string | null }> = {};
        for (const row of data || []) {
          const key = String(row.user_id);
          byUser[key] ??= { bookings: 0, revenue: 0, lastBookingAt: null };
          byUser[key].bookings += 1;
          if (row.status !== "cancelled") {
            byUser[key].revenue += Number(row.total_amount) || 0;
          }
          const at = row.created_at as string | null;
          if (at && (!byUser[key].lastBookingAt || at > byUser[key].lastBookingAt!)) {
            byUser[key].lastBookingAt = at;
          }
        }

        return NextResponse.json({ byUser });
      }

      case "bookings-list": {
        const { data, error } = await supabase
          .from("bookings")
          .select(
            `id, cafe_id, user_id, booking_date, start_time, duration, total_amount,
             status, source, customer_name, customer_phone, created_at`
          )
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(Math.min(500, Number(body?.limit) || 200));

        if (error) throw error;
        return NextResponse.json({ rows: data || [] });
      }

      case "customers": {
        const { data, error } = await supabase
          .from("bookings")
          .select("customer_name, customer_phone, cafe_id, total_amount, booking_date, cafes(name)")
          .not("customer_phone", "is", null)
          .not("customer_name", "is", null)
          .is("deleted_at", null);

        if (error) throw error;
        return NextResponse.json({ rows: data || [] });
      }

      case "coupons": {
        const { data, error } = await supabase
          .from("coupons")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) throw error;
        return NextResponse.json({ rows: data || [] });
      }

      case "membership-plans": {
        const { data, error } = await supabase
          .from("membership_plans")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) throw error;
        return NextResponse.json({ rows: data || [] });
      }

      case "subscriptions": {
        const { data, error } = await supabase
          .from("subscriptions")
          .select(
            `id, cafe_id, customer_name, customer_phone, amount_paid, purchase_date,
             hours_remaining, timer_active, membership_plans(name, console_type, plan_type)`
          )
          .order("purchase_date", { ascending: false });

        if (error) throw error;
        return NextResponse.json({ rows: data || [] });
      }

      case "cafe-bookings": {
        const cafeId = String(body?.cafeId || "");
        if (!cafeId) {
          return NextResponse.json({ error: "cafeId is required" }, { status: 400 });
        }

        // Columns fixed here, not passed in. Letting the caller choose them
        // would have been the same mistake as a query proxy, in a smaller
        // costume.
        const { data, error } = await supabase
          .from("bookings")
          .select(BOOKING_COLUMNS)
          .eq("cafe_id", cafeId)
          .is("deleted_at", null)
          .order("booking_date", { ascending: false })
          .order("start_time", { ascending: false })
          .limit(500);

        if (error) throw error;
        return NextResponse.json({ rows: data || [] });
      }

      case "cafe-membership-plans": {
        const cafeId = String(body?.cafeId || "");
        if (!cafeId) return NextResponse.json({ error: "cafeId is required" }, { status: 400 });

        const { data, error } = await supabase
          .from("membership_plans")
          .select("*")
          .eq("cafe_id", cafeId)
          .order("created_at", { ascending: false });

        if (error) throw error;
        return NextResponse.json({ rows: data || [] });
      }

      case "cafe-coupons": {
        const cafeId = String(body?.cafeId || "");
        if (!cafeId) return NextResponse.json({ error: "cafeId is required" }, { status: 400 });

        const { data, error } = await supabase
          .from("coupons")
          .select("*")
          .eq("cafe_id", cafeId)
          .order("created_at", { ascending: false });

        if (error) throw error;
        return NextResponse.json({ rows: data || [] });
      }

      case "user-bookings": {
        const userId = String(body?.userId || "");
        if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

        const { data, error } = await supabase
          .from("bookings")
          .select(BOOKING_COLUMNS)
          .eq("user_id", userId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) throw error;
        return NextResponse.json({ rows: data || [] });
      }

      case "report-bookings": {
        const from = String(body?.from || "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) {
          return NextResponse.json({ error: "from must be YYYY-MM-DD" }, { status: 400 });
        }

        const { data, error } = await supabase
          .from("bookings")
          .select("booking_date, start_time, total_amount, status, source")
          .gte("booking_date", from)
          .is("deleted_at", null)
          .order("booking_date", { ascending: true });

        if (error) throw error;
        return NextResponse.json({ rows: data || [] });
      }

      default:
        return NextResponse.json({ error: "Unknown lookup" }, { status: 400 });
    }
  } catch (err) {
    console.error("Admin lookup failed:", err);
    return NextResponse.json({ error: "Could not load that." }, { status: 500 });
  }
}
