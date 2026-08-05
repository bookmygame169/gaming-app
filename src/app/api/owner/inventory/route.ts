import { NextRequest, NextResponse } from "next/server";
import {
  requireOwnerContext,
  requireOwnerCafeAccess,
  getOwnedCafeIdForRecord,
} from "@/lib/ownerAuth";

export const dynamic = "force-dynamic";

const CATEGORIES = ["snacks", "cold_drinks", "hot_drinks", "combo"] as const;
type Category = (typeof CATEGORIES)[number];

function isCategory(value: unknown): value is Category {
  return CATEGORIES.includes(value as Category);
}

function toNonNegativeNumber(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return numeric;
}

function toNonNegativeInteger(value: unknown): number | null {
  const numeric = toNonNegativeNumber(value);
  if (numeric === null) return null;
  return Math.floor(numeric);
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;
    const { ownerId, supabase } = auth.context;

    const body = await request.json();
    const cafeId = String(body?.cafeId || "");
    const name = String(body?.name || "").trim();
    const category = body?.category;
    const price = toNonNegativeNumber(body?.price);
    const costPrice = body?.cost_price === null || body?.cost_price === undefined
      ? null
      : toNonNegativeNumber(body.cost_price);
    const stockQuantity = toNonNegativeInteger(body?.stock_quantity) ?? 0;
    const isAvailable = body?.is_available !== false;

    if (!cafeId) {
      return NextResponse.json({ error: "cafeId is required" }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!isCategory(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }
    if (price === null) {
      return NextResponse.json({ error: "Valid price is required" }, { status: 400 });
    }
    if (body?.cost_price !== null && body?.cost_price !== undefined && costPrice === null) {
      return NextResponse.json({ error: "Valid cost price is required" }, { status: 400 });
    }

    const accessResponse = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
    if (accessResponse) return accessResponse;

    const { data, error } = await supabase
      .from("inventory_items")
      .insert({
        cafe_id: cafeId,
        name,
        category,
        price,
        cost_price: costPrice,
        stock_quantity: stockQuantity,
        is_available: isAvailable,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, item: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create item";
    console.error("Owner inventory create error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;
    const { ownerId, supabase } = auth.context;

    const body = await request.json();
    const itemId = String(body?.itemId || "");
    if (!itemId) {
      return NextResponse.json({ error: "itemId is required" }, { status: 400 });
    }

    const ownedCafeId = await getOwnedCafeIdForRecord(supabase, "inventory_items", itemId, ownerId);
    if (!ownedCafeId) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};

    if (body?.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
      updates.name = name;
    }

    if (body?.category !== undefined) {
      if (!isCategory(body.category)) {
        return NextResponse.json({ error: "Invalid category" }, { status: 400 });
      }
      updates.category = body.category;
    }

    if (body?.price !== undefined) {
      const price = toNonNegativeNumber(body.price);
      if (price === null) return NextResponse.json({ error: "Valid price is required" }, { status: 400 });
      updates.price = price;
    }

    if (body?.cost_price !== undefined) {
      if (body.cost_price === null) {
        updates.cost_price = null;
      } else {
        const costPrice = toNonNegativeNumber(body.cost_price);
        if (costPrice === null) {
          return NextResponse.json({ error: "Valid cost price is required" }, { status: 400 });
        }
        updates.cost_price = costPrice;
      }
    }

    if (body?.stock_quantity !== undefined) {
      const stockQuantity = toNonNegativeInteger(body.stock_quantity);
      if (stockQuantity === null) {
        return NextResponse.json({ error: "Valid stock quantity is required" }, { status: 400 });
      }
      updates.stock_quantity = stockQuantity;
    }

    if (body?.is_available !== undefined) {
      updates.is_available = Boolean(body.is_available);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("inventory_items")
      .update(updates)
      .eq("id", itemId)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, item: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update item";
    console.error("Owner inventory update error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;
    const { ownerId, supabase } = auth.context;

    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get("itemId") || "";
    if (!itemId) {
      return NextResponse.json({ error: "itemId is required" }, { status: 400 });
    }

    const ownedCafeId = await getOwnedCafeIdForRecord(supabase, "inventory_items", itemId, ownerId);
    if (!ownedCafeId) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const { data: existingOrders, error: ordersError } = await supabase
      .from("booking_orders")
      .select("id")
      .eq("inventory_item_id", itemId)
      .limit(1);

    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 500 });
    }

    if (existingOrders && existingOrders.length > 0) {
      const { error: disableError } = await supabase
        .from("inventory_items")
        .update({ is_available: false, stock_quantity: 0 })
        .eq("id", itemId);

      if (disableError) {
        return NextResponse.json({ error: disableError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, disabled: true });
    }

    const { error: deleteError } = await supabase
      .from("inventory_items")
      .delete()
      .eq("id", itemId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, disabled: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete item";
    console.error("Owner inventory delete error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
