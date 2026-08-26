import type { SupabaseClient } from "@supabase/supabase-js";
import { parseBookingStartIst } from "@/lib/sessionPolicy";

export type BookingInstantFields = {
  starts_at: string;
  ends_at: string;
};

export function bookingInstantFields(
  bookingDate?: string | null,
  startTime?: string | null,
  durationMinutes?: number | null
): BookingInstantFields | null {
  if (!bookingDate || !startTime) return null;

  const start = parseBookingStartIst(bookingDate, startTime);
  if (!start) return null;

  const minutes = durationMinutes && durationMinutes > 0 ? durationMinutes : 60;
  return {
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + minutes * 60_000).toISOString(),
  };
}

export function withBookingInstants<T extends Record<string, unknown>>(
  row: T,
  bookingDate?: string | null,
  startTime?: string | null,
  durationMinutes?: number | null
): T & Partial<BookingInstantFields> {
  const instants = bookingInstantFields(bookingDate, startTime, durationMinutes);
  return instants ? { ...row, ...instants } : row;
}

export function isMissingInstantColumnError(message?: string | null): boolean {
  const text = message?.toLowerCase() || "";
  return (text.includes("starts_at") || text.includes("ends_at")) && (
    text.includes("does not exist") || text.includes("schema cache") || text.includes("42703")
  );
}

/**
 * Writes a booking and fills starts_at / ends_at when the columns exist.
 * Falls back to the original row if the migration has not been applied yet.
 */
export async function insertBooking<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  row: T,
  select = "id"
): Promise<{ data: (T & { id: string }) | null; error: { message: string; code?: string } | null }> {
  const payload = withBookingInstants(
    row,
    typeof row.booking_date === "string" ? row.booking_date : null,
    typeof row.start_time === "string" ? row.start_time : null,
    typeof row.duration === "number" ? row.duration : Number(row.duration) || null
  );

  const first = await supabase.from("bookings").insert(payload).select(select).single();
  if (!first.error || !isMissingInstantColumnError(first.error.message)) {
    return {
      data: (first.data as (T & { id: string }) | null) ?? null,
      error: first.error,
    };
  }

  const fallback = await supabase.from("bookings").insert(row).select(select).single();
  return {
    data: (fallback.data as (T & { id: string }) | null) ?? null,
    error: fallback.error,
  };
}
