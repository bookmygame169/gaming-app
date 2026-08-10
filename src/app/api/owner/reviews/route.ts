import { NextRequest, NextResponse } from "next/server";
import { requireOwnerCafeAccess, requireOwnerContext } from "@/lib/ownerAuth";
import { summarise } from "@/lib/reviews";

export const dynamic = "force-dynamic";

function missingTableResponse(message: string) {
  return NextResponse.json(
    {
      error: message.includes("cafe_reviews")
        ? "Reviews are not set up yet. Run migration 20260810000001_add_cafe_reviews.sql in Supabase."
        : message,
    },
    { status: 500 }
  );
}

/**
 * GET /api/owner/reviews?cafeId=...
 *
 * Every review for the café, hidden ones included — an owner needs to see what
 * they have hidden, or they cannot change their mind.
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
    .from("cafe_reviews")
    .select(
      "id, rating, comment, display_name, owner_reply, owner_replied_at, is_hidden, created_at"
    )
    .eq("cafe_id", cafeId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return missingTableResponse(error.message);

  const rows = data ?? [];

  return NextResponse.json({
    // The public average excludes hidden reviews, so the owner's headline
    // number matches what customers actually see.
    summary: summarise(rows.filter((row) => !row.is_hidden).map((row) => Number(row.rating))),
    needsReply: rows.filter((row) => !row.owner_reply && !row.is_hidden).length,
    reviews: rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      comment: row.comment,
      name: row.display_name || "A gamer",
      ownerReply: row.owner_reply,
      ownerRepliedAt: row.owner_replied_at,
      isHidden: row.is_hidden,
      createdAt: row.created_at,
    })),
  });
}

/**
 * PUT /api/owner/reviews — reply to a review, or hide it.
 *
 * body: { cafeId, reviewId, reply?, isHidden? }
 *
 * The rating itself is never editable. An owner who can change their own score
 * makes every score on the platform meaningless.
 */
export async function PUT(request: NextRequest) {
  const auth = await requireOwnerContext(request);
  if (auth.response) return auth.response;

  const { ownerId, supabase } = auth.context;
  const body = await request.json().catch(() => ({}));
  const { cafeId, reviewId } = body;

  if (!cafeId || !reviewId) {
    return NextResponse.json({ error: "cafeId and reviewId are required" }, { status: 400 });
  }

  const accessError = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
  if (accessError) return accessError;

  // Checked against the café the owner was authorised for, so a review id from
  // someone else's café cannot be edited by passing your own cafeId.
  const { data: review, error: lookupError } = await supabase
    .from("cafe_reviews")
    .select("id, cafe_id")
    .eq("id", reviewId)
    .maybeSingle();

  if (lookupError) return missingTableResponse(lookupError.message);

  if (!review || review.cafe_id !== cafeId) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof body.reply === "string") {
    const reply = body.reply.trim().slice(0, 1000);
    updates.owner_reply = reply || null;
    updates.owner_replied_at = reply ? new Date().toISOString() : null;
  }

  if (typeof body.isHidden === "boolean") {
    updates.is_hidden = body.isHidden;
  }

  const { error: updateError } = await supabase
    .from("cafe_reviews")
    .update(updates)
    .eq("id", reviewId);

  if (updateError) return missingTableResponse(updateError.message);

  return NextResponse.json({ success: true });
}
