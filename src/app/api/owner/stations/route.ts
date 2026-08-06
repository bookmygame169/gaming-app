import { NextRequest, NextResponse } from "next/server";
import { getOwnedCafeIdForBooking, requireOwnerContext } from "@/lib/ownerAuth";
import {
  getItemDurationFromPayload,
  parseAssignedStationsFromTitle,
} from "@/lib/ownerStationAssignments";
import { sendStationCommands } from "@/lib/stationCommands";

export const dynamic = "force-dynamic";

type BookingItemRow = {
  id: string;
  title: string | null;
  duration?: number | null;
};

/**
 * POST /api/owner/stations
 *
 * Starts or ends a session on the physical stations attached to a booking.
 *
 * Body: { bookingId: string, action: "unlock" | "lock" }
 *
 * The duration is read from the booking itself, never from the request — a
 * client-supplied length would let anyone with the dashboard open grant
 * themselves unlimited time.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;

    const { ownerId, supabase } = auth.context;
    const body = await request.json();

    const bookingId = String(body?.bookingId || "");
    const action = String(body?.action || "");

    if (!bookingId) {
      return NextResponse.json({ error: "bookingId is required" }, { status: 400 });
    }

    if (action !== "unlock" && action !== "lock") {
      return NextResponse.json(
        { error: 'action must be "unlock" or "lock"' },
        { status: 400 }
      );
    }

    // Confirms this owner actually owns the cafe the booking belongs to.
    const ownedCafeId = await getOwnedCafeIdForBooking(supabase, bookingId, ownerId);
    if (!ownedCafeId) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, duration, status, deleted_at, booking_items(id, title)")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError) {
      return NextResponse.json({ error: bookingError.message }, { status: 500 });
    }

    if (!booking || booking.deleted_at) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    if (action === "unlock" && (booking.status || "").toLowerCase() === "cancelled") {
      return NextResponse.json(
        { error: "This booking is cancelled" },
        { status: 409 }
      );
    }

    const items = (booking.booking_items || []) as BookingItemRow[];

    // Which physical machines this booking occupies, and for how long each.
    // Both were decided when the booking was made and are stored on the item.
    const targets = items.flatMap((item) => {
      const durationMinutes = getItemDurationFromPayload({
        duration: item.duration ?? null,
        title: item.title,
      });

      return parseAssignedStationsFromTitle(item.title).map((stationName) => ({
        stationName,
        durationMinutes: durationMinutes || Number(booking.duration) || 60,
      }));
    });

    if (targets.length === 0) {
      return NextResponse.json(
        { error: "This booking has no station assigned, so there is nothing to control." },
        { status: 409 }
      );
    }

    const durationByStation = new Map(
      targets.map((target) => [target.stationName, target.durationMinutes])
    );
    const stationNames = [...durationByStation.keys()];

    try {
      await sendStationCommands(stationNames, (stationName) =>
        action === "unlock"
          ? {
              action: "unlock",
              duration_seconds: (durationByStation.get(stationName) || 60) * 60,
              session_id: bookingId,
            }
          : { action: "lock" }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Station command publish failed:", err);

      // Deliberately explicit: staff need to know the PC did not receive this,
      // rather than seeing a success message next to a machine that is still
      // locked.
      return NextResponse.json(
        { error: `Could not reach the stations: ${message}` },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      action,
      stations: stationNames,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to send station command";
    console.error("Owner station command error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
