import { NextRequest, NextResponse } from "next/server";
import { requireOwnerCafeAccess, requireOwnerContext } from "@/lib/ownerAuth";
import { syncStationsForBooking } from "@/lib/stationSync";
import { getInitialOwnerBookingStatus } from "@/lib/bookingFilters";

export const dynamic = "force-dynamic";

type ClaimRow = {
  id: string;
  booking_id: string;
  amount: number;
  reference: string | null;
  status: string;
  note: string | null;
  verified_at: string | null;
  created_at: string;
};

function missingTableResponse(message: string) {
  return NextResponse.json(
    {
      error: message.includes("booking_payment_claims")
        ? "Payments are not set up yet. Run migration 20260810000002_per_cafe_upi_and_payment_claims.sql in Supabase."
        : message,
    },
    { status: 500 }
  );
}

/**
 * GET /api/owner/payments?cafeId=...
 *
 * Customers who say they have paid, waiting to be checked against the café's
 * own statement.
 */
export async function GET(request: NextRequest) {
  const auth = await requireOwnerContext(request);
  if (auth.response) return auth.response;

  const { ownerId, supabase } = auth.context;
  const cafeId = request.nextUrl.searchParams.get("cafeId");

  if (!cafeId) {
    return NextResponse.json({ error: "cafeId is required" }, { status: 400 });
  }

  const accessError = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
  if (accessError) return accessError;

  const { data, error } = await supabase
    .from("booking_payment_claims")
    .select("id, booking_id, amount, reference, status, note, verified_at, created_at")
    .eq("cafe_id", cafeId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return missingTableResponse(error.message);

  const claims = (data ?? []) as ClaimRow[];
  if (claims.length === 0) {
    return NextResponse.json({ claims: [], pendingCount: 0 });
  }

  // The booking is what the owner is really looking at — who, when, how much it
  // should have been — so it is joined on rather than left as an id to chase.
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, customer_name, customer_phone, booking_date, start_time, total_amount, status")
    .in(
      "id",
      claims.map((claim) => claim.booking_id)
    );

  const bookingById = new Map((bookings ?? []).map((booking) => [booking.id, booking]));

  return NextResponse.json({
    pendingCount: claims.filter((claim) => claim.status === "claimed").length,
    claims: claims.map((claim) => {
      const booking = bookingById.get(claim.booking_id);
      const expected = Number(booking?.total_amount) || 0;

      return {
        id: claim.id,
        bookingId: claim.booking_id,
        shortId: claim.booking_id.slice(0, 8).toUpperCase(),
        amount: claim.amount,
        expectedAmount: expected,
        // Called out rather than left for the owner to spot: a claim for less
        // than the booking is the thing most worth catching here.
        amountMatches: expected === claim.amount,
        reference: claim.reference,
        status: claim.status,
        note: claim.note,
        createdAt: claim.created_at,
        verifiedAt: claim.verified_at,
        customerName: booking?.customer_name ?? null,
        customerPhone: booking?.customer_phone ?? null,
        bookingDate: booking?.booking_date ?? null,
        startTime: booking?.start_time ?? null,
        bookingStatus: booking?.status ?? null,
      };
    }),
  });
}

/**
 * PUT /api/owner/payments — confirm or reject a claimed payment.
 *
 * body: { cafeId, claimId, action: 'verify' | 'reject', note? }
 *
 * Verifying is what actually confirms the booking and lets the machine unlock.
 * That decision is deliberately a human one: nothing in this app can see the
 * café's bank account, so nothing in this app should be allowed to decide that
 * money arrived.
 */
export async function PUT(request: NextRequest) {
  const auth = await requireOwnerContext(request);
  if (auth.response) return auth.response;

  const { ownerId, supabase } = auth.context;
  const body = await request.json().catch(() => ({}));
  const { cafeId, claimId, action } = body;

  if (!cafeId || !claimId) {
    return NextResponse.json({ error: "cafeId and claimId are required" }, { status: 400 });
  }

  if (action !== "verify" && action !== "reject") {
    return NextResponse.json({ error: "action must be verify or reject" }, { status: 400 });
  }

  const accessError = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
  if (accessError) return accessError;

  const { data: claim, error: lookupError } = await supabase
    .from("booking_payment_claims")
    .select("id, cafe_id, booking_id, status")
    .eq("id", claimId)
    .maybeSingle();

  if (lookupError) return missingTableResponse(lookupError.message);

  // Checked against the café the owner was authorised for, so a claim id from
  // another café cannot be actioned by passing your own cafeId.
  if (!claim || claim.cafe_id !== cafeId) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  if (claim.status !== "claimed") {
    return NextResponse.json(
      { error: `This payment was already marked ${claim.status}.` },
      { status: 409 }
    );
  }

  const { error: updateError } = await supabase
    .from("booking_payment_claims")
    .update({
      status: action === "verify" ? "verified" : "rejected",
      verified_by: ownerId,
      verified_at: new Date().toISOString(),
      note: typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 300) : null,
    })
    .eq("id", claimId)
    // Only move a claim that is still open, so two owners tapping at once
    // cannot both act on it.
    .eq("status", "claimed");

  if (updateError) return missingTableResponse(updateError.message);

  if (action === "verify") {
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, booking_date, start_time, status")
      .eq("id", claim.booking_id)
      .maybeSingle();

    // Only a booking still waiting on money is moved. One already in progress
    // or completed must not be dragged backwards by a late confirmation.
    if (booking && (booking.status || "").toLowerCase() === "pending") {
      await supabase
        .from("bookings")
        .update({
          status: getInitialOwnerBookingStatus(booking.booking_date, booking.start_time),
          payment_mode: "upi",
        })
        .eq("id", claim.booking_id);
    }

    // Payment is the gate on unlocking, so the machine is brought in line the
    // moment the money is confirmed rather than waiting for someone to notice.
    await syncStationsForBooking(supabase, claim.booking_id);
  }

  return NextResponse.json({ success: true });
}
