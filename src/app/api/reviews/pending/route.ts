import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser } from "@/lib/userAuth";

export const dynamic = "force-dynamic";

/**
 * GET /api/reviews/pending
 *
 * Finished sessions the customer has not reviewed yet.
 *
 * Reviews only appear if someone is asked for them, and nobody opens a café
 * page again to leave one. This is what the prompt on the bookings list is
 * built from.
 */
export async function GET(request: NextRequest) {
  try {
    const { userId, response: authResponse } = await requireUser(request);
    if (authResponse) return authResponse;

    const supabase = getSupabaseAdmin();

    const { data: bookings, error } = await supabase
      .from("bookings")
      .select("id, cafe_id, booking_date, cafes(name)")
      .eq("user_id", userId)
      .eq("status", "completed")
      .is("deleted_at", null)
      .order("booking_date", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Could not load reviewable bookings:", error.message);
      return NextResponse.json({ pending: [] });
    }

    const rows = bookings ?? [];
    if (rows.length === 0) return NextResponse.json({ pending: [] });

    const { data: existing, error: reviewsError } = await supabase
      .from("cafe_reviews")
      .select("booking_id")
      .in(
        "booking_id",
        rows.map((row) => row.id)
      );

    // Before the migration is run there are no reviews, which is the same as
    // none of these being reviewed — so the prompt still works rather than the
    // whole bookings page failing.
    if (reviewsError) {
      console.error("Could not check existing reviews:", reviewsError.message);
    }

    const reviewed = new Set((existing ?? []).map((row) => row.booking_id));

    return NextResponse.json({
      pending: rows
        .filter((row) => !reviewed.has(row.id))
        .slice(0, 5)
        .map((row) => ({
          bookingId: row.id,
          cafeId: row.cafe_id,
          cafeName:
            (row.cafes as unknown as { name?: string } | null)?.name ?? "the café",
          bookingDate: row.booking_date,
        })),
    });
  } catch (err) {
    console.error("Unexpected error loading reviewable bookings:", err);
    return NextResponse.json({ pending: [] });
  }
}
