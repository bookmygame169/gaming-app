import { NextRequest, NextResponse } from "next/server";
import { requireOwnerContext, requireOwnerCafeAccess } from "@/lib/ownerAuth";
import { awardPointsForBooking } from "@/lib/loyalty";
import { adjustInventoryStockBatch } from "@/lib/inventoryStock";
import { insertBooking } from "@/lib/bookingInstants";

export const dynamic = "force-dynamic";

function toPositiveInteger(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric));
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;
    const { ownerId, supabase } = auth.context;

    const body = await request.json();
    const { cafeId, customerName, customerPhone, paymentMode, isOwnerUse, items } = body;

    if (!cafeId || !items?.length) {
      return NextResponse.json({ error: "cafeId and items are required" }, { status: 400 });
    }

    const accessResponse = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
    if (accessResponse) return accessResponse;

    const requestedItemIds = Array.from(
      new Set(
        items
          .map((item: { inventory_item_id: string }) => String(item.inventory_item_id || ""))
          .filter(Boolean)
      )
    ) as string[];

    const { data: inventoryRows, error: inventoryError } = await supabase
      .from("inventory_items")
      .select("id, cafe_id, name, price, stock_quantity, is_available")
      .eq("cafe_id", cafeId)
      .in("id", requestedItemIds);

    if (inventoryError) {
      return NextResponse.json({ error: inventoryError.message }, { status: 500 });
    }

    const inventoryById = new Map(
      (inventoryRows || []).map((row) => [row.id, row])
    );

    const requestedQuantities = new Map<string, number>();
    for (const item of items as Array<{ inventory_item_id: string; quantity: number }>) {
      const itemId = String(item.inventory_item_id || "");
      const quantity = toPositiveInteger(item.quantity);
      if (!itemId || quantity <= 0) continue;
      requestedQuantities.set(itemId, (requestedQuantities.get(itemId) || 0) + quantity);
    }

    for (const [itemId, quantity] of requestedQuantities) {
      const inventoryItem = inventoryById.get(itemId);
      if (!inventoryItem || inventoryItem.is_available === false) {
        return NextResponse.json({ error: "One or more items are no longer available" }, { status: 409 });
      }
      const stockQuantity = toPositiveInteger(inventoryItem.stock_quantity);
      if (quantity > stockQuantity) {
        return NextResponse.json(
          { error: `${inventoryItem.name} has only ${stockQuantity} left in stock` },
          { status: 409 }
        );
      }
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

    // Priced from the inventory row, not from the request. The browser's
    // figure decides revenue reports and now also counts towards the day's
    // loyalty spend, so it is recalculated here rather than trusted.
    const pricedOrders = [...requestedQuantities].map(([itemId, quantity]) => {
      const inventoryItem = inventoryById.get(itemId)!;
      const unitPrice = Math.max(0, Math.round(Number(inventoryItem.price) || 0));

      return {
        inventoryItemId: itemId,
        name: inventoryItem.name as string,
        quantity,
        unitPrice,
        totalPrice: unitPrice * quantity,
      };
    });

    // Owner use: record items but set total_amount to 0 (excluded from revenue)
    const totalAmount = isOwnerUse
      ? 0
      : pricedOrders.reduce((sum, order) => sum + order.totalPrice, 0);

    const stockAdjustments = pricedOrders.map((order) => ({
      inventoryItemId: order.inventoryItemId,
      quantity: order.quantity,
    }));

    await adjustInventoryStockBatch(supabase, stockAdjustments, "deduct");

    // 1. Create booking record
    const { data: booking, error: bookingError } = await insertBooking(supabase, {
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
      });

    if (bookingError || !booking) {
      await adjustInventoryStockBatch(supabase, stockAdjustments, "restore");
      console.error("Booking insert error:", bookingError);
      throw new Error(bookingError?.message || JSON.stringify(bookingError));
    }

    // 2. Insert booking_orders
    const orders = pricedOrders.map((order) => ({
      booking_id: booking.id,
      inventory_item_id: order.inventoryItemId,
      item_name: order.name,
      quantity: order.quantity,
      unit_price: order.unitPrice,
      total_price: order.totalPrice,
    }));

    const { error: ordersError } = await supabase.from("booking_orders").insert(orders);
    if (ordersError) {
      await supabase.from("bookings").delete().eq("id", booking.id);
      await adjustInventoryStockBatch(supabase, stockAdjustments, "restore");
      console.error("Orders insert error:", ordersError);
      throw new Error(ordersError.message || JSON.stringify(ordersError));
    }

    // A snack sale is a completed booking with a phone on it, so it counts
    // towards the day's spend like any other. Without this a customer who only
    // bought drinks never earned, and their spend never reached the threshold.
    await awardPointsForBooking(supabase, {
      id: booking.id,
      cafe_id: cafeId,
      customer_phone: customerPhone || null,
      user_id: null,
      booking_date: bookingDate,
    });

    return NextResponse.json({ success: true, bookingId: booking.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create snack sale";
    console.error("Snack sale error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
