import { NextRequest, NextResponse } from "next/server";
import { requireOwnerCafeAccess, requireOwnerContext } from "@/lib/ownerAuth";
import { phoneKey } from "@/lib/loyalty";
import {
  getWalletBalances,
  isMissingWalletTable,
  toRupees,
  WALLET_SETUP_MESSAGE,
  type WalletReason,
} from "@/lib/wallet";

export const dynamic = "force-dynamic";

/**
 * The café's side of the wallet: who is holding money, and putting it in or
 * taking it out.
 *
 * Only an owner can move a wallet. There is no payment gateway, so a credit
 * here is a person at a counter saying "I have been paid" — which is why every
 * entry records who said it, how they were paid, and against what reference.
 */

const MAX_TOPUP = 50000;

function walletError(message: string) {
  return NextResponse.json(
    { error: isMissingWalletTable(message) ? WALLET_SETUP_MESSAGE : message },
    { status: 500 }
  );
}

/** GET /api/owner/wallet?cafeId=…&phone=… */
export async function GET(request: NextRequest) {
  const auth = await requireOwnerContext(request);
  if (auth.response) return auth.response;

  const { ownerId, supabase } = auth.context;
  const cafeId = request.nextUrl.searchParams.get("cafeId");
  const phone = request.nextUrl.searchParams.get("phone");

  if (!cafeId) {
    return NextResponse.json({ error: "cafeId is required" }, { status: 400 });
  }

  const accessError = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
  if (accessError) return accessError;

  // One customer: balance plus their own history, for the counter.
  if (phone) {
    const key = phoneKey(phone);
    if (!key) return NextResponse.json({ balance: 0, history: [] });

    const { data, error } = await supabase
      .from("wallet_ledger")
      .select("id, amount, reason, payment_mode, payment_reference, note, created_at")
      .eq("cafe_id", cafeId)
      .eq("customer_phone", key)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return walletError(error.message);

    const rows = data ?? [];

    return NextResponse.json({
      phone: key,
      balance: rows.reduce((sum, row) => sum + toRupees(row.amount), 0),
      history: rows.map((row) => ({
        id: row.id,
        amount: toRupees(row.amount),
        reason: row.reason,
        paymentMode: row.payment_mode,
        paymentReference: row.payment_reference,
        note: row.note,
        createdAt: row.created_at,
      })),
    });
  }

  // Everyone: the list, plus what the café is holding in total.
  const balances = await getWalletBalances(supabase, cafeId);

  const { data: recent, error: recentError } = await supabase
    .from("wallet_ledger")
    .select("id, customer_phone, amount, reason, payment_mode, created_at")
    .eq("cafe_id", cafeId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (recentError) return walletError(recentError.message);

  // Names live on bookings; the ledger only knows the phone.
  const namesByPhone = new Map<string, string>();
  const { data: bookingRows } = await supabase
    .from("bookings")
    .select("customer_name, customer_phone")
    .eq("cafe_id", cafeId)
    .not("customer_name", "is", null)
    .order("created_at", { ascending: false })
    .limit(2000);

  for (const booking of bookingRows ?? []) {
    const key = phoneKey(booking.customer_phone as string | null);
    if (key && !namesByPhone.has(key) && booking.customer_name) {
      namesByPhone.set(key, booking.customer_name as string);
    }
  }

  const holders = [...balances.entries()]
    .filter(([, balance]) => balance !== 0)
    .map(([phone, balance]) => ({
      phone,
      name: namesByPhone.get(phone) ?? null,
      balance,
    }))
    .sort((a, b) => b.balance - a.balance);

  return NextResponse.json({
    // Money the café is holding on customers' behalf — a liability, and the
    // number an owner needs to see before it surprises them.
    totalHeld: holders.reduce((sum, holder) => sum + Math.max(0, holder.balance), 0),
    holders: holders.slice(0, 100),
    recent: (recent ?? []).map((row) => ({
      id: row.id,
      phone: row.customer_phone,
      amount: toRupees(row.amount),
      reason: row.reason,
      paymentMode: row.payment_mode,
      createdAt: row.created_at,
    })),
  });
}

/**
 * POST /api/owner/wallet — put money in, or take it out.
 *
 * body: { cafeId, phone, amount, reason, paymentMode?, paymentReference?,
 *         note?, bookingId?, idempotencyKey? }
 *
 * `amount` is always positive; the reason decides the sign. Asking someone at a
 * counter to type a minus sign is how money moves the wrong way.
 */
export async function POST(request: NextRequest) {
  const auth = await requireOwnerContext(request);
  if (auth.response) return auth.response;

  const { ownerId, supabase } = auth.context;
  const body = await request.json().catch(() => ({}));
  const { cafeId } = body;

  if (!cafeId) {
    return NextResponse.json({ error: "cafeId is required" }, { status: 400 });
  }

  const accessError = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
  if (accessError) return accessError;

  const key = phoneKey(body.phone);
  if (!key) {
    return NextResponse.json({ error: "Enter a valid 10-digit phone number" }, { status: 400 });
  }

  const reason: WalletReason = ["topup", "spend", "refund", "correction"].includes(body.reason)
    ? body.reason
    : "topup";

  const amount = toRupees(body.amount);

  if (amount <= 0) {
    return NextResponse.json({ error: "Enter an amount" }, { status: 400 });
  }

  if (amount > MAX_TOPUP) {
    return NextResponse.json(
      { error: `That is over ₹${MAX_TOPUP.toLocaleString("en-IN")}. Split it, or check the amount.` },
      { status: 400 }
    );
  }

  // Money out is negative. Refunds take money out of the wallet too — the
  // customer is getting cash back, so the balance has to fall.
  const takesMoneyOut = reason === "spend" || reason === "refund";
  const signedAmount = takesMoneyOut ? -amount : amount;

  // Checked here so the customer is told the real balance rather than being
  // shown a database error. The trigger is what actually guarantees it.
  if (takesMoneyOut) {
    const { data: rows, error: balanceError } = await supabase
      .from("wallet_ledger")
      .select("amount")
      .eq("cafe_id", cafeId)
      .eq("customer_phone", key);

    if (balanceError) return walletError(balanceError.message);

    const balance = (rows ?? []).reduce((sum, row) => sum + toRupees(row.amount), 0);

    if (amount > balance) {
      return NextResponse.json(
        { error: `That wallet only has ₹${balance.toLocaleString("en-IN")}.` },
        { status: 400 }
      );
    }
  }

  const { error } = await supabase.from("wallet_ledger").insert({
    cafe_id: cafeId,
    customer_phone: key,
    amount: signedAmount,
    reason,
    payment_mode:
      typeof body.paymentMode === "string" && body.paymentMode ? body.paymentMode : null,
    payment_reference:
      typeof body.paymentReference === "string" && body.paymentReference.trim()
        ? body.paymentReference.trim().slice(0, 60)
        : null,
    booking_id: typeof body.bookingId === "string" && body.bookingId ? body.bookingId : null,
    created_by: ownerId,
    note: typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 200) : null,
    idempotency_key:
      typeof body.idempotencyKey === "string" && body.idempotencyKey
        ? body.idempotencyKey.slice(0, 80)
        : null,
  });

  if (error) {
    // 23505 is the idempotency index: this exact attempt already landed, which
    // is a success from the caller's point of view, not a failure to retry.
    if (error.code === "23505") {
      return NextResponse.json({ success: true, duplicate: true });
    }

    // 23514 is the no-overdraw trigger winning a race the check above lost.
    if (error.code === "23514") {
      return NextResponse.json(
        { error: "That would take the wallet below zero. Reload and try again." },
        { status: 409 }
      );
    }

    return walletError(error.message);
  }

  const { data: rows } = await supabase
    .from("wallet_ledger")
    .select("amount")
    .eq("cafe_id", cafeId)
    .eq("customer_phone", key);

  return NextResponse.json({
    success: true,
    balance: (rows ?? []).reduce((sum, row) => sum + toRupees(row.amount), 0),
  });
}
