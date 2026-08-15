import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser } from "@/lib/userAuth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ bookingId: string }> };

/**
 * How long the phone keeps saying something is about to happen.
 *
 * Past this it stops. The session is left alone — the owner may still be
 * checking their bank app, and cancelling a payment that genuinely arrived
 * would be worse than a wait — but the customer is told to go and ask rather
 * than left watching a spinner with no idea anything is wrong.
 */
const GIVE_UP_AFTER_MINUTES = 10;

/**
 * GET /api/play/session/[bookingId]
 *
 * Polled by a customer who has paid by UPI and is waiting for the café to
 * confirm it arrived. Answers one question: has it started yet?
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { bookingId } = await params;
    const { userId, response: authResponse } = await requireUser(request);
    if (authResponse) return authResponse;

    const supabase = getSupabaseAdmin();

    const { data: booking } = await supabase
      .from("bookings")
      .select("id, user_id, status, created_at")
      .eq("id", bookingId)
      .maybeSingle();

    // Checked against the caller, not just fetched. Otherwise anyone holding a
    // booking id could watch somebody else's session.
    if (!booking || booking.user_id !== userId) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const { data: claim } = await supabase
      .from("booking_payment_claims")
      .select("status, note")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const bookingStatus = (booking.status || "").toLowerCase();
    const claimStatus = (claim?.status || "").toLowerCase();

    const ageMinutes = booking.created_at
      ? (Date.now() - new Date(booking.created_at).getTime()) / 60_000
      : 0;

    // Rejected is read off the claim rather than the booking: the owner marking
    // a payment as not received is the decision the customer needs to hear
    // about, and it is the claim that carries their note explaining why.
    if (claimStatus === "rejected" || bookingStatus === "cancelled") {
      return NextResponse.json({
        state: "rejected",
        note: claim?.note || null,
      });
    }

    if (claimStatus === "verified" && bookingStatus !== "pending") {
      return NextResponse.json({ state: "started" });
    }

    return NextResponse.json({
      state: "waiting",
      // Whether a payment reference has been submitted at all - the phone shows
      // a different thing before and after that.
      claimed: Boolean(claim),
      givenUp: ageMinutes > GIVE_UP_AFTER_MINUTES,
    });
  } catch (err) {
    console.error("Unexpected error reading session state:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
