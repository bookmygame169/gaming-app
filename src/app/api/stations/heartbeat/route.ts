import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * POST /api/stations/heartbeat
 *
 * Called by each station agent every 30 seconds, and immediately whenever it
 * locks or unlocks.
 *
 * Body: { cafeId, stationName, status: "locked" | "unlocked", sessionId? }
 * Header: Authorization: Bearer <STATION_HEARTBEAT_TOKEN>
 *
 * Not part of /api/owner/* on purpose: the caller is a café PC, not a signed-in
 * owner, so it authenticates with a shared token instead of a session cookie.
 *
 * The token is only good for reporting status. Even if one leaks off a café PC,
 * it cannot unlock anything — unlock commands go over MQTT and are only ever
 * sent by the owner-authenticated route.
 */
export async function POST(request: NextRequest) {
  try {
    // Trimmed because copying a value into a hosting dashboard very easily picks
    // up a trailing space or newline, which then fails to match with no clue as
    // to why.
    const expectedToken = process.env.STATION_HEARTBEAT_TOKEN?.trim();
    if (!expectedToken) {
      console.error("STATION_HEARTBEAT_TOKEN is not set; rejecting heartbeat.");
      return NextResponse.json({ error: "Server not configured" }, { status: 503 });
    }

    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";

    if (token !== expectedToken) {
      // Lengths only, never the values. Enough to tell a truncated paste from a
      // genuinely different token, which is otherwise slow to diagnose across
      // two machines, and useless to anyone probing the endpoint.
      return NextResponse.json(
        {
          error: "Unauthorized",
          hint:
            `Received a token of ${token.length} characters; the server expects ` +
            `${expectedToken.length}. If those differ, the value was truncated or ` +
            `has stray whitespace. If they match, the two values are simply different — ` +
            `and remember the site must be redeployed after changing an environment variable.`,
        },
        { status: 401 }
      );
    }

    const body = await request.json();
    const cafeId = String(body?.cafeId || "");
    const stationName = String(body?.stationName || "").trim().toLowerCase();
    const status = String(body?.status || "").trim().toLowerCase();
    const sessionId = body?.sessionId ? String(body.sessionId) : null;

    // Optional: an agent older than the build that started sending this simply
    // does not, and a station reporting no version is still a station reporting.
    const agentVersion = body?.version ? String(body.version).slice(0, 20) : null;

    if (!cafeId || !stationName) {
      return NextResponse.json(
        { error: "cafeId and stationName are required" },
        { status: 400 }
      );
    }

    if (status !== "locked" && status !== "unlocked") {
      return NextResponse.json(
        { error: 'status must be "locked" or "unlocked"' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const base = {
      cafe_id: cafeId,
      station_name: stationName,
      status,
      session_id: sessionId,
      last_seen_at: new Date().toISOString(),
    };

    let { error } = await supabase
      .from("station_status")
      .upsert({ ...base, agent_version: agentVersion }, { onConflict: "cafe_id,station_name" });

    /**
     * Written again without the version if that column is not there yet.
     *
     * Code reaches production the moment it is pushed; a migration is run by
     * hand, whenever somebody gets to it. Writing a column that does not exist
     * yet failed the whole upsert - so every station stopped reporting, the
     * dashboard showed them all offline, and the QR flow refused every scan
     * because it checks a machine is online before taking money. A field that
     * only feeds a line of text on a card took the lock offline.
     *
     * Retried rather than detected in advance, so it starts recording versions
     * on its own once the migration lands, with nothing to redeploy.
     */
    if (error && /agent_version/i.test(error.message)) {
      console.warn("station_status has no agent_version column yet; recording the heartbeat without it.");
      ({ error } = await supabase
        .from("station_status")
        .upsert(base, { onConflict: "cafe_id,station_name" }));
    }

    if (error) {
      console.error("Heartbeat upsert failed:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to record heartbeat";
    console.error("Station heartbeat error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
