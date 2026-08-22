import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getItemDurationFromPayload,
  getAssignedStations,
} from "@/lib/ownerStationAssignments";
import { sendStationCommands } from "@/lib/stationCommands";
import { decideStationSession, sessionDurationMinutes } from "@/lib/sessionPolicy";

type BookingItemRow = {
  title: string | null;
  duration?: number | null;
  station_names?: string[] | null;
};

type BookingForSync = {
  cafe_id?: string | null;
  booking_date: string | null;
  start_time: string | null;
  duration: number | null;
  status: string | null;
  deleted_at: string | null;
  booking_items: BookingItemRow[] | null;
};

async function warnAboutStationsWithNoAgent(
  supabase: SupabaseClient,
  stationNames: string[],
  cafeId?: string | null
): Promise<void> {
  if (stationNames.length === 0) return;

  try {
    let query = supabase.from("station_status").select("station_name").in("station_name", stationNames);
    if (cafeId) query = query.eq("cafe_id", cafeId);

    const { data, error } = await query;
    if (error) return;

    const reporting = new Set((data ?? []).map((row) => row.station_name));
    const silent = stationNames.filter((name) => !reporting.has(name));

    if (silent.length > 0) {
      console.warn(
        `Station command sent to ${silent.join(", ")}, which no agent has ever ` +
          "reported for. Nothing will lock or unlock there until the lock is " +
          "installed on it, or the café's station count is corrected."
      );
    }
  } catch {
    // Nothing here is worth failing a sync over.
  }
}

export async function syncStationsForBooking(
  supabase: SupabaseClient,
  bookingId: string,
  options: { forceLock?: boolean } = {}
): Promise<void> {
  try {
    const columnsWithStations =
      "cafe_id, booking_date, start_time, duration, status, deleted_at, booking_items(title, station_names)";
    const columnsWithoutStations =
      "cafe_id, booking_date, start_time, duration, status, deleted_at, booking_items(title)";

    let { data, error } = await supabase
      .from("bookings")
      .select(columnsWithStations)
      .eq("id", bookingId)
      .maybeSingle();

    if (error && /station_names/i.test(error.message)) {
      ({ data, error } = await supabase
        .from("bookings")
        .select(columnsWithoutStations)
        .eq("id", bookingId)
        .maybeSingle());
    }

    if (error || !data) {
      if (error) console.error("Station sync: could not read booking:", error.message);
      return;
    }

    const booking = data as unknown as BookingForSync;
    const cafeId = booking.cafe_id || null;
    const stationNames = (booking.booking_items || []).flatMap((item) =>
      getAssignedStations(item)
    );

    let scannedDurationMinutes = 0;

    if (stationNames.length === 0) {
      const { data: scanned } = await supabase
        .from("station_unlock_tokens")
        .select("station_name, duration_minutes")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!scanned?.station_name) {
        return;
      }

      stationNames.push(scanned.station_name);
      scannedDurationMinutes = Number(scanned.duration_minutes) || 0;
    }

    await warnAboutStationsWithNoAgent(supabase, stationNames, cafeId);

    const durationMinutes = sessionDurationMinutes([
      ...(booking.booking_items || []).map((item) =>
        getItemDurationFromPayload({ duration: item.duration ?? null, title: item.title })
      ),
      Number(booking.duration) || 0,
      scannedDurationMinutes,
    ]);

    const decision = decideStationSession({
      sessionId: bookingId,
      forceLock: options.forceLock,
      deletedAt: booking.deleted_at,
      status: booking.status,
      bookingDate: booking.booking_date,
      startTime: booking.start_time,
      durationMinutes,
    });

    if (decision.action === "noop") {
      if (decision.reason === "unreadable_start") {
        console.error(
          `Station sync: could not read the start time "${booking.start_time}" on booking ${bookingId}.`
        );
      }
      return;
    }

    if (decision.action === "lock") {
      await sendStationCommands(stationNames, () => ({ action: "lock" }), { cafeId });
      return;
    }

    await sendStationCommands(
      stationNames,
      () => ({
        action: "unlock",
        duration_seconds: decision.remainingSeconds,
        session_id: bookingId,
      }),
      { cafeId }
    );
  } catch (err) {
    console.error(`Station sync failed for booking ${bookingId}:`, err);
  }
}
