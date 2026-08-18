/**
 * One definition of "the same customer".
 *
 * `customer_phone` holds whatever was typed at a counter: 9876543210,
 * +91 98765 43210, 09876543210. Matching them is therefore a decision, and it
 * was being made independently in a dozen places with three different answers:
 *
 *   - `digits.slice(-10)`                    (Billing)
 *   - `digits.replace(/^91(?=\d{10}$)/, '')` (dashboard helpers)
 *   - `digits`, unnormalised                 (most of the rest)
 *
 * They agree on a plain ten-digit number and disagree on every other form, so
 * the same customer could hold a wallet balance under one screen and appear as
 * a stranger on the next.
 *
 * The canonical rule is the last ten digits. It is what the loyalty ledger has
 * always stored, which makes it the one already written into the database.
 */

/**
 * The comparable form of a phone number, or null if there is not enough of one.
 *
 * Null rather than an empty string on purpose: an empty key would compare equal
 * to every other blank number and silently merge unrelated customers.
 */
export function phoneKey(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/** Whether two numbers belong to the same customer, however they were typed. */
export function samePhone(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const left = phoneKey(a);
  return left !== null && left === phoneKey(b);
}

/**
 * A fragment safe to hand to `.ilike("customer_phone", ...)`.
 *
 * The last four digits stay contiguous under every way a number gets written,
 * so this narrows in SQL without assuming a format. It is a superset — callers
 * must still compare on {@link phoneKey} — but it turns a table scan into an
 * index-assisted one without risking a miss.
 */
export function phoneSearchFragment(phone: string | null | undefined): string | null {
  const key = phoneKey(phone);
  return key === null ? null : `%${key.slice(-4)}%`;
}

/** Digits only, for building a wa.me or tel: link. */
export function dialableDigits(phone: string | null | undefined): string {
  return (phone || "").replace(/\D/g, "");
}
