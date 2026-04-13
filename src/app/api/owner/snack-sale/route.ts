import { NextRequest, NextResponse } from "next/server";
import { requireOwnerContext } from "@/lib/ownerAuth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;
    const { supabase } = auth.context;

    const body = await request.json();
    const { cafeId, customerName, customerPhone, paymentMode, isOwnerUse, items } = body;

    if (!cafeId || !items?.length) {
      return NextResponse.json({ error: "cafeId and items are required" }, { status: 400 });
    }

    const now = new Date();
    // Use India timezone for booking_date so it matches the owner's local date,
    // regardless of where the server is hosted (UTC vs IST).
    const bookingDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
    const indiaHours = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }).format(now));
    const indiaMins = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", minute: "2-digit" }).format(now).padStart(2, "0");
    const period = indiaHours >= 12 ? "pm" : "am";
    const h12 = indiaHours % 12 || 12;
    const startTime = `${h12}:${indiaMins} ${period}`;

    // Owner use: record items but set total_amount to 0 (excluded from revenue)
    const totalAmount = isOwnerUse
      ? 0
      : items.reduce((s: number, i: { total_price: number }) => s + i.total_price, 0);

    // 1. Create booking record
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert({
        cafe_id: cafeId,
        customer_name: isOwnerUse ? "Owner" : (customerName || "Walk-in"),
        customer_phone: customerPhone || null,
        booking_date: bookingDate,
        start_time: startTime,
        duration: 30,
        total_amount: totalAmount,
        status: "completed",
        source: "walk-in",
        payment_mode: isOwnerUse ? "owner" : (paymentMode || "cash"),
      })
      .select("id")
      .single();

    if (bookingError) {
      console.error("Booking insert error:", bookingError);
      throw new Error(bookingError.message || JSON.stringify(bookingError));
    }

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
    if (ordersError) {
      console.error("Orders insert error:", ordersError);
      throw new Error(ordersError.message || JSON.stringify(ordersError));
    }

    // 3. Decrement stock — run in parallel; log but do not abort on individual failures
    // (booking + orders are already committed; inventory is best-effort without DB transactions)
    await Promise.all(
      items.map(async (item: { inventory_item_id: string; quantity: number }) => {
        const { data: inv, error: fetchErr } = await supabase
          .from("inventory_items")
          .select("stock_quantity")
          .eq("id", item.inventory_item_id)
          .single();

        if (fetchErr) {
          console.error(`[snack-sale] Failed to fetch inventory for item ${item.inventory_item_id}:`, fetchErr.message);
          return;
        }

        if (inv) {
          const { error: updateErr } = await supabase
            .from("inventory_items")
            .update({ stock_quantity: Math.max(0, inv.stock_quantity - item.quantity) })
            .eq("id", item.inventory_item_id);

          if (updateErr) {
            console.error(`[snack-sale] Failed to decrement stock for item ${item.inventory_item_id}:`, updateErr.message);
          }
        }
      })
    );

    return NextResponse.json({ success: true, bookingId: booking.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create snack sale";
    console.error("Snack sale error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
