import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser } from "@/lib/userAuth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ bookingId: string }> };

/**
 * POST /api/play/session/[bookingId]/cancel
 *
 * Abandons a UPI session the customer has given up on — they closed the payment
 * app without paying, or paid the wrong thing, or changed their mind.
 *
 * Without this a failed attempt sits there for ten minutes, and a customer who
 * scans again is handed the same dead session back. Being able to say "that one
 * is finished" is what makes resuming safe to offer rather than a trap.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { bookingId } = await params;
    const { userId, response: authResponse } = await requireUser(request);
    if (authResponse) return authResponse;

    const supabase = getSupabaseAdmin();

    const { data: booking } = await supabase
      .from("bookings")
      .select("id, user_id, status")
      .eq("id", bookingId)
      .maybeSingle();

    if (!booking || booking.user_id !== userId) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Only a session still waiting. One the owner has already confirmed is a
    // paid session in progress, and the customer must not be able to void it
    // from their phone.
    if ((booking.status || "").toLowerCase() !== "pending") {
      return NextResponse.json(
        { error: "That session has already been dealt with." },
        { status: 409 }
      );
    }

    await supabase.from("bookings").update({ status: "cancelled" }).eq("id", bookingId);

    // The claim goes with it, so the owner is not left looking at a payment to
    // check for a session that no longer exists.
    await supabase
      .from("booking_payment_claims")
      .update({ status: "rejected", note: "Cancelled by the customer" })
      .eq("booking_id", bookingId)
      .eq("status", "claimed");

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Unexpected error cancelling a play session:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
