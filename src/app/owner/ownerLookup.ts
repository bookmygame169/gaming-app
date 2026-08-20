/**
 * The dashboard's read path.
 *
 * Every one of these used to be a direct `supabase.from(...)` in the browser,
 * which only worked because row-level security was off — and worked just as
 * well for anyone else who opened the page source. The queries now live on the
 * server, behind the owner cookie, in /api/owner/lookup.
 *
 * Shapes are named, never composed here: the caller says which of a fixed set
 * of queries it wants and the server owns the tables, columns and filters.
 */

type LookupBody = Record<string, unknown> & { cafeId: string; shape: string };

async function lookup<T>(body: LookupBody, pick: (json: Record<string, unknown>) => T, fallback: T): Promise<T> {
  try {
    const res = await fetch("/api/owner/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error(`owner lookup "${body.shape}" failed:`, res.status);
      return fallback;
    }

    return pick(await res.json());
  } catch (err) {
    // Callers previously saw an empty result when a query failed, and the
    // dashboard is built around that. Throwing here would turn a slow network
    // into a blank screen with no message.
    console.error(`owner lookup "${body.shape}" failed:`, err);
    return fallback;
  }
}

const rows = <T,>(json: Record<string, unknown>) => (json.rows as T[]) || [];

export function fetchInventory<T>(
  cafeId: string,
  opts: { availableOnly?: boolean; inStockOnly?: boolean; orderBy?: "category" | "name" } = {}
): Promise<T[]> {
  return lookup<T[]>(
    {
      cafeId,
      shape: "inventory",
      availableOnly: !!opts.availableOnly,
      inStockOnly: !!opts.inStockOnly,
      orderBy: opts.orderBy ?? "category",
    },
    rows,
    []
  );
}

export function searchCustomersByName<T>(cafeId: string, query: string): Promise<T[]> {
  return lookup<T[]>({ cafeId, shape: "customer-search", query }, rows, []);
}

export function fetchStationPricing<T>(cafeId: string): Promise<T[]> {
  return lookup<T[]>({ cafeId, shape: "station-pricing" }, rows, []);
}

export function fetchOrdersForBooking<T>(cafeId: string, bookingId: string): Promise<T[]> {
  return lookup<T[]>({ cafeId, shape: "orders-by-booking", bookingId }, rows, []);
}

export function fetchOrdersInRange<T>(cafeId: string, startIso: string, endIso: string): Promise<T[]> {
  return lookup<T[]>({ cafeId, shape: "orders-in-range", startIso, endIso }, rows, []);
}

export function fetchBookingUpdatedAt(cafeId: string, bookingId: string): Promise<string | null> {
  return lookup<string | null>(
    { cafeId, shape: "booking-updated-at", bookingId },
    (json) => (json.updatedAt as string) ?? null,
    null
  );
}

export function fetchBookingCustomers<T>(cafeId: string): Promise<T[]> {
  return lookup<T[]>({ cafeId, shape: "booking-customers" }, rows, []);
}
