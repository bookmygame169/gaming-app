import { NextRequest, NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

/**
 * Coupons, from the admin panel.
 *
 * The panel wrote these straight to Supabase from the browser, which the cafés'
 * ISP blocks. It also let the browser name every column, including uses_count —
 * the field the usage limit is enforced on, so a coupon capped at 100 uses
 * could be reset to zero from the client.
 */

/** Fields the admin panel may set. uses_count and cafe_id are not among them. */
const ALLOWED_FIELDS = new Set([
  "code",
  "discount_type",
  "discount_value",
  "max_discount_amount",
  "bonus_minutes",
  "min_order_amount",
  "new_customer_only",
  "min_visits",
  "max_uses",
  "single_use_per_customer",
  "valid_from",
  "valid_until",
  "is_active",
]);

function pick(updates: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates || {})) {
    if (ALLOWED_FIELDS.has(key)) safe[key] = value;
  }
  return safe;
}

/** POST /api/admin/coupons — body: { cafeId, coupon } */
export async function POST(request: NextRequest) {
  const { context, response } = await requireAdminContext(request);
  if (response) return response;

  const { cafeId, coupon } = await request.json().catch(() => ({}));

  if (!cafeId) {
    return NextResponse.json({ error: "cafeId is required" }, { status: 400 });
  }

  const safe = pick(coupon || {});
  const code = String(safe.code || "").trim().toUpperCase();

  if (!code) {
    return NextResponse.json({ error: "A coupon code is required" }, { status: 400 });
  }

  const { data, error } = await context.supabase
    .from("coupons")
    .insert({
      ...safe,
      // Upper-cased on the way in because validate_coupon looks it up with
      // UPPER(). A lower-case code saved here would simply never match.
      code,
      cafe_id: cafeId,
      // Always starts at zero. A new coupon that claims prior usage, or one
      // whose counter the browser chose, defeats the usage limit.
      uses_count: 0,
      is_active: safe.is_active !== false,
    })
    .select()
    .single();

  if (error) {
    // 23505 is the (cafe_id, code) unique constraint.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `A coupon called ${code} already exists at this café.` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ coupon: data }, { status: 201 });
}

/** PUT /api/admin/coupons — body: { id, updates } */
export async function PUT(request: NextRequest) {
  const { context, response } = await requireAdminContext(request);
  if (response) return response;

  const { id, updates } = await request.json().catch(() => ({}));

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const safe = pick(updates || {});
  if (typeof safe.code === "string") safe.code = safe.code.trim().toUpperCase();

  if (Object.keys(safe).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { error } = await context.supabase.from("coupons").update(safe).eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

/** DELETE /api/admin/coupons — body: { id } */
export async function DELETE(request: NextRequest) {
  const { context, response } = await requireAdminContext(request);
  if (response) return response;

  const { id } = await request.json().catch(() => ({}));
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Usage rows first: coupon_usage references the coupon, and leaving them
  // would either block the delete or orphan the history behind a foreign key.
  await context.supabase.from("coupon_usage").delete().eq("coupon_id", id);

  const { error } = await context.supabase.from("coupons").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
