import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireKnownStation, requireStationToken } from "@/lib/stationAgentAuth";

export const dynamic = "force-dynamic";

/**
 * How long a code on a lock screen is good for.
 *
 * Short because it is a key to a machine: the shorter it lives, the smaller the
 * window in which a photograph of somebody else's screen is worth anything. Not
 * so short that a customer opening their phone, unlocking it and pointing the
 * camera runs out of time — two minutes covers an unhurried scan with room to
 * spare, and the agent replaces it well before then.
 */
const TOKEN_LIFETIME_SECONDS = 120;

/**
 * POST /api/stations/unlock-token
 *
 * Called by the lock agent while a station sits locked. Returns a fresh
 * single-use code to draw as a QR, and the URL a customer's phone should open.
 *
 * Authenticated with the same heartbeat token as the other station routes —
 * there is no owner session on a gaming PC.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const cafeId = typeof body.cafeId === "string" ? body.cafeId.trim() : "";
    const stationName =
      typeof body.stationName === "string" ? body.stationName.trim().toLowerCase() : "";

    const unauthorized = requireStationToken(request, cafeId || null);
    if (unauthorized) return unauthorized;

    if (!cafeId || !stationName) {
      return NextResponse.json(
        { error: "cafeId and stationName are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const unknown = await requireKnownStation(supabase, { cafeId, stationName });
    if (unknown) return unknown;

    // 32 bytes of randomness, base64url so it survives a URL and a QR without
    // escaping. Guessing is not a viable attack on this, which is what lets the
    // token be the only thing standing between a scan and an unlocked PC.
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + TOKEN_LIFETIME_SECONDS * 1000);

    const { error: insertError } = await supabase.from("station_unlock_tokens").insert({
      cafe_id: cafeId,
      station_name: stationName,
      token,
      expires_at: expiresAt.toISOString(),
    });

    if (insertError) {
      console.error("Could not store unlock token:", insertError.message);
      return NextResponse.json({ error: "Could not issue a code" }, { status: 500 });
    }

    // Best effort, and deliberately not awaited for correctness: a station asks
    // for one of these every minute it sits locked, so without a sweep the table
    // grows by about 1,400 rows per machine per day. Failing to tidy up must
    // never stop a customer starting a session.
    void supabase.rpc("purge_expired_unlock_tokens").then(
      () => undefined,
      () => undefined
    );

    const origin =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
      request.nextUrl.origin;

    return NextResponse.json({
      token,
      url: `${origin}/play/${token}`,
      expiresInSeconds: TOKEN_LIFETIME_SECONDS,
    });
  } catch (err) {
    console.error("Unexpected error issuing unlock token:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
