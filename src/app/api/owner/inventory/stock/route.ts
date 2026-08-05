import { NextRequest, NextResponse } from "next/server";
import { requireOwnerContext, getOwnedCafeIdForRecord } from "@/lib/ownerAuth";
import { adjustInventoryStock } from "@/lib/inventoryStock";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;
    const { ownerId, supabase } = auth.context;

    const body = await request.json();
    const itemId = String(body?.itemId || "");
    const amount = Math.trunc(Number(body?.amount));

    if (!itemId) {
      return NextResponse.json({ error: "itemId is required" }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount === 0) {
      return NextResponse.json({ error: "A non-zero amount is required" }, { status: 400 });
    }

    const ownedCafeId = await getOwnedCafeIdForRecord(supabase, "inventory_items", itemId, ownerId);
    if (!ownedCafeId) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const newQuantity = await adjustInventoryStock(supabase, itemId, amount);

    return NextResponse.json({ success: true, stock_quantity: newQuantity });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update stock";
    console.error("Owner inventory stock update error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
