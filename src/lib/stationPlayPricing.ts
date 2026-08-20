import { toRupees } from "@/lib/wallet";

/**
 * Turning a café's price list into the choices offered for one seat.
 *
 * Shared by the two ways of paying for a station: the QR route, where the
 * customer's phone shows the options, and the lock screen's own Pay Now, where
 * the PC does. They must quote the same prices — a customer who sees ₹100 on
 * the screen and ₹70 on their phone will pick the cheaper one and be right to.
 */

/** pc-01 -> pc, ps5-02 -> ps5. Matches how console_pricing is keyed. */
export function consoleTypeOf(stationName: string): string {
  const prefix = stationName.split("-")[0]?.toLowerCase() || "";
  return prefix === "ps5" ? "ps5" : "pc";
}

export type PricingRow = {
  duration_minutes: number;
  price: number | string | null;
  quantity: number | string | null;
};

/**
 * One seat on a lock-screen PC is quantity 1. Owner prices are stored per
 * player-count as well as duration, so reading every row and calling
 * maybeSingle() on a duration blows up the moment a café has a 2-player price.
 *
 * Prefer quantity 1; if that row is missing, take the lowest quantity that
 * exists for that duration so the phone still has something to charge.
 */
export function priceForSingleStation(
  rows: PricingRow[],
  durationMinutes?: number
): number | null {
  const matching = rows.filter((row) =>
    durationMinutes === undefined ? true : Number(row.duration_minutes) === durationMinutes
  );
  if (matching.length === 0) return null;

  const qtyOne = matching.find((row) => Number(row.quantity) === 1);
  const chosen = qtyOne || [...matching].sort((a, b) => Number(a.quantity) - Number(b.quantity))[0];
  return toRupees(chosen.price);
}

export function durationOptions(rows: PricingRow[]): { durationMinutes: number; price: number }[] {
  const byDuration = new Map<number, number>();

  const ordered = [...rows].sort((a, b) => {
    const qtyDiff = Number(a.quantity || 99) - Number(b.quantity || 99);
    if (qtyDiff !== 0) return qtyDiff;
    return Number(a.duration_minutes) - Number(b.duration_minutes);
  });

  for (const row of ordered) {
    const duration = Number(row.duration_minutes);
    if (!Number.isFinite(duration) || duration <= 0) continue;
    if (byDuration.has(duration)) continue;
    byDuration.set(duration, toRupees(row.price));
  }

  return [...byDuration.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([durationMinutes, price]) => ({ durationMinutes, price }));
}
