import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type EnrollmentRow = {
  id: string;
  cafe_id: string;
  station_name: string;
  expires_at: string;
  redeemed_at: string | null;
};

/**
 * Splits MQTT_BROKER_URL into the parts the agent's config needs.
 *
 * The website stores one URL because its MQTT library takes one; the agent takes
 * host, port and a TLS flag separately. Converting here keeps that difference
 * out of the agent.
 */
function parseBrokerUrl(url: string): { host: string; port: number; useTls: boolean } | null {
  try {
    const parsed = new URL(url);
    const useTls = parsed.protocol === "mqtts:" || parsed.protocol === "wss:";
    const port = parsed.port ? Number(parsed.port) : useTls ? 8883 : 1883;

    if (!parsed.hostname || !Number.isFinite(port)) {
      return null;
    }

    return { host: parsed.hostname, port, useTls };
  } catch {
    return null;
  }
}

/**
 * POST /api/stations/enroll
 *
 * Exchanges a single-use pairing code for this station's settings.
 *
 * Body: { code, machineName? }
 *
 * Unauthenticated by design — the caller is a PC that has just been installed
 * and holds no credentials yet. The code IS the credential: single-use, expiring
 * in two hours, and only creatable by a signed-in owner.
 *
 * This is what keeps the installer free of secrets. Without it the broker
 * password would have to be baked into every download, which cannot then be
 * hosted publicly or shared between cafés.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const code = String(body?.code || "").trim().toUpperCase();
    const machineName = body?.machineName ? String(body.machineName).slice(0, 200) : null;

    if (!code) {
      return NextResponse.json({ error: "A setup code is required" }, { status: 400 });
    }

    const brokerUrl = process.env.MQTT_BROKER_URL;
    const heartbeatToken = process.env.STATION_HEARTBEAT_TOKEN;

    if (!brokerUrl) {
      console.error("MQTT_BROKER_URL is not set; cannot enroll stations.");
      return NextResponse.json(
        { error: "This site is not set up for stations yet. Contact support." },
        { status: 503 }
      );
    }

    const broker = parseBrokerUrl(brokerUrl);
    if (!broker) {
      console.error(`MQTT_BROKER_URL is not a valid URL: ${brokerUrl}`);
      return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("station_enrollments")
      .select("id, cafe_id, station_name, expires_at, redeemed_at")
      .eq("code", code)
      .maybeSingle();

    if (error) {
      console.error("Enrollment lookup failed:", error.message);
      return NextResponse.json({ error: "Could not check that code" }, { status: 500 });
    }

    const enrollment = data as EnrollmentRow | null;

    // One message for every rejection, so a caller guessing codes learns nothing
    // about which ones exist.
    const rejection = NextResponse.json(
      { error: "That setup code is not valid. Generate a new one from your dashboard." },
      { status: 404 }
    );

    if (!enrollment) return rejection;
    if (enrollment.redeemed_at) return rejection;
    if (new Date(enrollment.expires_at).getTime() < Date.now()) return rejection;

    // Marked used before the settings are returned, and conditional on it still
    // being unredeemed, so two machines racing on the same code cannot both be
    // handed credentials.
    const { data: claimed, error: claimError } = await supabase
      .from("station_enrollments")
      .update({
        redeemed_at: new Date().toISOString(),
        redeemed_machine: machineName,
      })
      .eq("id", enrollment.id)
      .is("redeemed_at", null)
      .select("id")
      .maybeSingle();

    if (claimError) {
      console.error("Failed to claim enrollment code:", claimError.message);
      return NextResponse.json({ error: "Could not use that code" }, { status: 500 });
    }

    if (!claimed) {
      // Another machine claimed it between the read and the update.
      return rejection;
    }

    const origin = new URL(request.url).origin;

    return NextResponse.json({
      stationId: enrollment.station_name,
      mqtt: {
        host: broker.host,
        port: broker.port,
        useTls: broker.useTls,
        username: process.env.MQTT_USERNAME || null,
        password: process.env.MQTT_PASSWORD || null,
      },
      heartbeat: heartbeatToken
        ? {
            url: `${origin}/api/stations/heartbeat`,
            token: heartbeatToken,
            cafeId: enrollment.cafe_id,
          }
        : null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to enroll";
    console.error("Station enrollment error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
