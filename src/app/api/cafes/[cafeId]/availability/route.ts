import { NextRequest, NextResponse } from "next/server";
import { computeConsoleAvailability, consoleLimitsFromCafe } from "@/lib/computeAvailability";
import { excludeCancelled, excludeDeleted } from "@/lib/db/bookings";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ cafeId: string }> };

/**
 * GET /api/cafes/[cafeId]/availability?date=YYYY-MM-DD&time=...&duration=60
 *
 * Occupancy for a slot, computed on the server. The client never receives
 * booking rows (names, phones, or otherwise).
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { cafeId } = await params;
    const date = request.nextUrl.searchParams.get("date") || "";
    const time = request.nextUrl.searchParams.get("time") || "";
    const durationRaw = request.nextUrl.searchParams.get("duration") || "60";
    const duration = Number.parseInt(durationRaw, 10) || 60;

    if (!cafeId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: "cafeId and a date of YYYY-MM-DD are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: cafe, error: cafeError } = await supabase
      .from("cafes")
      .select(
        "ps5_count, ps4_count, xbox_count, pc_count, pool_count, snooker_count, arcade_count, vr_count, steering_wheel_count, racing_sim_count"
      )
      .eq("id", cafeId)
      .maybeSingle();

    if (cafeError) {
      console.error("Availability cafe lookup failed:", cafeError.message);
      return NextResponse.json({ error: "Could not load availability" }, { status: 500 });
    }

    let bookingsQuery = supabase
      .from("bookings")
      .select("start_time, duration, booking_items(console, quantity)")
      .eq("cafe_id", cafeId)
      .eq("booking_date", date);

    bookingsQuery = excludeDeleted(excludeCancelled(bookingsQuery));

    const { data, error } = await bookingsQuery;

    if (error) {
      console.error("Availability lookup failed:", error.message);
      return NextResponse.json({ error: "Could not load availability" }, { status: 500 });
    }

    if (!time) {
      return NextResponse.json({
        bookings: data || [],
        availability: {},
      });
    }

    const availability = computeConsoleAvailability({
      selectedTime: time,
      selectedDuration: duration,
      consoleLimits: consoleLimitsFromCafe(cafe as Record<string, unknown>),
      bookings: data || [],
    });

    return NextResponse.json({ availability });
  } catch (err) {
    console.error("Unexpected error reading availability:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
