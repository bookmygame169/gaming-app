import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getOccupiedUnitCountForConsole,
  loadStationReservationState,
} from "@/lib/ownerStationAssignments";
import { getIndiaDateString, getIndiaCurrentMinutes, parseBookingStartMinutes } from "@/lib/bookingFilters";

export const dynamic = "force-dynamic";

/**
 * GET /api/cafes/[cafeId]/live — what is free at this café right now.
 *
 * Public, because it is the thing that decides whether a stranger books. "3 PCs
 * free now" is a far stronger reason to come in than a price.
 *
 * Two sources, and the difference between them is the whole design:
 *
 * - The bookings table knows what has been reserved. Always available, always
 *   correct about intent, and blind to whether anyone actually turned up.
 * - The lock agents on the machines know what is genuinely in use. Correct
 *   about reality, but only while they are running and reporting.
 *
 * A café whose agents are switched off — or not installed yet — must not have
 * three-day-old machine state presented as live. Freshness is checked and the
 * answer says which source it came from, so the page can word itself honestly
 * rather than claiming to know something it does not.
 */

/**
 * How recently a station must have reported to be believed.
 *
 * The agent heartbeats far more often than this; the window is generous so a
 * brief network drop does not blink the whole café offline, and short enough
 * that a machine switched off an hour ago is not still counted as occupied.
 */
const FRESH_MS = 3 * 60 * 1000;

type StationStatusRow = {
  station_name: string;
  status: string;
  last_seen_at: string;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ cafeId: string }> }
) {
  try {
    const { cafeId } = await params;
    if (!cafeId) {
      return NextResponse.json({ error: "cafeId is required" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        // Next caches fetch responses inside route handlers, and the Supabase
        // client goes through fetch — so this endpoint was happily serving
        // three-day-old station state while the database had the current row.
        // "force-dynamic" governs the route, not the client's own requests.
        // Freshness is the entire point here, so opt out explicitly.
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    });

    const today = getIndiaDateString();
    const nowMinutes = getIndiaCurrentMinutes();

    // What the café has, and which stations today's bookings are holding.
    let state;
    try {
      state = await loadStationReservationState(supabase, cafeId, today, null, null, null);
    } catch {
      // A café with no stations configured is not an error, it just has
      // nothing to report.
      return NextResponse.json({ source: "none", consoles: [] });
    }

    // Bookings running at this exact moment, rather than any time today.
    const { data: bookings } = await supabase
      .from("bookings")
      .select("start_time, duration, status, deleted_at, booking_items(console, quantity, title)")
      .eq("cafe_id", cafeId)
      .eq("booking_date", today)
      .in("status", ["in-progress", "confirmed"]);

    const busyByConsole = new Map<string, number>();

    for (const booking of bookings ?? []) {
      if (booking.deleted_at) continue;

      const start = parseBookingStartMinutes(booking.start_time as string | null);
      const duration = Number(booking.duration) || 60;
      if (start === null) continue;

      // Right now, not merely today.
      if (nowMinutes < start || nowMinutes >= start + duration) continue;

      for (const item of (booking.booking_items ?? []) as Array<{
        console: string;
        quantity: number;
      }>) {
        const consoleId = String(item.console || "").toLowerCase();
        if (!consoleId) continue;

        busyByConsole.set(
          consoleId,
          (busyByConsole.get(consoleId) ?? 0) +
            getOccupiedUnitCountForConsole(consoleId, item.quantity)
        );
      }
    }

    // What the machines themselves say, if any of them are still reporting.
    const { data: statusRows } = await supabase
      .from("station_status")
      .select("station_name, status, last_seen_at")
      .eq("cafe_id", cafeId);

    const cutoff = Date.now() - FRESH_MS;
    const fresh = ((statusRows ?? []) as StationStatusRow[]).filter(
      (row) => new Date(row.last_seen_at).getTime() >= cutoff
    );

    const inUseByStation = new Set(
      fresh.filter((row) => row.status === "unlocked").map((row) => row.station_name)
    );

    const consoles = Object.entries(state.availableStationsByConsole).map(
      ([consoleId, stations]) => {
        const total = stations.length;

        // Whichever source says more are busy wins. An agent reporting a
        // machine in use on a walk-in with no booking, and a booking whose
        // customer has not switched the PC on yet, are both real — counting
        // only one of them would show a station as free that is not.
        const agentBusy = stations.filter((name) => inUseByStation.has(name)).length;
        const bookedBusy = busyByConsole.get(consoleId) ?? 0;
        const busy = Math.min(total, Math.max(agentBusy, bookedBusy));

        return { console: consoleId, total, free: Math.max(0, total - busy), busy };
      }
    );

    return NextResponse.json({
      // Named so the page can say "free right now" only when a machine actually
      // told us so, and fall back to "not booked right now" otherwise.
      source: fresh.length > 0 ? "live" : "bookings",
      checkedAt: new Date().toISOString(),
      consoles: consoles.filter((entry) => entry.total > 0),
    });
  } catch (err) {
    console.error("Live availability failed:", err);
    // The café page must still render. No data is better than an error where a
    // reassurance was meant to go.
    return NextResponse.json({ source: "none", consoles: [] });
  }
}
