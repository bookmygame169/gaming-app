import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser } from "@/lib/userAuth";
import { getIndiaDateString } from "@/lib/bookingFilters";
import { syncStationsForBooking } from "@/lib/stationSync";
import { sendBookingCancellation } from "@/lib/email";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ bookingId: string }>;
};

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
      .select(`
        id,
        user_id,
        status,
        booking_date,
        start_time,
        total_amount,
        cafes ( name )
      `)
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

    const todayStr = getIndiaDateString();
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

    // Re-locks the machine this booking was holding. Without it a cancelled
    // session leaves a PC unlocked and free to walk up to.
    await syncStationsForBooking(supabase, bookingId);

    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    const authUser = userData?.user;
    const userEmail = authUser?.email;
    if (userEmail) {
      const cafe = booking.cafes as { name?: string } | null;
      sendBookingCancellation({
        email: userEmail,
        name:
          authUser?.user_metadata?.full_name ||
          authUser?.user_metadata?.name ||
          undefined,
        bookingId,
        cafeName: cafe?.name || "Gaming Cafe",
        bookingDate: booking.booking_date
          ? new Date(booking.booking_date).toLocaleDateString("en-IN", { dateStyle: "long" })
          : "",
        startTime: booking.start_time || "",
        totalAmount: booking.total_amount || 0,
      }).catch((err) => console.error("Cancellation email failed:", err));
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Unexpected error cancelling booking:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
