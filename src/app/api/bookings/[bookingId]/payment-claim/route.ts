import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser } from "@/lib/userAuth";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ bookingId: string }>;
};

/**
 * POST /api/bookings/[bookingId]/payment-claim
 *
 * The customer telling us they have paid.
 *
 * This is a claim, not a payment. A UPI deep link hands the customer to their
 * bank app and never reports back, so without a payment gateway there is no
 * way for this app to know the money moved. Recording the claim and putting it
 * in front of the owner is the honest version of that: the booking stays
 * 'pending' — and the machine stays locked — until the owner confirms it
 * against their own statement.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { bookingId } = await params;
    if (!bookingId) {
      return NextResponse.json({ error: "Booking ID is required" }, { status: 400 });
    }

    const { userId, response: authResponse } = await requireUser(request);
    if (authResponse) return authResponse;

    const body = await request.json().catch(() => ({}));
    const reference = typeof body.reference === "string" ? body.reference.trim() : "";

    // The UTR is what the owner matches against their statement. Without it
    // they are being asked to take the customer's word for it.
    if (reference.length < 6 || reference.length > 40) {
      return NextResponse.json(
        { error: "Enter the reference number from your payment app (at least 6 characters)." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, cafe_id, user_id, total_amount, status, deleted_at")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError) {
      console.error("Payment claim: booking lookup failed:", bookingError.message);
      return NextResponse.json({ error: "Could not load that booking." }, { status: 500 });
    }

    if (!booking || booking.user_id !== userId || booking.deleted_at) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    if ((booking.status || "").toLowerCase() === "cancelled") {
      return NextResponse.json(
        { error: "This booking was cancelled. Contact the café about the payment." },
        { status: 400 }
      );
    }

    // The amount comes from the booking, never the request. A customer naming
    // their own paid amount is the same hole as a customer naming their price.
    const { error: insertError } = await supabase.from("booking_payment_claims").insert({
      booking_id: bookingId,
      cafe_id: booking.cafe_id,
      amount: Math.max(0, Math.round(Number(booking.total_amount) || 0)),
      reference,
      status: "claimed",
    });

    if (insertError) {
      // 23505 is the one-open-claim-per-booking index: they already told us.
      if (insertError.code === "23505") {
        return NextResponse.json({
          success: true,
          alreadyClaimed: true,
          message: "We already have this. The café will confirm it shortly.",
        });
      }

      if (insertError.message.includes("booking_payment_claims")) {
        return NextResponse.json(
          {
            error:
              "Payment confirmation is not set up yet. Run migration " +
              "20260810000002_per_cafe_upi_and_payment_claims.sql in Supabase.",
          },
          { status: 500 }
        );
      }

      console.error("Could not record payment claim:", insertError.message);
      return NextResponse.json({ error: "Could not record your payment." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Thanks — the café will confirm your payment shortly.",
    });
  } catch (err) {
    console.error("Unexpected error recording payment claim:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
