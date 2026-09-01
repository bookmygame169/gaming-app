/**
 * What the expenses API will accept.
 *
 * Separate from the route so the rules can be tested without standing up a
 * request and an owner session. They are small, and every one of them is here
 * because the alternative is a row that looks fine in the table and is wrong in
 * a total three weeks later.
 */

/** The longest a description is allowed to be, so a paste cannot fill the column. */
export const MAX_DESCRIPTION = 300;

/**
 * A rupee figure that can be stored.
 *
 * Rejects zero as well as negatives. A zero-rupee expense is not a cheap
 * expense, it is a row somebody abandoned half way through, and it would sit in
 * the list forever looking like a real one. A negative one is worse: an expense
 * is a direction, not a sign, so it would read as income everywhere it is
 * summed and there is no screen that would show it as anything odd.
 */
export function toPositiveAmount(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  // Two decimal places, because the column is numeric and a stray float from
  // the browser should not decide how a total rounds.
  return Math.round(numeric * 100) / 100;
}

/**
 * A plain calendar date.
 *
 * Checked against the calendar, not just the shape: "2026-02-31" matches the
 * pattern and is not a day, and Postgres would reject it with an error the
 * dashboard shows as a raw database message.
 */
export function toDateString(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;

  // Round-tripped rather than trusted, because Date rolls an impossible day
  // forward instead of refusing it — 31 February becomes 3 March.
  return parsed.toISOString().slice(0, 10) === value ? value : null;
}

/** An optional note. Blank and whitespace-only both mean "nothing was written". */
export function toDescription(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text.slice(0, MAX_DESCRIPTION) : null;
}
