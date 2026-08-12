// src/lib/capacityValidator.ts
/**
 * Server-side capacity validation for booking requests
 * Ensures bookings don't exceed cafe console capacity, accounting for overlapping time slots
 */

import { supabase } from "@/lib/supabaseClient";
import { ConsoleId, CONSOLE_DB_KEYS, CONSOLE_LABELS } from "@/lib/constants";
import { SelectedTicketForCheck } from "@/types/booking";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { BookingWithNestedItems, BookingItemRow } from "@/types/database";
import { timeStringToMinutes, doTimeSlotsOverlap } from "@/lib/timeUtils";
import { logger } from "@/lib/logger";

/**
 * Check if booking capacity is available for requested consoles
 * Validates against cafe capacity and existing bookings with overlapping time slots
 * @param options Booking parameters to validate
 * @returns Result with success status and optional error message
 */
export async function checkBookingCapacityWithOverlap(options: {
  cafeId: string;
  bookingDate: string;
  timeSlot: string;
  tickets: SelectedTicketForCheck[];
  durationMinutes: number;
}): Promise<{ ok: boolean; message?: string }> {
  const { cafeId, bookingDate, timeSlot, tickets, durationMinutes } = options;

  // Aggregate requested quantities per console
  const requested: Partial<Record<ConsoleId, number>> = {};
  for (const t of tickets) {
    if (!t.console || t.quantity <= 0) continue;
    requested[t.console] = (requested[t.console] ?? 0) + t.quantity;
  }
  if (Object.keys(requested).length === 0) {
    return { ok: false, message: "No tickets selected." };
  }

  // Check if cafeId is a UUID or slug
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cafeId);

  // Fetch cafe console capacities
  const { data: cafeRow, error: cafeError } = await supabase
    .from("cafes")
    .select(
      "id, ps5_count, ps4_count, xbox_count, pc_count, pool_count, arcade_count, snooker_count, vr_count, steering_wheel_count, racing_sim_count"
    )
    .eq(isUUID ? "id" : "slug", cafeId)
    .maybeSingle();

  if (cafeError || !cafeRow) {
    logger.error("Capacity check: error loading cafe", cafeError);
    return { ok: false, message: "Could not check availability. Please try again." };
  }

  // Map console IDs to their capacities
  const capacities: Partial<Record<ConsoleId, number>> = {};
  (Object.keys(CONSOLE_DB_KEYS) as ConsoleId[]).forEach((consoleId) => {
    const dbKey = CONSOLE_DB_KEYS[consoleId];
    capacities[consoleId] = (cafeRow[dbKey as keyof typeof cafeRow] as number) ?? 0;
  });

  const selectedTimeMinutes = timeStringToMinutes(timeSlot);

  // Fetch existing bookings for the date
  const { data: bookings, error: bookingsError } = await supabase
    .from("bookings")
    .select(
      `
      id,
      start_time,
      booking_items (
        console,
        quantity
      )
    `
    )
    .eq("cafe_id", cafeRow.id)
    .eq("booking_date", bookingDate)
    .neq("status", "cancelled");

  if (bookingsError) {
    logger.error("Capacity check: error loading bookings", bookingsError);
    return { ok: false, message: "Could not check availability. Please try again." };
  }

  // Calculate already booked quantities for overlapping time slots
  const alreadyBooked: Partial<Record<ConsoleId, number>> = {};

  (bookings ?? []).forEach((booking: BookingWithNestedItems) => {
    const bookingStartMinutes = timeStringToMinutes(booking.start_time || "");

    if (doTimeSlotsOverlap(selectedTimeMinutes, bookingStartMinutes, durationMinutes)) {
      (booking.booking_items ?? []).forEach((item) => {
        const consoleId = item.console as ConsoleId;
        if (!consoleId) return;
        // Each booking_item represents 1 console unit (quantity = controllers, not units)
        alreadyBooked[consoleId] = (alreadyBooked[consoleId] ?? 0) + 1;
      });
    }
  });

  // Validate each requested console doesn't exceed remaining capacity
  for (const [consoleIdStr, qtyRequested] of Object.entries(requested)) {
    const consoleId = consoleIdStr as ConsoleId;
    const capacity = capacities[consoleId] ?? 0;
    const used = alreadyBooked[consoleId] ?? 0;
    const remaining = capacity - used;

    if ((qtyRequested ?? 0) > remaining) {
      return {
        ok: false,
        message:
          remaining > 0
            ? `Only ${remaining} ${CONSOLE_LABELS[consoleId]} setup(s) available for this time slot. Another booking overlaps with your selected time.`
            : `No ${CONSOLE_LABELS[consoleId]} setups available. All are booked for overlapping time slots.`,
      };
    }
  }

  return { ok: true };
}

/**
 * Client-side validation for ticket selection
 * Quick validation before submitting to server
 * @param tickets Selected tickets to validate
 * @returns Result with success status and optional error message
 */
export function validateTicketSelection(tickets: SelectedTicketForCheck[]): { ok: boolean; message?: string } {
  if (!tickets || tickets.length === 0) {
    return { ok: false, message: "Please select at least one ticket." };
  }

  const hasValidTicket = tickets.some((t) => t.quantity > 0);
  if (!hasValidTicket) {
    return { ok: false, message: "Please select at least one ticket with quantity greater than 0." };
  }

  return { ok: true };
}
