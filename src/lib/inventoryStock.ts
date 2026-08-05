import type { SupabaseClient } from "@supabase/supabase-js";

export type StockAdjustment = {
  inventoryItemId: string | null | undefined;
  quantity: number | null | undefined;
};

export async function adjustInventoryStock(
  supabase: SupabaseClient,
  inventoryItemId: string,
  amount: number
): Promise<number> {
  const normalizedAmount = Math.trunc(Number(amount) || 0);

  if (!inventoryItemId) {
    throw new Error("Inventory item id is required");
  }

  if (normalizedAmount === 0) {
    const { data, error } = await supabase
      .from("inventory_items")
      .select("stock_quantity")
      .eq("id", inventoryItemId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message || "Failed to read inventory stock");
    }

    return Math.max(0, Math.trunc(Number(data?.stock_quantity) || 0));
  }

  // increment_inventory_stock does `stock_quantity = GREATEST(0, stock_quantity + amount)`
  // in a single UPDATE, so concurrent adjustments serialize on the row lock
  // instead of racing on a client-side read-then-write.
  const { data, error } = await supabase.rpc("increment_inventory_stock", {
    row_id: inventoryItemId,
    amount: normalizedAmount,
  });

  if (error) {
    throw new Error(error.message || "Failed to update inventory stock");
  }

  return Math.max(0, Math.trunc(Number(data) || 0));
}

export async function adjustInventoryStockBatch(
  supabase: SupabaseClient,
  adjustments: StockAdjustment[],
  direction: "deduct" | "restore"
): Promise<void> {
  const applied: Array<{ inventoryItemId: string; quantity: number }> = [];
  const amountSign = direction === "deduct" ? -1 : 1;

  try {
    for (const adjustment of adjustments) {
      const inventoryItemId = adjustment.inventoryItemId;
      const quantity = Number(adjustment.quantity) || 0;
      if (!inventoryItemId || quantity <= 0) continue;

      await adjustInventoryStock(supabase, inventoryItemId, amountSign * quantity);
      applied.push({ inventoryItemId, quantity });
    }
  } catch (error) {
    for (const adjustment of applied.reverse()) {
      try {
        await adjustInventoryStock(supabase, adjustment.inventoryItemId, -amountSign * adjustment.quantity);
      } catch (rollbackError) {
        console.error("Failed to roll back inventory stock adjustment:", rollbackError);
      }
    }

    throw error;
  }
}
