/**
 * Adding up a ledger, per customer.
 *
 * Both the wallet and the loyalty screens are the same shape of problem: rows
 * of signed amounts against a phone number, which have to become one line per
 * customer. Pulled out of the two API routes so the arithmetic can be tested —
 * neither ledger has ever had a row in it, so tests are the only way any of
 * this has been checked at all.
 *
 * Money in and money out are counted separately rather than netted, because
 * "topped up ₹2,000, spent ₹1,800" and "topped up ₹200, spent nothing" are the
 * same balance and tell the owner completely different things.
 */

import { phoneKey } from "./loyalty";

export type WalletRow = {
  customer_phone?: string | null;
  /** Positive is a top-up, negative is a spend. */
  amount?: number | string | null;
  created_at?: string | null;
};

export type WalletTotals = {
  toppedUp: number;
  spent: number;
  lastAt: string | null;
};

export type LoyaltyRow = {
  customer_phone?: string | null;
  /** Positive is points earned, negative is points redeemed. */
  points?: number | string | null;
  created_at?: string | null;
};

export type LoyaltyTotals = {
  phone: string;
  balance: number;
  earned: number;
  redeemed: number;
  /** Points earned in the last 30 days. Redemptions do not reduce this. */
  earned30d: number;
  lastActivity: string | null;
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * `integer` columns arrive as numbers, but `numeric` ones arrive as strings
 * from PostgREST, and a ledger that grew a decimal column later would start
 * concatenating instead of adding. Coerced once, here.
 */
function toAmount(value?: number | string | null): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number.parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function laterOf(a: string | null, b: string | null | undefined): string | null {
  if (!b) return a;
  if (!a) return b;
  return b > a ? b : a;
}

/** Per-phone wallet totals, keyed the same way balances are. */
export function summariseWalletLedger(rows: WalletRow[]): Map<string, WalletTotals> {
  const byPhone = new Map<string, WalletTotals>();

  for (const row of rows) {
    // Numbers are stored inconsistently across the app - with and without the
    // country code - so they are normalised before being used as a key, or one
    // customer shows up as two.
    const key = phoneKey(row.customer_phone ?? null);
    if (!key) continue;

    const entry = byPhone.get(key) ?? { toppedUp: 0, spent: 0, lastAt: null };
    const amount = toAmount(row.amount);

    if (amount > 0) entry.toppedUp += amount;
    else entry.spent += Math.abs(amount);

    entry.lastAt = laterOf(entry.lastAt, row.created_at);
    byPhone.set(key, entry);
  }

  return byPhone;
}

/**
 * Per-phone loyalty totals, including what was earned in the last 30 days.
 *
 * `now` is passed in rather than read from the clock so the window can be
 * tested, and so every row in one response is measured against the same
 * instant instead of drifting as the loop runs.
 */
export function summariseLoyaltyLedger(
  rows: LoyaltyRow[],
  now: Date = new Date()
): Map<string, LoyaltyTotals> {
  const cutoff = new Date(now.getTime() - THIRTY_DAYS_MS).toISOString();
  const byPhone = new Map<string, LoyaltyTotals>();

  for (const row of rows) {
    const key = phoneKey(row.customer_phone ?? null);
    if (!key) continue;

    const entry = byPhone.get(key) ?? {
      phone: key,
      balance: 0,
      earned: 0,
      redeemed: 0,
      earned30d: 0,
      lastActivity: null,
    };

    const points = toAmount(row.points);
    entry.balance += points;

    if (points >= 0) {
      entry.earned += points;
      // Only earning counts toward the window. A redemption is the café paying
      // out, not the customer collecting, and subtracting it here would make a
      // regular who spent their points look inactive.
      if (row.created_at && row.created_at >= cutoff) entry.earned30d += points;
    } else {
      entry.redeemed += -points;
    }

    entry.lastActivity = laterOf(entry.lastActivity, row.created_at);
    byPhone.set(key, entry);
  }

  return byPhone;
}
