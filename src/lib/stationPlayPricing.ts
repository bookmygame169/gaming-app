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

/**
 * How many hours a customer may buy in one go from a screen.
 *
 * A cap rather than a preference: this is an unattended purchase, and somebody
 * mistapping a longer block should be out a couple of hundred rupees at worst.
 */
export const MAX_HOURS_IN_ONE_GO = 5;

/**
 * The café's own durations, plus whole-hour blocks up to the cap.
 *
 * console_pricing is constrained to 30 and 60 minutes - the check constraint
 * spells out `ANY (ARRAY[30, 60])` - so longer blocks cannot be rows in it
 * without changing the schema the whole booking flow and the owner's pricing
 * editor are built around. They are derived from the hourly price instead.
 *
 * That is not a shortcut, it is the safer answer: multiples of a café's real
 * hourly rate stay correct on their own when the owner changes that rate, where
 * copied rows would quietly keep charging yesterday's price.
 *
 * Nothing is invented. If a café has no 60-minute price, no longer blocks are
 * offered - a made-up figure is worse than a shorter list.
 */
export function withWholeHourBlocks(
  options: { durationMinutes: number; price: number }[],
  maxHours = MAX_HOURS_IN_ONE_GO
): { durationMinutes: number; price: number }[] {
  const hourly = options.find((option) => option.durationMinutes === 60)?.price;
  if (!hourly || hourly <= 0) {
    return options;
  }

  const byDuration = new Map(options.map((option) => [option.durationMinutes, option]));

  for (let hours = 2; hours <= maxHours; hours++) {
    const minutes = hours * 60;
    // Never overwrite a price the café actually set.
    if (!byDuration.has(minutes)) {
      byDuration.set(minutes, { durationMinutes: minutes, price: hourly * hours });
    }
  }

  return [...byDuration.values()].sort((a, b) => a.durationMinutes - b.durationMinutes);
}

/**
 * The price for one seat for a given length, including the derived blocks.
 *
 * Used where a price must be re-checked rather than trusted, so it has to agree
 * exactly with what was quoted.
 */
export function priceForDuration(rows: PricingRow[], durationMinutes: number): number | null {
  const exact = priceForSingleStation(rows, durationMinutes);
  if (exact !== null) {
    return exact;
  }

  const derived = withWholeHourBlocks(durationOptions(rows)).find(
    (option) => option.durationMinutes === durationMinutes
  );

  return derived ? derived.price : null;
}
