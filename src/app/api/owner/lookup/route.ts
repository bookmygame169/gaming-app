import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireOwnerCafeAccess, requireOwnerContext } from "@/lib/ownerAuth";

export const dynamic = "force-dynamic";

/**
 * POST /api/owner/lookup
 *
 * The dashboard's reads, moved off the browser.
 *
 * These queries used to run in the browser against the anon key. That worked
 * only because row-level security was switched off — which also meant anyone
 * who opened the page source could run them too, against every café's data
 * rather than their own.
 *
 * It cannot be fixed with a policy. The owner dashboard signs in with its own
 * cookie rather than a Supabase session, so its requests carry no identity the
 * database can see: to Postgres they are indistinguishable from a stranger's.
 * The check has to happen somewhere that can read the cookie, which is here.
 *
 * Deliberately NOT a generic query proxy. Each shape below is fixed in this
 * file and takes only the parameters it needs; the client picks a name, never
 * a table, a column or a filter. A proxy that forwarded arbitrary PostgREST
 * would have re-created the hole it was written to close.
 */

type Shape =
  | "inventory"
  | "orders-by-booking"
  | "orders-in-range"
  | "station-pricing"
  | "booking-updated-at"
  | "booking-customers"
  | "customer-search"
  | "expenses";

/** Rejects anything that is not a sane ISO timestamp before it reaches a filter. */
function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 40) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

/** Rejects anything that is not a plain calendar date before it reaches a filter. */
function dateOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

/**
 * The café's own inventory ids.
 *
 * Derived here rather than accepted from the browser. The old queries filtered
 * orders by an id list the client had assembled, which is fine when the client
 * is the owner's dashboard and worthless as a boundary — this is what stops one
 * café reading another's orders by naming their item ids.
 */
async function itemIdsFor(supabase: SupabaseClient, cafeId: string): Promise<string[]> {
  const { data } = await supabase.from("inventory_items").select("id").eq("cafe_id", cafeId);
  return (data || []).map((row) => row.id as string);
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;

    const { ownerId, supabase } = auth.context;
    const body = await request.json().catch(() => ({}));

    const cafeId = String(body?.cafeId || "");
    const shape = String(body?.shape || "") as Shape;

    if (!cafeId) {
      return NextResponse.json({ error: "cafeId is required" }, { status: 400 });
    }

    const accessError = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
    if (accessError) return accessError;

    switch (shape) {
      case "inventory": {
        let query = supabase.from("inventory_items").select("*").eq("cafe_id", cafeId);
        if (body?.availableOnly === true) query = query.eq("is_available", true);
        if (body?.inStockOnly === true) query = query.gt("stock_quantity", 0);

        // Some screens list by name alone rather than grouped by category.
        // Kept as an option so moving these reads to the server does not
        // quietly reorder a list somebody is used to.
        if (body?.orderBy === "name") {
          const { data, error } = await query.order("name", { ascending: true });
          if (error) throw error;
          return NextResponse.json({ rows: data || [] });
        }

        const { data, error } = await query
          .order("category", { ascending: true })
          .order("name", { ascending: true });

        if (error) throw error;
        return NextResponse.json({ rows: data || [] });
      }

      case "orders-by-booking": {
        const bookingId = String(body?.bookingId || "");
        if (!bookingId) {
          return NextResponse.json({ error: "bookingId is required" }, { status: 400 });
        }

        // The booking has to belong to this café. Without this an owner could
        // read any booking's orders by guessing an id.
        const { data: booking } = await supabase
          .from("bookings")
          .select("id, updated_at")
          .eq("id", bookingId)
          .eq("cafe_id", cafeId)
          .maybeSingle();

        if (!booking) {
          return NextResponse.json({ error: "Booking not found" }, { status: 404 });
        }

        const { data, error } = await supabase
          .from("booking_orders")
          .select("*")
          .eq("booking_id", bookingId)
          .order("ordered_at", { ascending: false });

        if (error) throw error;
        return NextResponse.json({ rows: data || [], updatedAt: booking.updated_at });
      }

      case "orders-in-range": {
        const startIso = isoOrNull(body?.startIso);
        const endIso = isoOrNull(body?.endIso);
        if (!startIso || !endIso) {
          return NextResponse.json({ error: "startIso and endIso are required" }, { status: 400 });
        }

        const itemIds = await itemIdsFor(supabase, cafeId);
        if (itemIds.length === 0) return NextResponse.json({ rows: [] });

        const { data, error } = await supabase
          .from("booking_orders")
          .select(
            `*, bookings!inner(id, cafe_id, customer_name, customer_phone,
              booking_date, start_time, payment_mode, status)`
          )
          .in("inventory_item_id", itemIds)
          .neq("bookings.status", "cancelled")
          .neq("bookings.payment_mode", "owner")
          .is("bookings.deleted_at", null)
          .gte("ordered_at", startIso)
          .lte("ordered_at", endIso)
          .order("ordered_at", { ascending: false });

        if (error) throw error;
        return NextResponse.json({ rows: data || [] });
      }

      case "station-pricing": {
        const { data, error } = await supabase
          .from("station_pricing")
          .select("*")
          .eq("cafe_id", cafeId);

        if (error) throw error;
        return NextResponse.json({ rows: data || [] });
      }

      case "booking-updated-at": {
        const bookingId = String(body?.bookingId || "");
        if (!bookingId) {
          return NextResponse.json({ error: "bookingId is required" }, { status: 400 });
        }

        const { data } = await supabase
          .from("bookings")
          .select("updated_at")
          .eq("id", bookingId)
          .eq("cafe_id", cafeId)
          .maybeSingle();

        return NextResponse.json({ updatedAt: data?.updated_at ?? null });
      }

      case "booking-customers": {
        const { data, error } = await supabase
          .from("bookings")
          .select("customer_name, customer_phone")
          .eq("cafe_id", cafeId)
          .is("deleted_at", null)
          .not("customer_phone", "is", null)
          .order("created_at", { ascending: false })
          .limit(500);

        if (error) throw error;
        return NextResponse.json({ rows: data || [] });
      }

      case "customer-search": {
        const term = typeof body?.query === "string" ? body.query.trim() : "";
        if (term.length < 2) return NextResponse.json({ rows: [] });

        // Escaped before it reaches a LIKE pattern: % and _ are wildcards
        // there, and a customer typing either would otherwise widen their own
        // search to the whole café.
        const safe = term.replace(/[\\%_]/g, (ch: string) => "\\" + ch);

        const { data, error } = await supabase
          .from("bookings")
          .select("customer_name, customer_phone")
          .eq("cafe_id", cafeId)
          .is("deleted_at", null)
          .ilike("customer_name", `%${safe}%`)
          .not("customer_name", "is", null)
          .limit(8);

        if (error) throw error;
        return NextResponse.json({ rows: data || [] });
      }

      case "expenses": {
        // The range is optional so the tab can open on everything, but it is
        // validated when given: a malformed date reaching a .gte would come
        // back as a database error the dashboard cannot explain.
        const from = dateOrNull(body?.from);
        const to = dateOrNull(body?.to);

        let query = supabase
          .from("expenses")
          .select("id, cafe_id, category, description, amount, expense_date, created_at")
          .eq("cafe_id", cafeId);

        if (from) query = query.gte("expense_date", from);
        if (to) query = query.lte("expense_date", to);

        // Newest first, and by insertion within a day: several expenses are
        // usually entered in one sitting and the last one typed is the one
        // being checked.
        const { data, error } = await query
          .order("expense_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1000);

        if (error) throw error;
        return NextResponse.json({ rows: data || [] });
      }

      default:
        return NextResponse.json({ error: "Unknown lookup" }, { status: 400 });
    }
  } catch (err) {
    console.error("Owner lookup failed:", err);
    return NextResponse.json({ error: "Could not load that." }, { status: 500 });
  }
}
