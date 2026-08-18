/**
 * The only part of a Supabase query this needs.
 *
 * Structural rather than importing PostgrestFilterBuilder, whose generic
 * parameters change shape between client versions and would drag every caller
 * into declaring them.
 */
type RangeableQuery<T> = {
  range(
    from: number,
    to: number
  ): PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
};

/**
 * Reads every row a query matches, not the first page of them.
 *
 * PostgREST answers an unbounded select with at most `db-max-rows` — 1000 on
 * this project — and says nothing about the rest. There is no error and no
 * flag; the array is simply short. Code that then sums it in JavaScript
 * produces a number that looks right and is not.
 *
 * That is not hypothetical here. An all-time revenue query for the one live
 * café matches 2,847 bookings and returns 1,000 of them, so 1,847 bookings
 * were never counted. It grows worse with every booking taken.
 *
 * Ranges are requested until a page comes back short, which is the only
 * termination condition that does not need a separate count query.
 *
 * @param build  Called per page. A fresh builder each time, because a
 *               PostgrestFilterBuilder is a thenable and awaiting one twice
 *               replays a resolved promise rather than issuing a new request.
 */
export async function fetchAllRows<T>(
  build: () => RangeableQuery<T>,
  options: { pageSize?: number; maxRows?: number } = {}
): Promise<{ rows: T[]; error: string | null; truncated: boolean }> {
  const pageSize = options.pageSize ?? 1000;

  // A ceiling so a runaway query cannot exhaust the function's memory. Well
  // above any real café's history; reaching it is reported rather than hidden,
  // which is the whole point of this module.
  const maxRows = options.maxRows ?? 100_000;

  const rows: T[] = [];

  for (let from = 0; from < maxRows; from += pageSize) {
    const to = Math.min(from + pageSize, maxRows) - 1;

    const { data, error } = await build().range(from, to);

    if (error) {
      return { rows, error: error.message, truncated: false };
    }

    const page = (data ?? []) as T[];
    rows.push(...page);

    // Short page means the end. Equality with pageSize is ambiguous — it could
    // be the last full page — so one more request is spent to find out.
    if (page.length < pageSize) {
      return { rows, error: null, truncated: false };
    }
  }

  return { rows, error: null, truncated: true };
}

/**
 * Splits ids for use with `.in(...)`.
 *
 * PostgREST puts these in the query string, so a few thousand uuids becomes a
 * URL that proxies reject — a failure that only appears once a café has enough
 * history, which is the worst time to discover it.
 */
export function chunked<T>(items: T[], size = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
