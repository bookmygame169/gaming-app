import { NextRequest, NextResponse } from "next/server";
import {
  ownerHasCouponAccess,
  requireOwnerCafeAccess,
  requireOwnerContext,
} from "@/lib/ownerAuth";

export const dynamic = 'force-dynamic';

// GET /api/owner/coupons/usage?couponId=...
export async function GET(request: NextRequest) {
  const auth = await requireOwnerContext(request);
  if (auth.response) {
    return auth.response;
  }

  const { ownerId, supabase } = auth.context;
  const couponId = request.nextUrl.searchParams.get('couponId');
  const cafeId = request.nextUrl.searchParams.get('cafeId');

  // Cafe-wide totals, so the coupon table can show what each code gave away
  // and what it brought back. Per-coupon detail still answers on couponId.
  if (!couponId && cafeId) {
    const denied = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
    if (denied) return denied;

    const { data: cafeCoupons, error: couponError } = await supabase
      .from('coupons')
      .select('id')
      .eq('cafe_id', cafeId);
    if (couponError) {
      return NextResponse.json({ error: couponError.message }, { status: 500 });
    }

    const ids = (cafeCoupons || []).map((row: { id: string }) => row.id);
    if (ids.length === 0) return NextResponse.json([]);

    // The booking carries what the visit was actually worth; the usage row
    // carries what it cost to bring them in.
    const { data, error: usageError } = await supabase
      .from('coupon_usage')
      .select('coupon_id, discount_applied, booking_id, bookings(total_amount)')
      .in('coupon_id', ids);
    if (usageError) {
      return NextResponse.json({ error: usageError.message }, { status: 500 });
    }
    return NextResponse.json(data || []);
  }

  if (!couponId) return NextResponse.json({ error: "couponId or cafeId required" }, { status: 400 });

  const hasAccess = await ownerHasCouponAccess(supabase, ownerId, couponId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Coupon not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('coupon_usage')
    .select('*')
    .eq('coupon_id', couponId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}
