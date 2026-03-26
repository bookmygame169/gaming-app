import { NextRequest, NextResponse } from "next/server";
import { requireOwnerContext } from "@/lib/ownerAuth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;
    const { supabase } = auth.context;

    const body = await request.json();
    const { cafeId, customerName, customerPhone, paymentMode, items } = body;

    if (!cafeId || !items?.length) {
      return NextResponse.json({ error: "cafeId and items are required" }, { status: 400 });
    }

    const now = new Date();
    const bookingDate = now.toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
    const hours = now.getHours();
    const mins = now.getMinutes().toString().padStart(2, "0");
    const period = hours >= 12 ? "pm" : "am";
    const h12 = hours % 12 || 12;
    const startTime = `${h12}:${mins} ${period}`;
    const totalAmount = items.reduce((s: number, i: { total_price: number }) => s + i.total_price, 0);

    // 1. Create a snack-only booking record
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert({
        cafe_id: cafeId,
        customer_name: customerName || "Walk-in",
        customer_phone: customerPhone || null,
        booking_date: bookingDate,
        start_time: startTime,
        duration: 0,
        total_amount: totalAmount,
        status: "completed",
        source: "snack-only",
        payment_mode: paymentMode || "cash",
      })
      .select("id")
      .single();

    if (bookingError) throw bookingError;

    // 2. Insert booking_orders
    const orders = items.map((item: {
      inventory_item_id: string;
      name: string;
      quantity: number;
      unit_price: number;
      total_price: number;
    }) => ({
      booking_id: booking.id,
      inventory_item_id: item.inventory_item_id,
      item_name: item.name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.total_price,
    }));

    const { error: ordersError } = await supabase.from("booking_orders").insert(orders);
    if (ordersError) throw ordersError;

    // 3. Decrement stock for each item
    for (const item of items) {
      const { data: inv } = await supabase
        .from("inventory_items")
        .select("stock_quantity")
        .eq("id", item.inventory_item_id)
        .single();

      if (inv) {
        await supabase
          .from("inventory_items")
          .update({ stock_quantity: Math.max(0, inv.stock_quantity - item.quantity) })
          .eq("id", item.inventory_item_id);
      }
    }

    return NextResponse.json({ success: true, bookingId: booking.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create snack sale";
    console.error("Snack sale error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
