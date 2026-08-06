import { NextRequest, NextResponse } from "next/server";
import { requireOwnerCafeAccess, requireOwnerContext } from "@/lib/ownerAuth";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

/**
 * Shape of a station_unlock_log row.
 *
 * Declared by hand because the table is newer than the generated Supabase types,
 * which otherwise makes every column read as an error type.
 */
type UnlockLogRow = {
  id: string;
  station_name: string;
  action: "unlock" | "lock";
  booking_id: string | null;
  trigger_source: string;
  staff_id: string | null;
  booking_amount: number | null;
  payment_mode: string | null;
  booking_status: string | null;
  duration_seconds: number | null;
  created_at: string;
};

/**
 * GET /api/owner/stations/log?cafeId=...&limit=100
 *
 * Recent unlock/lock history for a café — the paper trail for spotting a staff
 * member unlocking machines more often than payments would explain.
 *
 * Read-only: this table is append-only by design and there is no endpoint to
 * edit or delete rows, deliberately.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;

    const { ownerId, supabase } = auth.context;
    const { searchParams } = new URL(request.url);

    const cafeId = searchParams.get("cafeId") || "";
    if (!cafeId) {
      return NextResponse.json({ error: "cafeId is required" }, { status: 400 });
    }

    const accessResponse = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
    if (accessResponse) return accessResponse;

    const requestedLimit = Number(searchParams.get("limit"));
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;

    const { data: entries, error } = await supabase
      .from("station_unlock_log")
      .select(
        "id, station_name, action, booking_id, trigger_source, staff_id, " +
          "booking_amount, payment_mode, booking_status, duration_seconds, created_at"
      )
      .eq("cafe_id", cafeId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      // The most likely cause by far is the migration not having been run.
      console.error("Failed to read station_unlock_log:", error.message);
      return NextResponse.json(
        {
          error:
            "Could not read the unlock history. If this is the first time, the " +
            "station_unlock_log table may not exist yet — run migration " +
            "20260806000000_add_station_unlock_log.sql.",
        },
        { status: 500 }
      );
    }

    const rows = (entries ?? []) as unknown as UnlockLogRow[];

    // Resolve staff ids to something readable. Done separately rather than as a
    // join because station_unlock_log deliberately has no foreign keys.
    const staffIds = [...new Set(rows.map((row) => row.staff_id).filter(Boolean))] as string[];
    const staffNames = new Map<string, string>();

    if (staffIds.length > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", staffIds);

      if (profileError) {
        // Not fatal — the log is still readable with raw ids.
        console.error("Could not resolve staff names:", profileError.message);
      } else {
        for (const profile of profiles || []) {
          staffNames.set(profile.id, profile.full_name || profile.email || profile.id);
        }
      }
    }

    return NextResponse.json({
      entries: rows.map((row) => ({
        ...row,
        staff_name: row.staff_id ? staffNames.get(row.staff_id) ?? null : null,
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load unlock history";
    console.error("Owner station log error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
