import { NextRequest, NextResponse } from "next/server";
import {
  getOwnedCafeIdForRecord,
  requireOwnerCafeAccess,
  requireOwnerContext,
} from "@/lib/ownerAuth";

export const dynamic = 'force-dynamic';

// GET /api/owner/coupons?cafeId=...
export async function GET(request: NextRequest) {
  const auth = await requireOwnerContext(request);
  if (auth.response) {
    return auth.response;
  }

  const { ownerId, supabase } = auth.context;
  const cafeId = request.nextUrl.searchParams.get('cafeId');
  if (!cafeId) return NextResponse.json({ error: "cafeId required" }, { status: 400 });

  const accessResponse = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
  if (accessResponse) {
    return accessResponse;
  }

  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .eq('cafe_id', cafeId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/owner/coupons — create or update (body has id for update)
export async function POST(request: NextRequest) {
  const auth = await requireOwnerContext(request);
  if (auth.response) {
    return auth.response;
  }

  const { ownerId, supabase } = auth.context;
  const body = await request.json();
  const { id, ...payload } = body;

  if (id) {
    const ownedCafeId = await getOwnedCafeIdForRecord(supabase, "coupons", id, ownerId);
    if (!ownedCafeId) {
      return NextResponse.json({ error: "Coupon not found" }, { status: 404 });
    }

    const { error } = await supabase.from('coupons').update(payload).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    if (!payload.cafe_id) {
      return NextResponse.json({ error: "cafe_id required" }, { status: 400 });
    }
    const hasBonusMinutes = Number(payload.bonus_minutes || 0) > 0;
    if (
      payload.discount_value !== undefined &&
      (typeof payload.discount_value !== 'number' || payload.discount_value < 0 || (payload.discount_value === 0 && !hasBonusMinutes))
    ) {
      return NextResponse.json({ error: "discount_value must be positive unless bonus_minutes is set" }, { status: 400 });
    }

    const accessResponse = await requireOwnerCafeAccess(
      supabase,
      ownerId,
      payload.cafe_id
    );
    if (accessResponse) {
      return accessResponse;
    }

    const { error } = await supabase.from('coupons').insert([payload]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// PATCH /api/owner/coupons — toggle is_active
export async function PATCH(request: NextRequest) {
  const auth = await requireOwnerContext(request);
  if (auth.response) {
    return auth.response;
  }

  const { ownerId, supabase } = auth.context;
  const { id, is_active } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const ownedCafeId = await getOwnedCafeIdForRecord(supabase, "coupons", id, ownerId);
  if (!ownedCafeId) {
    return NextResponse.json({ error: "Coupon not found" }, { status: 404 });
  }

  const { error } = await supabase.from('coupons').update({ is_active }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE /api/owner/coupons?id=...
export async function DELETE(request: NextRequest) {
  const auth = await requireOwnerContext(request);
  if (auth.response) {
    return auth.response;
  }

  const { ownerId, supabase } = auth.context;
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const ownedCafeId = await getOwnedCafeIdForRecord(supabase, "coupons", id, ownerId);
  if (!ownedCafeId) {
    return NextResponse.json({ error: "Coupon not found" }, { status: 404 });
  }

  const { error } = await supabase.from('coupons').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
