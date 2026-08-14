import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser } from "@/lib/userAuth";
import { phoneKey } from "@/lib/loyalty";
import { isMissingWalletTable, toRupees, WALLET_SETUP_MESSAGE } from "@/lib/wallet";

export const dynamic = "force-dynamic";

/**
 * GET /api/wallet/mine
 *
 * The signed-in customer's balance at each café, and how it got there.
 *
 * Read-only by design. There is no payment gateway, so the only way money
 * enters a wallet is an owner confirming they were paid — a customer-facing
 * top-up endpoint would be a button that credits money nobody received.
 */
type LedgerRow = {
  id: string;
  cafe_id: string;
  amount: number;
  reason: string;
  payment_mode: string | null;
  note: string | null;
  created_at: string;
  cafes: { name: string } | null;
};

export async function GET(request: NextRequest) {
  try {
    const { userId, response: authResponse } = await requireUser(request);
    if (authResponse) return authResponse;

    const supabase = getSupabaseAdmin();

    const { data: profile } = await supabase
      .from("profiles")
      .select("phone")
      .eq("id", userId)
      .maybeSingle();

    const myKey = phoneKey(profile?.phone);

    // Wallets are keyed on the number given at the counter, so an account with
    // no phone genuinely has nothing to show — say so rather than show ₹0,
    // which reads as money having gone missing.
    if (!myKey) {
      return NextResponse.json({ cafes: [], needsPhone: true });
    }

    const { data, error } = await supabase
      .from("wallet_ledger")
      .select("id, cafe_id, amount, reason, payment_mode, note, created_at, cafes(name)")
      .eq("customer_phone", myKey)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("Could not read wallet:", error.message);
      return NextResponse.json(
        { error: isMissingWalletTable(error.message) ? WALLET_SETUP_MESSAGE : "Could not load your wallet." },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as unknown as LedgerRow[];
    if (rows.length === 0) {
      return NextResponse.json({ cafes: [], needsPhone: false });
    }

    const byCafe = new Map<
      string,
      { cafeId: string; cafeName: string; balance: number; history: LedgerRow[] }
    >();

    for (const row of rows) {
      const entry = byCafe.get(row.cafe_id) ?? {
        cafeId: row.cafe_id,
        cafeName: row.cafes?.name ?? "Café",
        balance: 0,
        history: [],
      };

      entry.balance += toRupees(row.amount);
      entry.history.push(row);
      byCafe.set(row.cafe_id, entry);
    }

    return NextResponse.json({
      needsPhone: false,
      cafes: [...byCafe.values()]
        .sort((a, b) => b.balance - a.balance)
        .map((entry) => ({
          cafeId: entry.cafeId,
          cafeName: entry.cafeName,
          balance: entry.balance,
          history: entry.history.slice(0, 25).map((row) => ({
            id: row.id,
            amount: toRupees(row.amount),
            reason: row.reason,
            paymentMode: row.payment_mode,
            note: row.note,
            createdAt: row.created_at,
          })),
        })),
    });
  } catch (err) {
    console.error("Unexpected error loading wallet:", err);
    return NextResponse.json({ error: "Could not load your wallet." }, { status: 500 });
  }
}
