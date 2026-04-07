import { NextRequest, NextResponse } from "next/server";
import {
  getOwnedCafeIdForRecord,
  requireOwnerCafeAccess,
  requireOwnerContext,
} from "@/lib/ownerAuth";

export const dynamic = 'force-dynamic';

type MembershipPlanPayload = {
  cafe_id?: string;
  console_type?: string;
  description?: string | null;
  hours?: number | null;
  name?: string;
  plan_type?: string;
  player_count?: string;
  price?: number;
  validity_days?: number;
};

function normalizePlanType(planType?: string | null): "day_pass" | "hourly_package" {
  return planType === "day_pass" ? "day_pass" : "hourly_package";
}

function sanitizeMembershipPlanPayload(
  payload: MembershipPlanPayload,
  cafeId?: string
) {
  const sanitized = {
    name: payload.name?.trim(),
    description: payload.description?.trim() || null,
    price: payload.price,
    hours:
      normalizePlanType(payload.plan_type) === "day_pass"
        ? null
        : payload.hours ?? null,
    validity_days: payload.validity_days,
    plan_type: normalizePlanType(payload.plan_type),
    console_type: payload.console_type,
    player_count: payload.player_count,
    ...(cafeId ? { cafe_id: cafeId } : {}),
  };

  return Object.fromEntries(
    Object.entries(sanitized).filter(([, value]) => value !== undefined)
  );
}

// POST /api/owner/membership-plans — create or update (body has id for update)
export async function POST(request: NextRequest) {
  const auth = await requireOwnerContext(request);
  if (auth.response) {
    return auth.response;
  }

  const { ownerId, supabase } = auth.context;
  const body = await request.json();
  const { id, ...payload } = body;

  if (id) {
    const ownedCafeId = await getOwnedCafeIdForRecord(
      supabase,
      "membership_plans",
      id,
      ownerId
    );
    if (!ownedCafeId) {
      return NextResponse.json({ error: "Membership plan not found" }, { status: 404 });
    }

    const updates = sanitizeMembershipPlanPayload(payload, ownedCafeId);
    const { error } = await supabase
      .from('membership_plans')
      .update(updates)
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    if (!payload.cafe_id) {
      return NextResponse.json({ error: "cafe_id required" }, { status: 400 });
    }

    const accessResponse = await requireOwnerCafeAccess(
      supabase,
      ownerId,
      payload.cafe_id
    );
    if (accessResponse) {
      return accessResponse;
    }

    const insertPayload = { ...sanitizeMembershipPlanPayload(payload, payload.cafe_id), is_active: true };
    const { error } = await supabase.from('membership_plans').insert([insertPayload]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/owner/membership-plans?id=...
export async function DELETE(request: NextRequest) {
  const auth = await requireOwnerContext(request);
  if (auth.response) {
    return auth.response;
  }

  const { ownerId, supabase } = auth.context;
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const ownedCafeId = await getOwnedCafeIdForRecord(
    supabase,
    "membership_plans",
    id,
    ownerId
  );
  if (!ownedCafeId) {
    return NextResponse.json({ error: "Membership plan not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from('membership_plans')
    .update({ is_active: false })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
