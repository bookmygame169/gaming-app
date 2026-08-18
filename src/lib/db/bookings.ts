/**
 * The one place that knows what "a booking that counts" means.
 *
 * `bookings` is read from 41 different files, and the rule for which rows are
 * real — not soft-deleted, not cancelled, not an owner comp — was written out
 * by hand at each of them. Three consequences, all of which have already
 * happened here:
 *
 *   - `.neq("status", "cancelled")` compiles to `status <> 'cancelled'`, and
 *     `NULL <> 'cancelled'` is NULL rather than true, so every row with no
 *     status was dropped from revenue silently. Fixed in six places one at a
 *     time, because there was no single place to fix it.
 *   - Some callers filtered soft-deleted rows and some did not, so the same
 *     café's history totalled differently depending on which screen asked.
 *   - The column list was spelled out five times and had already drifted.
 *
 * Nothing here changes what a query means. It gives the meaning one name.
 */

/** Columns every list view of a booking needs. */
export const BOOKING_LIST_COLUMNS =
  "id, cafe_id, user_id, booking_date, start_time, duration, total_amount, " +
  "status, payment_mode, source, customer_name, customer_phone, created_at, deleted_at";

/** The list columns plus the items that carry price and station assignment. */
export const BOOKING_WITH_ITEMS_COLUMNS =
  `${BOOKING_LIST_COLUMNS}, booking_items(id, console, quantity, price, title)`;

/**
 * The two methods these filters call.
 *
 * Each helper is generic in the query type and hands the same type back, so a
 * caller keeps every other builder method — `.gte`, `.order`, `.range` — after
 * filtering. Narrowing to a structural type instead would silently drop them
 * and force a cast at every call site, which is how a filter helper ends up
 * unused.
 */
type Narrowable = {
  is(column: string, value: null): unknown;
  or(filters: string): unknown;
};

/**
 * Excludes soft-deleted rows.
 *
 * Deleting a booking does not change its status, so a query that forgets this
 * keeps counting the money and keeps showing the customer — which is how 30
 * deleted bookings worth ₹7,795 stayed in one café's customer history while
 * its reports correctly left them out.
 */
export function excludeDeleted<Q>(query: Q): Q {
  return (query as Narrowable).is("deleted_at", null) as Q;
}

/**
 * Excludes cancelled bookings, and keeps rows with no status.
 *
 * `.neq()` would drop the latter. A booking written without a status is a bug
 * worth seeing in the totals, not one worth hiding from them.
 */
export function excludeCancelled<Q>(query: Q): Q {
  return (query as Narrowable).or("status.is.null,status.neq.cancelled") as Q;
}

/**
 * Excludes owner comps, and keeps rows with no payment mode.
 *
 * Same NULL rule as above. These are sessions the café gave away, so they
 * belong in usage figures but not in revenue.
 */
export function excludeOwnerComps<Q>(query: Q): Q {
  return (query as Narrowable).or("payment_mode.is.null,payment_mode.neq.owner") as Q;
}

/**
 * Everything that counts as earned money: not deleted, not cancelled, not
 * comped. The filter chain behind every revenue figure in the product.
 */
export function revenueBookings<Q>(query: Q): Q {
  return excludeOwnerComps(excludeCancelled(excludeDeleted(query)));
}

/**
 * Bookings that exist, whatever their status.
 *
 * For counting sessions and filling schedules, where a cancellation is still
 * something that happened.
 */
export function livingBookings<Q>(query: Q): Q {
  return excludeDeleted(query);
}
