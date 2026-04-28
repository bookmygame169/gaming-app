import type { SupabaseClient } from "@supabase/supabase-js";

export type StockAdjustment = {
  inventoryItemId: string | null | undefined;
  quantity: number | null | undefined;
};

export async function adjustInventoryStock(
  supabase: SupabaseClient,
  inventoryItemId: string,
  amount: number
): Promise<void> {
  const { error } = await supabase.rpc("increment_inventory_stock", {
    row_id: inventoryItemId,
    amount,
  });

  if (error) {
    throw new Error(error.message || "Failed to update inventory stock");
  }
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
