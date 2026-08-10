import type { SupabaseClient } from "@supabase/supabase-js";
import { phoneKey } from "@/lib/loyalty";

/**
 * The prepaid wallet.
 *
 * Money a café has already been paid and is holding on the customer's behalf.
 * Kept apart from loyalty points on purpose: points are a discount the café
 * chooses to give, a wallet balance is the customer's own money and the café
 * owes it back in play whether it likes the customer or not.
 */

export type WalletReason = "topup" | "spend" | "refund" | "correction";

export type WalletEntry = {
  id: string;
  amount: number;
  reason: WalletReason;
  paymentMode: string | null;
  paymentReference: string | null;
  note: string | null;
  createdAt: string;
};

/** Whole rupees, and never anything else. */
export function toRupees(value: unknown): number {
  const numeric = Math.round(Number(value));
  return Number.isFinite(numeric) ? numeric : 0;
}

/**
 * A single customer's balance at one café.
 *
 * Summed from the ledger rather than read off a column: a stored balance and a
 * list of movements are two things that can disagree, and when they do there is
 * no way to tell which one is lying.
 */
export async function getWalletBalance(
  supabase: SupabaseClient,
  cafeId: string,
  phone: string | null | undefined
): Promise<number> {
  const key = phoneKey(phone);
  if (!key) return 0;

  const { data, error } = await supabase
    .from("wallet_ledger")
    .select("amount")
    .eq("cafe_id", cafeId)
    .eq("customer_phone", key);

  if (error || !data) return 0;

  return data.reduce((sum, row) => sum + toRupees(row.amount), 0);
}

/** Balances for every customer holding money at a café. */
export async function getWalletBalances(
  supabase: SupabaseClient,
  cafeId: string
): Promise<Map<string, number>> {
  const balances = new Map<string, number>();

  const { data, error } = await supabase
    .from("wallet_ledger")
    .select("customer_phone, amount")
    .eq("cafe_id", cafeId);

  if (error || !data) return balances;

  for (const row of data) {
    balances.set(
      row.customer_phone,
      (balances.get(row.customer_phone) ?? 0) + toRupees(row.amount)
    );
  }

  return balances;
}

export function isMissingWalletTable(message: string | null | undefined): boolean {
  return Boolean(message && message.includes("wallet_ledger"));
}

export const WALLET_SETUP_MESSAGE =
  "The wallet is not set up yet. Run migration 20260810000005_add_customer_wallet.sql in Supabase.";
