import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireKnownStation, requireStationToken } from "@/lib/stationAgentAuth";
import { syncDueStationSessions } from "@/lib/stationSchedule";

export const dynamic = "force-dynamic";

/**
 * How often the due-session sweep may run for one café.
 *
 * Every station heartbeats every 30 seconds, so ten machines would otherwise
 * run the same café sweep twenty times a minute.
 */
const SWEEP_EVERY_MS = 40_000;

/**
 * How long a heartbeat will wait for the sweep before answering anyway.
 *
 * A station that gets no answer treats the heartbeat as failed and shows as
 * offline on the dashboard - and the QR flow refuses to take money for a
 * machine it thinks is offline.
 */
const SWEEP_WAIT_MS = 4_000;

const lastSweepFinishedAtMs = new Map<string, number>();
const sweepInFlight = new Map<string, Promise<void>>();

/**
 * Unlocks machines whose paid start time has arrived, for this café only.
 *
 * This is deliberately not a Vercel cron. Crons on the Hobby plan run once a
 * day, and a schedule finer than that does not merely get ignored - it makes
 * the whole deployment invalid, which has already stopped production twice.
 *
 * The throttle is recorded when the sweep *finishes*, not when it starts, so a
 * 4s timeout cannot black out the next 40s of heartbeats while MQTT is still
 * connecting. Overlapping heartbeats wait on the in-flight sweep instead of
 * starting a second copy.
 */
async function sweepDueSessions(cafeId: string): Promise<void> {
  const now = Date.now();
  const lastFinished = lastSweepFinishedAtMs.get(cafeId) ?? 0;
  if (now - lastFinished < SWEEP_EVERY_MS && !sweepInFlight.has(cafeId)) return;

  let sweep = sweepInFlight.get(cafeId);
  if (!sweep) {
    sweep = syncDueStationSessions(getSupabaseAdmin(), cafeId)
      .then((result) => {
        if (result.unlocked > 0 || result.completed > 0 || result.failed > 0) {
          console.log(
            `[Station sync] cafe ${cafeId}: unlocked=${result.unlocked} completed=${result.completed} failed=${result.failed}`
          );
        }
      })
      .catch((err: unknown) => {
        console.error(
          "[Station sync] heartbeat-triggered sweep failed:",
          err instanceof Error ? err.message : err
        );
      })
      .finally(() => {
        lastSweepFinishedAtMs.set(cafeId, Date.now());
        sweepInFlight.delete(cafeId);
      });
    sweepInFlight.set(cafeId, sweep);
  }

  await Promise.race([sweep, new Promise((resolve) => setTimeout(resolve, SWEEP_WAIT_MS))]);
}

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
 * The token is only good for reporting this station's status and for kicking
 * this café's due-session sweep. Unlock commands still go over MQTT.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const cafeId = String(body?.cafeId || "");
    const unauthorized = requireStationToken(request, cafeId || null);
    if (unauthorized) return unauthorized;

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

    const stationCheck = await requireKnownStation(supabase, { cafeId, stationName });
    if (stationCheck && stationCheck.status !== 404) {
      return stationCheck;
    }

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

    await sweepDueSessions(cafeId);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to record heartbeat";
    console.error("Station heartbeat error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
