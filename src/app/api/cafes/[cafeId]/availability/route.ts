import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ cafeId: string }> };

/**
 * GET /api/cafes/[cafeId]/availability?date=YYYY-MM-DD
 *
 * What is already taken at a café on a given day.
 *
 * Public on purpose: someone deciding whether to book has to see what is free
 * before they have an account, let alone a session. What they get is occupancy
 * and nothing else — a start time, a length, and which consoles were taken.
 *
 * That last part is why this route exists rather than an RLS policy. The
 * booking page used to read the bookings table straight from the browser,
 * which handed over customer names and phone numbers alongside the times. A
 * policy is row-level, so it could not have given out the times while
 * withholding the names; this can, by never selecting them.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { cafeId } = await params;
    const date = request.nextUrl.searchParams.get("date") || "";

    if (!cafeId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: "cafeId and a date of YYYY-MM-DD are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // No customer_name, no customer_phone, no user_id, no amount. Only what a
    // stranger needs in order to see whether a seat is free.
    const { data, error } = await supabase
      .from("bookings")
      .select("id, start_time, duration, booking_items(console, quantity)")
      .eq("cafe_id", cafeId)
      .eq("booking_date", date)
      .neq("status", "cancelled")
      .is("deleted_at", null);

    if (error) {
      console.error("Availability lookup failed:", error.message);
      return NextResponse.json({ error: "Could not load availability" }, { status: 500 });
    }

    return NextResponse.json({ bookings: data || [] });
  } catch (err) {
    console.error("Unexpected error reading availability:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
