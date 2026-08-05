import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/userAuth";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ bookingId: string }>;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { bookingId } = await params;
    if (!bookingId) {
      return NextResponse.json({ error: "Booking ID is required" }, { status: 400 });
    }

    const { userId, response: authResponse } = await requireUser(request);
    if (authResponse) return authResponse;

    const supabase = getSupabaseAdmin();

    const { data: booking, error: fetchError } = await supabase
      .from("bookings")
      .select("id, user_id, status, booking_date")
      .eq("id", bookingId)
      .maybeSingle();

    if (fetchError) {
      console.error("Error loading booking for cancellation:", fetchError);
      return NextResponse.json({ error: "Failed to load booking" }, { status: 500 });
    }

    if (!booking || booking.user_id !== userId) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    if ((booking.status || "").toLowerCase() === "cancelled") {
      return NextResponse.json({ error: "Booking is already cancelled" }, { status: 400 });
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    if (booking.booking_date && booking.booking_date < todayStr) {
      return NextResponse.json({ error: "Past bookings cannot be cancelled" }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from("bookings")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", bookingId);

    if (updateError) {
      console.error("Error cancelling booking:", updateError);
      return NextResponse.json({ error: "Failed to cancel booking" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Unexpected error cancelling booking:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
