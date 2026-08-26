import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { syncDueStationSessions } from "@/lib/stationSchedule";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/station-sync
 *
 * Manual/external trigger for the due-session sweep. Not registered in
 * vercel.json: a sub-daily Vercel cron on the Hobby plan invalidates the
 * whole deployment. Production unlocks from station heartbeats instead.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    console.error("[Station sync] CRON_SECRET is not set; rejecting request.");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncDueStationSessions(getSupabaseAdmin());
    console.log(
      `[Station sync] unlocked=${result.unlocked} completed=${result.completed} skipped=${result.skipped} failed=${result.failed}`
    );
    const status = result.failed > 0 ? 500 : 200;
    return NextResponse.json({ ok: result.failed === 0, ...result }, { status });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[Station sync] failed:", detail);
    return NextResponse.json({ ok: false, error: detail }, { status: 500 });
  }
}
