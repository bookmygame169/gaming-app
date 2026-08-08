import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getItemDurationFromPayload,
  parseAssignedStationsFromTitle,
} from "@/lib/ownerStationAssignments";
import { sendStationCommands } from "@/lib/stationCommands";

/**
 * Keeps the physical machines in step with what a booking now says.
 *
 * Without this, the lock and the booking drift apart the moment anything
 * changes: adding time leaves the PC locking at the old hour, ending a session
 * leaves it unlocked, and deleting a booking leaves a machine running with no
 * record behind it. Staff would have to remember to press Lock separately every
 * time, which is exactly the discretion the whole system exists to remove.
 *
 * Called from the booking API rather than the dashboard so every route into a
 * change is covered — buttons, modals, and anything added later.
 */

type BookingItemRow = {
  title: string | null;
  duration?: number | null;
};

type BookingForSync = {
  booking_date: string | null;
  start_time: string | null;
  duration: number | null;
  status: string | null;
  deleted_at: string | null;
  booking_items: BookingItemRow[] | null;
};

/** Statuses where the machine should not be running, whatever the clock says. */
const CLOSED_STATUSES = new Set(["cancelled", "completed"]);

/**
 * Turns a booking's date and 12-hour start time into a real instant.
 *
 * Both are stored as India local time with no offset, so the offset is applied
 * explicitly. Letting the server infer it would put sessions five and a half
 * hours out whenever it runs in UTC, which it does on Vercel.
 */
function parseBookingStart(bookingDate: string, startTime: string): Date | null {
  const match = startTime.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?/i);
  if (!match) return null;

  let hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const period = match[3]?.toLowerCase();

  if (period === "pm" && hours !== 12) hours += 12;
  else if (period === "am" && hours === 12) hours = 0;

  const iso =
    `${bookingDate}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00+05:30`;

  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Brings the stations on a booking in line with it.
 *
 * Never throws: a station being unreachable must not fail the booking edit that
 * triggered it. The edit is the record; the command is a best-effort follow-up,
 * and the station stays locked if it never arrives.
 */
export async function syncStationsForBooking(
  supabase: SupabaseClient,
  bookingId: string,
  options: { forceLock?: boolean } = {}
): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("bookings")
      .select("booking_date, start_time, duration, status, deleted_at, booking_items(title)")
      .eq("id", bookingId)
      .maybeSingle();

    if (error || !data) {
      if (error) console.error("Station sync: could not read booking:", error.message);
      return;
    }

    const booking = data as unknown as BookingForSync;

    const stationNames = (booking.booking_items || []).flatMap((item) =>
      parseAssignedStationsFromTitle(item.title)
    );

    if (stationNames.length === 0) {
      return;
    }

    const status = (booking.status || "").toLowerCase();
    const shouldLock =
      options.forceLock === true ||
      Boolean(booking.deleted_at) ||
      CLOSED_STATUSES.has(status);

    if (shouldLock) {
      await sendStationCommands(stationNames, () => ({ action: "lock" }));
      return;
    }

    // Still running: work out how long is actually left and resend, so an
    // extension takes effect on the machine rather than only in the records.
    if (!booking.booking_date || !booking.start_time) {
      return;
    }

    const start = parseBookingStart(booking.booking_date, booking.start_time);
    if (!start) {
      console.error(
        `Station sync: could not read the start time "${booking.start_time}" on booking ${bookingId}.`
      );
      return;
    }

    const perItemMinutes = (booking.booking_items || []).map((item) =>
      getItemDurationFromPayload({ duration: item.duration ?? null, title: item.title })
    );

    const durationMinutes =
      Math.max(0, ...perItemMinutes, Number(booking.duration) || 0) || 60;

    const endsAt = start.getTime() + durationMinutes * 60_000;
    const remainingSeconds = Math.floor((endsAt - Date.now()) / 1000);

    // Already over — lock rather than send a zero-length session, which the
    // agent would treat as "no limit given".
    if (remainingSeconds <= 0) {
      await sendStationCommands(stationNames, () => ({ action: "lock" }));
      return;
    }

    await sendStationCommands(stationNames, () => ({
      action: "unlock",
      duration_seconds: remainingSeconds,
      session_id: bookingId,
    }));
  } catch (err) {
    // Logged loudly, never rethrown: the booking change already succeeded and
    // must not be reported as failed because a PC could not be reached.
    console.error(`Station sync failed for booking ${bookingId}:`, err);
  }
}
