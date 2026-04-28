import { NextRequest, NextResponse } from "next/server";
import {
  requireOwnerCafeAccess,
  requireOwnerContext,
} from "@/lib/ownerAuth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireOwnerContext(request);
  if (auth.response) {
    return auth.response;
  }

  const { ownerId, supabase } = auth.context;
  const cafeId = request.nextUrl.searchParams.get("cafeId");
  const phone = request.nextUrl.searchParams.get("phone");

  if (!cafeId || !phone) {
    return NextResponse.json(
      { error: "cafeId and phone required" },
      { status: 400 }
    );
  }

  const accessResponse = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
  if (accessResponse) {
    return accessResponse;
  }

  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, booking_date, start_time, duration, total_amount, status, source, payment_mode, created_at, customer_name, booking_items(id, console, quantity, price, title), booking_orders(id, quantity, total_price)"
    )
    .eq("cafe_id", cafeId)
    .eq("customer_phone", phone)
    .neq("status", "cancelled")
    .neq("payment_mode", "owner")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ bookings: data || [] });
}
