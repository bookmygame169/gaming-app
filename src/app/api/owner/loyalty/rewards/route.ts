import { NextRequest, NextResponse } from "next/server";
import { requireOwnerCafeAccess, requireOwnerContext } from "@/lib/ownerAuth";
import { getRewards, type RewardKind } from "@/lib/loyalty";

export const dynamic = "force-dynamic";

const KINDS: RewardKind[] = ["free_minutes", "free_item", "discount"];

function missingTableResponse(message: string) {
  return NextResponse.json(
    {
      error: message.includes("loyalty_rewards")
        ? "Rewards are not set up yet. Run migration 20260810000003_loyalty_rewards_and_reset.sql in Supabase."
        : message,
    },
    { status: 500 }
  );
}

/** GET /api/owner/loyalty/rewards?cafeId=… — the menu, inactive ones included. */
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

  return NextResponse.json({ rewards: await getRewards(supabase, cafeId, true) });
}

/**
 * POST /api/owner/loyalty/rewards — add or edit a reward.
 *
 * body: { cafeId, id?, name, pointsCost, kind, value, description?, isActive?, sortOrder? }
 */
export async function POST(request: NextRequest) {
  const auth = await requireOwnerContext(request);
  if (auth.response) return auth.response;

  const { ownerId, supabase } = auth.context;
  const body = await request.json().catch(() => ({}));
  const { cafeId, id } = body;

  if (!cafeId) {
    return NextResponse.json({ error: "cafeId is required" }, { status: 400 });
  }

  const accessError = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
  if (accessError) return accessError;

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Give the reward a name." }, { status: 400 });
  }

  const pointsCost = Math.round(Number(body.pointsCost) || 0);
  if (pointsCost <= 0) {
    return NextResponse.json({ error: "How many points does it cost?" }, { status: 400 });
  }

  const kind: RewardKind = KINDS.includes(body.kind) ? body.kind : "free_item";

  // Clamped rather than rejected — a slip in the form should not lose the whole
  // reward, and the ceiling stops "3000 minutes free" from a stray zero.
  const value = Math.min(
    kind === "free_minutes" ? 600 : 100000,
    Math.max(0, Math.round(Number(body.value) || 0))
  );

  const row = {
    cafe_id: cafeId,
    name: name.slice(0, 80),
    description:
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim().slice(0, 300)
        : null,
    points_cost: pointsCost,
    kind,
    value,
    is_active: body.isActive !== false,
    sort_order: Math.max(0, Math.round(Number(body.sortOrder) || 0)),
    updated_at: new Date().toISOString(),
  };

  // The café is taken from the authorised id on update too, so a reward id
  // from another café cannot be moved into this one.
  const { error } = id
    ? await supabase.from("loyalty_rewards").update(row).eq("id", id).eq("cafe_id", cafeId)
    : await supabase.from("loyalty_rewards").insert(row);

  if (error) return missingTableResponse(error.message);

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/owner/loyalty/rewards — retire a reward.
 *
 * Deactivated, never deleted: redemptions point back at it, and removing the
 * row would leave a customer's history saying they spent points on nothing.
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireOwnerContext(request);
  if (auth.response) return auth.response;

  const { ownerId, supabase } = auth.context;
  const { cafeId, id } = await request.json().catch(() => ({}));

  if (!cafeId || !id) {
    return NextResponse.json({ error: "cafeId and id are required" }, { status: 400 });
  }

  const accessError = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
  if (accessError) return accessError;

  const { error } = await supabase
    .from("loyalty_rewards")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("cafe_id", cafeId);

  if (error) return missingTableResponse(error.message);

  return NextResponse.json({ success: true });
}
