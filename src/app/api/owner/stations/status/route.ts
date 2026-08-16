import { NextRequest, NextResponse } from "next/server";
import { requireOwnerCafeAccess, requireOwnerContext } from "@/lib/ownerAuth";

export const dynamic = "force-dynamic";

/**
 * How long without a heartbeat before a station counts as offline.
 *
 * Agents report every 30 seconds, so 90 covers two missed beats — long enough
 * that a brief network hiccup does not show a false alarm, short enough that a
 * killed agent is noticed quickly.
 */
const OFFLINE_AFTER_SECONDS = 90;

type StationStatusRow = {
  station_name: string;
  agent_version?: string | null;
  status: string;
  session_id: string | null;
  last_seen_at: string;
};

/**
 * GET /api/owner/stations/status?cafeId=...
 *
 * What each station last reported about itself.
 *
 * `online` is derived here rather than stored, since "offline" is the absence of
 * news — nothing writes a row to say a machine stopped talking.
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

    const { data, error } = await supabase
      .from("station_status")
      .select("station_name, status, session_id, last_seen_at, agent_version")
      .eq("cafe_id", cafeId);

    if (error) {
      console.error("Failed to read station_status:", error.message);
      return NextResponse.json(
        {
          error:
            "Could not read station status. If this is the first time, the " +
            "station_status table may not exist yet — run migration " +
            "20260806000001_add_station_status.sql.",
        },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as unknown as StationStatusRow[];
    const now = Date.now();

    return NextResponse.json({
      offlineAfterSeconds: OFFLINE_AFTER_SECONDS,
      stations: rows.map((row) => {
        const secondsSinceSeen = Math.max(
          0,
          Math.round((now - new Date(row.last_seen_at).getTime()) / 1000)
        );

        return {
          station_name: row.station_name,
          status: row.status,
          session_id: row.session_id,
          last_seen_at: row.last_seen_at,
          agent_version: row.agent_version ?? null,
          seconds_since_seen: secondsSinceSeen,
          online: secondsSinceSeen <= OFFLINE_AFTER_SECONDS,
        };
      }),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load station status";
    console.error("Owner station status error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
