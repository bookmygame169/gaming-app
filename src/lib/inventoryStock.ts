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
  if (!inventoryItemId || normalizedAmount === 0) {
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

  const { data: currentRow, error: readError } = await supabase
    .from("inventory_items")
    .select("stock_quantity")
    .eq("id", inventoryItemId)
    .maybeSingle();

  if (readError) {
    throw new Error(readError.message || "Failed to read inventory stock");
  }

  if (!currentRow) {
    throw new Error("Inventory item not found");
  }

  const currentQuantity = Math.max(0, Math.trunc(Number(currentRow.stock_quantity) || 0));
  const nextQuantity = Math.max(0, currentQuantity + normalizedAmount);

  const { data: updatedRow, error: updateError } = await supabase
    .from("inventory_items")
    .update({ stock_quantity: nextQuantity })
    .eq("id", inventoryItemId)
    .select("stock_quantity")
    .maybeSingle();

  if (updateError) {
    throw new Error(updateError.message || "Failed to update inventory stock");
  }

  return Math.max(0, Math.trunc(Number(updatedRow?.stock_quantity ?? nextQuantity) || 0));
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
