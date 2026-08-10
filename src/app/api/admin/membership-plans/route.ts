import { NextRequest, NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

/**
 * Membership plans, from the admin panel.
 *
 * Written straight to Supabase from the browser before, which the cafés' ISP
 * blocks.
 */

const ALLOWED_FIELDS = new Set([
  "name",
  "description",
  "price",
  "hours",
  "validity_days",
  "plan_type",
  "console_type",
  "player_count",
  "is_active",
]);

function pick(updates: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates || {})) {
    if (ALLOWED_FIELDS.has(key)) safe[key] = value;
  }
  return safe;
}

/** POST /api/admin/membership-plans — body: { cafeId, plan } */
export async function POST(request: NextRequest) {
  const { context, response } = await requireAdminContext(request);
  if (response) return response;

  const { cafeId, plan } = await request.json().catch(() => ({}));

  if (!cafeId) {
    return NextResponse.json({ error: "cafeId is required" }, { status: 400 });
  }

  const safe = pick(plan || {});

  if (!String(safe.name || "").trim()) {
    return NextResponse.json({ error: "A plan name is required" }, { status: 400 });
  }

  // A day pass is unlimited play, so it carries no hour balance. Leaving a
  // number here would let the timer subtract from it and expire a pass early.
  if (safe.plan_type === "day_pass") safe.hours = null;

  const { data, error } = await context.supabase
    .from("membership_plans")
    .insert({ ...safe, cafe_id: cafeId, is_active: safe.is_active !== false })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ plan: data }, { status: 201 });
}

/** PUT /api/admin/membership-plans — body: { id, updates } */
export async function PUT(request: NextRequest) {
  const { context, response } = await requireAdminContext(request);
  if (response) return response;

  const { id, updates } = await request.json().catch(() => ({}));

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const safe = pick(updates || {});
  if (safe.plan_type === "day_pass") safe.hours = null;

  if (Object.keys(safe).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { error } = await context.supabase.from("membership_plans").update(safe).eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

/** DELETE /api/admin/membership-plans — body: { id } */
export async function DELETE(request: NextRequest) {
  const { context, response } = await requireAdminContext(request);
  if (response) return response;

  const { id } = await request.json().catch(() => ({}));
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // A plan someone has already bought is not deletable: subscriptions point at
  // it, and removing it would leave a member's plan name blank. Retiring it
  // keeps existing memberships readable and takes it off sale.
  const { count } = await context.supabase
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("membership_plan_id", id);

  if ((count ?? 0) > 0) {
    const { error: retireError } = await context.supabase
      .from("membership_plans")
      .update({ is_active: false })
      .eq("id", id);

    if (retireError) {
      return NextResponse.json({ error: retireError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      retired: true,
      message: `${count} member${count === 1 ? " has" : "s have"} this plan, so it was taken off sale rather than deleted.`,
    });
  }

  const { error } = await context.supabase.from("membership_plans").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
