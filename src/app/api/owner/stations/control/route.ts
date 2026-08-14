import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireOwnerCafeAccess, requireOwnerContext } from "@/lib/ownerAuth";
import { sendStationCommands } from "@/lib/stationCommands";

export const dynamic = "force-dynamic";

const DEFAULT_MANUAL_UNLOCK_MINUTES = 60;
const MAX_MANUAL_UNLOCK_MINUTES = 480;

async function recordManualStationLog(
  supabase: SupabaseClient,
  entry: {
    cafeId: string;
    stationName: string;
    action: "unlock" | "lock";
    staffId: string;
    durationSeconds: number | null;
    sessionId: string;
  }
): Promise<void> {
  try {
    const { error } = await supabase.from("station_unlock_log").insert({
      cafe_id: entry.cafeId,
      station_name: entry.stationName,
      action: entry.action,
      booking_id: null,
      trigger_source: "staff_manual",
      staff_id: entry.staffId,
      booking_amount: null,
      payment_mode: null,
      booking_status: "manual",
      duration_seconds: entry.durationSeconds,
    });

    if (error) {
      console.error("AUDIT WRITE FAILED for manual station_unlock_log:", error.message);
    }
  } catch (err) {
    console.error("AUDIT WRITE FAILED for manual station_unlock_log:", err);
  }
}

/**
 * POST /api/owner/stations/control
 *
 * Lock or unlock one station directly — no booking required.
 *
 * Body: {
 *   cafeId: string,
 *   stationName: string,  // e.g. pc-01
 *   action: "unlock" | "lock",
 *   durationMinutes?: number  // unlock only, default 60
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;

    const { ownerId, supabase } = auth.context;
    const body = await request.json().catch(() => ({}));

    const cafeId = String(body?.cafeId || "");
    const stationName = String(body?.stationName || "").trim().toLowerCase();
    const action = String(body?.action || "");

    if (!cafeId || !stationName) {
      return NextResponse.json(
        { error: "cafeId and stationName are required" },
        { status: 400 }
      );
    }

    if (action !== "unlock" && action !== "lock") {
      return NextResponse.json(
        { error: 'action must be "unlock" or "lock"' },
        { status: 400 }
      );
    }

    const accessError = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
    if (accessError) return accessError;

    const durationMinutes =
      action === "unlock"
        ? Math.min(
            MAX_MANUAL_UNLOCK_MINUTES,
            Math.max(
              15,
              Number.parseInt(String(body?.durationMinutes || DEFAULT_MANUAL_UNLOCK_MINUTES), 10) ||
                DEFAULT_MANUAL_UNLOCK_MINUTES
            )
          )
        : null;

    const sessionId = `manual-${ownerId.slice(0, 8)}-${Date.now()}`;

    try {
      await sendStationCommands([stationName], () =>
        action === "unlock"
          ? {
              action: "unlock",
              duration_seconds: (durationMinutes ?? DEFAULT_MANUAL_UNLOCK_MINUTES) * 60,
              session_id: sessionId,
            }
          : { action: "lock" }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Manual station command publish failed:", err);
      return NextResponse.json(
        { error: `Could not reach ${stationName}: ${message}` },
        { status: 502 }
      );
    }

    await recordManualStationLog(supabase, {
      cafeId,
      stationName,
      action,
      staffId: ownerId,
      durationSeconds:
        action === "unlock" ? (durationMinutes ?? DEFAULT_MANUAL_UNLOCK_MINUTES) * 60 : null,
      sessionId,
    });

    return NextResponse.json({
      success: true,
      action,
      stationName,
      durationMinutes: action === "unlock" ? durationMinutes : null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to send station command";
    console.error("Manual station control error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
