import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Authentication for requests coming from a lock agent on a café PC.
 *
 * There is no owner session and no user session on a gaming PC — nobody is
 * signed in, and the machine is sitting in a public room. What it has instead
 * is a shared bearer token issued at enrolment, which proves the caller is one
 * of our agents but says nothing about *which* station it is.
 *
 * That distinction is the reason `requireKnownStation` exists and is not
 * optional. The token alone would let any enrolled PC name any station in any
 * café — including one it does not belong to — so every route that acts on a
 * station has to check the pairing before it acts.
 */

export type StationIdentity = {
  cafeId: string;
  stationName: string;
};

/**
 * Checks the bearer token. Returns a response to send back, or null to carry on.
 */
export function requireStationToken(request: NextRequest): NextResponse | null {
  const expected = process.env.STATION_HEARTBEAT_TOKEN?.trim();
  if (!expected) {
    console.error("STATION_HEARTBEAT_TOKEN is not set; rejecting station request.");
    return NextResponse.json({ error: "Server not configured" }, { status: 503 });
  }

  const header = request.headers.get("authorization") || "";
  const provided = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";

  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

/**
 * Pulls cafeId and stationName out of a body and normalises them.
 */
export function readStationIdentity(body: unknown): StationIdentity | null {
  const source = (body ?? {}) as Record<string, unknown>;

  const cafeId = typeof source.cafeId === "string" ? source.cafeId.trim() : "";
  const stationName =
    typeof source.stationName === "string" ? source.stationName.trim().toLowerCase() : "";

  if (!cafeId || !stationName) {
    return null;
  }

  return { cafeId, stationName };
}

/**
 * Confirms the station really belongs to the café that named it.
 *
 * Without this, one café's token could act on another café's machines: the
 * token says "an agent", not "this agent".
 */
export async function requireKnownStation(
  supabase: SupabaseClient,
  identity: StationIdentity
): Promise<NextResponse | null> {
  const { data, error } = await supabase
    .from("station_status")
    .select("station_name")
    .eq("cafe_id", identity.cafeId)
    .eq("station_name", identity.stationName)
    .maybeSingle();

  if (error) {
    console.error("Station lookup failed:", error.message);
    return NextResponse.json({ error: "Could not verify this station" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Unknown station" }, { status: 404 });
  }

  return null;
}
