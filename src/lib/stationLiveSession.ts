import type { SupabaseClient } from "@supabase/supabase-js";
import { toRupees } from "@/lib/wallet";

/**
 * The session a station is in the middle of right now.
 *
 * Found through the booking item rather than through station_status, because
 * the session id a machine reports is not always a booking id - a walk-in
 * approved from the lock screen carries an id of its own - while the item's
 * station_names list is written by every path that puts somebody on a PC.
 */
export type LiveStationBooking = {
  id: string;
  customerName: string | null;
  customerPhone: string | null;
  bookingDate: string | null;
  startTime: string | null;
  durationMinutes: number;
  totalAmount: number;
  item: {
    id: string;
    title: string | null;
    price: number;
    console: string | null;
    quantity: number | null;
  } | null;
};

export async function findLiveBookingForStation(
  supabase: SupabaseClient,
  cafeId: string,
  stationName: string
): Promise<LiveStationBooking | null> {
  // One literal, never assembled from pieces: a select built by concatenation
  // widens to string and supabase-js answers it with GenericStringError
  // instead of rows.
  const { data, error } = await supabase
    .from("booking_items")
    .select(
      "id, title, price, console, quantity, booking_id, bookings!inner(id, cafe_id, status, deleted_at, created_at, customer_name, customer_phone, booking_date, start_time, duration, total_amount)"
    )
    .contains("station_names", [stationName])
    .eq("bookings.cafe_id", cafeId)
    .eq("bookings.status", "in-progress")
    .is("bookings.deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    if (error) console.error("Could not find the live booking:", error.message);
    return null;
  }

  const row = data[0] as Record<string, unknown>;
  const booking = (Array.isArray(row.bookings) ? row.bookings[0] : row.bookings) as
    | Record<string, unknown>
    | undefined;

  if (!booking?.id) return null;

  return {
    id: String(booking.id),
    customerName: (booking.customer_name as string) ?? null,
    customerPhone: (booking.customer_phone as string) ?? null,
    bookingDate: (booking.booking_date as string) ?? null,
    startTime: (booking.start_time as string) ?? null,
    durationMinutes: Number(booking.duration) || 0,
    totalAmount: toRupees(booking.total_amount),
    item: row.id
      ? {
          id: String(row.id),
          title: (row.title as string) ?? null,
          price: toRupees(row.price),
          console: (row.console as string) ?? null,
          quantity: (row.quantity as number) ?? null,
        }
      : null,
  };
}
