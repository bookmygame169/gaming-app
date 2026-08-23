import { NextRequest, NextResponse } from "next/server";
import { requireOwnerCafeAccess, requireOwnerContext } from "@/lib/ownerAuth";
import { sendStationCommands } from "@/lib/stationCommands";
import { fetchLatestAgentVersion, isOlderVersion } from "@/lib/agentVersion";

export const dynamic = "force-dynamic";

/**
 * POST /api/owner/stations/update
 *
 * Asks one PC to restart so it picks up a new version of the lock.
 *
 * Body: { cafeId, stationName }
 *
 * A restart rather than an update, and the difference is the whole design. The
 * updater has been on every machine all along, running as SYSTEM at startup and
 * every four hours - but it refuses to replace an agent that is running, which
 * is right: doing so would take the lock off a machine somebody may be sitting
 * at. On a café PC signed in from open to close it therefore never gets its
 * chance, which is how four machines ended up between eight and twenty-five
 * versions behind.
 *
 * Restarting hands it that chance safely. The PC comes back up, the update goes
 * in before anyone logs in, and the agent starts afterwards - no window in which
 * a customer is looking at an unlocked desktop, which is what installing over a
 * running agent would have meant.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;

    const { ownerId, supabase } = auth.context;
    const body = await request.json().catch(() => ({}));

    const cafeId = String(body?.cafeId || "");
    const stationName = String(body?.stationName || "").trim().toLowerCase();

    if (!cafeId || !stationName) {
      return NextResponse.json(
        { error: "cafeId and stationName are required" },
        { status: 400 }
      );
    }

    const accessError = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
    if (accessError) return accessError;

    const { data: station } = await supabase
      .from("station_status")
      .select("status, session_id, last_seen_at, agent_version")
      .eq("cafe_id", cafeId)
      .eq("station_name", stationName)
      .maybeSingle();

    if (!station) {
      return NextResponse.json(
        { error: "That PC has never reported in, so there is nothing to update." },
        { status: 404 }
      );
    }

    // Checked here as well as on the machine. This one is a courtesy - it turns
    // an unexplained silence into a sentence the owner can act on - while the
    // machine's own check is the one that actually protects the customer,
    // because this reads a heartbeat that may be half a minute old.
    if ((station.status || "").toLowerCase() === "unlocked") {
      return NextResponse.json(
        { error: "Somebody is playing on that PC. It can update once they finish." },
        { status: 409 }
      );
    }

    const secondsSinceSeen = station.last_seen_at
      ? Math.round((Date.now() - new Date(station.last_seen_at).getTime()) / 1000)
      : Number.MAX_SAFE_INTEGER;

    if (secondsSinceSeen > 90) {
      return NextResponse.json(
        { error: "That PC is offline. Switch it on, and it will update by itself." },
        { status: 409 }
      );
    }

    const latest = await fetchLatestAgentVersion();

    if (!isOlderVersion(station.agent_version ?? null, latest)) {
      return NextResponse.json(
        { error: "That PC is already on the newest version." },
        { status: 409 }
      );
    }

    try {
      await sendStationCommands([stationName], () => ({ action: "restart" }), { cafeId });
    } catch (err) {
      console.error("Could not send the restart:", err);
      return NextResponse.json(
        { error: "Could not reach that PC. Check it is on, then try again." },
        { status: 502 }
      );
    }

    await supabase.from("station_unlock_log").insert({
      cafe_id: cafeId,
      station_name: stationName,
      action: "lock",
      trigger_source: "update_restart",
      staff_id: ownerId,
      booking_status: `updating ${station.agent_version ?? "?"} to ${latest ?? "?"}`,
    });

    console.log(
      `${stationName} asked to restart for an update (${station.agent_version} -> ${latest}).`
    );

    return NextResponse.json({
      success: true,
      station: stationName,
      from: station.agent_version ?? null,
      to: latest,
    });
  } catch (err) {
    console.error("Unexpected error asking a PC to update:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
