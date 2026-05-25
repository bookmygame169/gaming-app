import { NextRequest, NextResponse } from "next/server";
import { getOwnedCafeIdForBooking, requireOwnerContext } from "@/lib/ownerAuth";
import { adjustInventoryStockBatch } from "@/lib/inventoryStock";

export const dynamic = "force-dynamic";

type OrderItemPayload = {
  inventory_item_id?: string | null;
  quantity?: number | null;
};

type InventoryItemRow = {
  id: string;
  cafe_id: string;
  name: string;
  price: number | string | null;
  stock_quantity: number | string | null;
  is_available: boolean | null;
};

function toPositiveInteger(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric));
}

function toAmount(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric));
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;

    const { ownerId, supabase } = auth.context;
    const body = await request.json();
    const bookingId = String(body?.bookingId || "");
    const requestedItems = Array.isArray(body?.items) ? body.items as OrderItemPayload[] : [];

    if (!bookingId) {
      return NextResponse.json({ error: "bookingId is required" }, { status: 400 });
    }

    const ownedCafeId = await getOwnedCafeIdForBooking(supabase, bookingId, ownerId);
    if (!ownedCafeId) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const quantitiesByItemId = new Map<string, number>();
    for (const item of requestedItems) {
      const inventoryItemId = String(item.inventory_item_id || "");
      const quantity = toPositiveInteger(item.quantity);
      if (!inventoryItemId || quantity <= 0) continue;
      quantitiesByItemId.set(inventoryItemId, (quantitiesByItemId.get(inventoryItemId) || 0) + quantity);
    }

    if (quantitiesByItemId.size === 0) {
      return NextResponse.json({ error: "At least one item is required" }, { status: 400 });
    }

    const itemIds = Array.from(quantitiesByItemId.keys());
    const { data: inventoryRows, error: inventoryError } = await supabase
      .from("inventory_items")
      .select("id, cafe_id, name, price, stock_quantity, is_available")
      .eq("cafe_id", ownedCafeId)
      .in("id", itemIds);

    if (inventoryError) {
      return NextResponse.json({ error: inventoryError.message }, { status: 500 });
    }

    const inventoryById = new Map((inventoryRows || []).map((row) => [row.id, row as InventoryItemRow]));

    for (const itemId of itemIds) {
      const inventoryItem = inventoryById.get(itemId);
      if (!inventoryItem || inventoryItem.is_available === false) {
        return NextResponse.json({ error: "One or more items are no longer available" }, { status: 409 });
      }

      const requestedQuantity = quantitiesByItemId.get(itemId) || 0;
      const stockQuantity = toPositiveInteger(inventoryItem.stock_quantity);
      if (requestedQuantity > stockQuantity) {
        return NextResponse.json(
          { error: `${inventoryItem.name} has only ${stockQuantity} left in stock` },
          { status: 409 }
        );
      }
    }

    const stockAdjustments = itemIds.map((itemId) => ({
      inventoryItemId: itemId,
      quantity: quantitiesByItemId.get(itemId) || 0,
    }));

    await adjustInventoryStockBatch(supabase, stockAdjustments, "deduct");

    const orders = itemIds.map((itemId) => {
      const inventoryItem = inventoryById.get(itemId)!;
      const quantity = quantitiesByItemId.get(itemId) || 0;
      const unitPrice = toAmount(inventoryItem.price);
      return {
        booking_id: bookingId,
        inventory_item_id: itemId,
        item_name: inventoryItem.name,
        quantity,
        unit_price: unitPrice,
        total_price: unitPrice * quantity,
      };
    });

    const { data: insertedOrders, error: orderError } = await supabase
      .from("booking_orders")
      .insert(orders)
      .select("*");

    if (orderError) {
      await adjustInventoryStockBatch(supabase, stockAdjustments, "restore");
      return NextResponse.json({ error: orderError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      orders: insertedOrders || [],
      amountAdded: orders.reduce((sum, order) => sum + order.total_price, 0),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to add items";
    console.error("Owner booking order add error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
