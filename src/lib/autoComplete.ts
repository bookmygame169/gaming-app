import type { SupabaseClient } from "@supabase/supabase-js";
import { syncStationsForBooking } from "@/lib/stationSync";
import { awardPointsForBooking } from "@/lib/loyalty";

/**
 * Marks sessions whose time has run out as completed — and does the two things
 * that have to follow.
 *
 * A session ending is the single most common state change in the app, and it
 * almost never happens by someone pressing a button: the dashboard and the
 * bookings list both notice the clock has passed and update the row. Both did
 * only that, which meant the two consequences of a session ending never
 * happened on the normal path.
 *
 * The machine stayed unlocked. That is the whole promise of the lock system —
 * the session is over, the PC should not still be playable — and it only held
 * when an owner happened to mark the booking complete by hand.
 *
 * No points were awarded. Loyalty is earned on completed sessions, so a scheme
 * that only pays out when staff manually close a booking pays out almost never.
 *
 * Kept in one place because there are two callers and there will be more; the
 * bug was that each of them wrote the UPDATE itself and stopped there.
 */
export async function completeEndedBookings(
  supabase: SupabaseClient,
  bookingIds: string[]
): Promise<void> {
  if (bookingIds.length === 0) return;

  const { error } = await supabase
    .from("bookings")
    .update({ status: "completed" })
    .in("id", bookingIds);

  if (error) {
    console.error("Auto-complete bookings failed:", error.message, "ids:", bookingIds);
    return;
  }

  // Read back after the update so the rows carry the completed status the
  // follow-up work depends on, and so a booking someone deleted in between is
  // simply absent rather than acted on.
  const { data: completed, error: readError } = await supabase
    .from("bookings")
    .select("id, cafe_id, customer_phone, user_id, total_amount, booking_date")
    .in("id", bookingIds)
    .is("deleted_at", null);

  if (readError) {
    console.error("Could not re-read auto-completed bookings:", readError.message);
    return;
  }

  for (const booking of completed ?? []) {
    // Sequential rather than parallel: each of these publishes a station
    // command, and a burst of them against one broker is worth avoiding for
    // work nobody is waiting on.
    await syncStationsForBooking(supabase, booking.id);
    await awardPointsForBooking(supabase, booking);
  }
}
