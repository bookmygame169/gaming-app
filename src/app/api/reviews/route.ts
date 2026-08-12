import { NextRequest, NextResponse } from "next/server";
import { noStoreFetch } from "@/lib/supabaseFetch";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/userAuth";
import { summarise } from "@/lib/reviews";

export const dynamic = "force-dynamic";

function getSupabaseAdmin(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: noStoreFetch },
  });
}

function missingTableMessage(message: string): string {
  return message.includes("cafe_reviews")
    ? "Reviews are not set up yet. Run migration 20260810000001_add_cafe_reviews.sql in Supabase."
    : message;
}

/**
 * GET /api/reviews?cafeId=...
 *
 * Public. What a stranger sees before deciding to book.
 */
export async function GET(request: NextRequest) {
  try {
    const cafeId = request.nextUrl.searchParams.get("cafeId");
    if (!cafeId) {
      return NextResponse.json({ error: "cafeId is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("cafe_reviews")
      .select("id, rating, comment, display_name, owner_reply, owner_replied_at, created_at")
      .eq("cafe_id", cafeId)
      .eq("is_hidden", false)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Could not load reviews:", error.message);
      return NextResponse.json({ error: missingTableMessage(error.message) }, { status: 500 });
    }

    const rows = data ?? [];

    return NextResponse.json({
      summary: summarise(rows.map((row) => Number(row.rating))),
      reviews: rows.map((row) => ({
        id: row.id,
        rating: row.rating,
        comment: row.comment,
        // Falls back rather than showing a blank byline for someone who never
        // filled in a name.
        name: row.display_name || "A gamer",
        ownerReply: row.owner_reply,
        ownerRepliedAt: row.owner_replied_at,
        createdAt: row.created_at,
      })),
    });
  } catch (err) {
    console.error("Unexpected error loading reviews:", err);
    return NextResponse.json({ error: "Could not load reviews." }, { status: 500 });
  }
}

/**
 * POST /api/reviews — leave a review for a session you played.
 *
 * body: { bookingId, rating, comment? }
 *
 * The café is taken from the booking, never from the request. Letting the
 * client name the café would allow a review of one venue to be filed against
 * another.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, response: authResponse } = await requireUser(request);
    if (authResponse) return authResponse;

    const body = await request.json().catch(() => ({}));
    const bookingId = typeof body.bookingId === "string" ? body.bookingId : null;
    const rating = Math.round(Number(body.rating));
    const rawComment = typeof body.comment === "string" ? body.comment.trim() : "";

    if (!bookingId) {
      return NextResponse.json({ error: "Which visit is this about?" }, { status: 400 });
    }

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Pick a rating from 1 to 5 stars." }, { status: 400 });
    }

    if (rawComment.length > 1000) {
      return NextResponse.json({ error: "Please keep it under 1000 characters." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, cafe_id, user_id, status, deleted_at")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError) {
      console.error("Review: booking lookup failed:", bookingError.message);
      return NextResponse.json({ error: "Could not check that booking." }, { status: 500 });
    }

    // Same 404 whether the booking is missing or belongs to someone else, so
    // this cannot be used to discover other people's booking ids.
    if (!booking || booking.user_id !== userId || booking.deleted_at) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    // Reviewing a session you have not had yet is the whole thing this guards.
    if ((booking.status || "").toLowerCase() !== "completed") {
      return NextResponse.json(
        { error: "You can leave a review once your session is finished." },
        { status: 400 }
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", userId)
      .maybeSingle();

    const displayName =
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() || null;

    const { error: insertError } = await supabase.from("cafe_reviews").insert({
      cafe_id: booking.cafe_id,
      user_id: userId,
      booking_id: bookingId,
      rating,
      comment: rawComment || null,
      display_name: displayName,
    });

    if (insertError) {
      // 23505 is the one-review-per-booking index doing its job.
      if (insertError.code === "23505") {
        return NextResponse.json(
          { error: "You have already reviewed this visit." },
          { status: 409 }
        );
      }

      console.error("Could not save review:", insertError.message);
      return NextResponse.json({ error: missingTableMessage(insertError.message) }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Unexpected error saving review:", err);
    return NextResponse.json({ error: "Could not save your review." }, { status: 500 });
  }
}
