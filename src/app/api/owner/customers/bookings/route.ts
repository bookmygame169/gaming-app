import { NextRequest, NextResponse } from "next/server";
import {
  requireOwnerCafeAccess,
  requireOwnerContext,
} from "@/lib/ownerAuth";
import { phoneKey, phoneSearchFragment } from "@/lib/phone";
import { revenueBookings } from "@/lib/db/bookings";

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

  const key = phoneKey(phone);
  if (!key) {
    return NextResponse.json({ bookings: [] });
  }

  // Narrowed on the last four digits rather than the whole number, because
  // customer_phone holds whatever was typed at the counter — "9876543210" and
  // "+91 98765 43210" are the same customer and an exact match finds only one
  // of them. The last four digits stay together under every way anyone writes
  // a number, so this is a superset; the exact comparison happens below on the
  // normalised key.
  const { data, error } = await revenueBookings(
    supabase
      .from("bookings")
      .select(
        "id, booking_date, start_time, duration, total_amount, status, source, payment_mode, created_at, customer_name, customer_phone, booking_items(id, console, quantity, price, title), booking_orders(id, quantity, total_price)"
      )
      .eq("cafe_id", cafeId)
  )
    .ilike("customer_phone", phoneSearchFragment(phone) ?? "")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const bookings = (data ?? [])
    .filter((booking) => phoneKey(booking.customer_phone) === key)
    .slice(0, 10);

  return NextResponse.json({ bookings });
}
