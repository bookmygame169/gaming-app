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

/**
 * A number in the form wa.me expects: country code, no plus, no spaces.
 *
 * Four different versions of this exist in the UI today and they disagree:
 * one adds 91 only to a ten-digit number, one adds it unless the number
 * already starts with 91, one always adds it, and one adds nothing at all —
 * which produces a link that does not open for a plain Indian mobile.
 *
 * This is the first of those, because it is the only one that is already a
 * named function with a stated contract. Bringing the other three here is a
 * behaviour change for numbers written with a leading zero, so it is a
 * decision to take deliberately rather than fold into a refactor.
 */
export function whatsappNumber(phone: string | null | undefined): string {
  const digits = dialableDigits(phone);
  return digits.length === 10 ? `91${digits}` : digits;
}
