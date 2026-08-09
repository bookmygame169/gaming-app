// src/lib/availabilityService.ts
/**
 * Live availability calculation for booking system
 * Computes real-time console availability based on existing bookings
 */

import { supabase } from "@/lib/supabaseClient";
import { ConsoleId } from "@/lib/constants";
import { ConsoleAvailability } from "@/types/booking";
import { BookingWithNestedItems } from "@/types/database";
import { timeStringToMinutes, minutesToTimeString, doTimeSlotsOverlap } from "@/lib/timeSlotUtils";
import { getOccupiedUnitCountForConsole } from "@/lib/ownerStationAssignments";
import { logger } from "@/lib/logger";

/**
 * Fetch and compute live availability for all consoles at a specific date/time
 * @param options Parameters for availability check
 * @returns Availability map for each console type
 */
export async function fetchLiveAvailability(options: {
  cafeId: string;
  selectedDate: string;
  selectedTime: string;
  selectedDuration: number;
  availableConsoles: ConsoleId[];
  consoleLimits: Partial<Record<ConsoleId, number>>;
}): Promise<Partial<Record<ConsoleId, ConsoleAvailability>>> {
  const { cafeId, selectedDate, selectedTime, selectedDuration, availableConsoles, consoleLimits } = options;

  if (!cafeId || !selectedDate || !selectedTime) {
    return {};
  }

  try {
    const selectedTimeMinutes = timeStringToMinutes(selectedTime);

    // Fetch all active bookings for this cafe and date
    const { data: bookings, error: bookingsError } = await supabase
      .from("bookings")
      .select(
        `
        id,
        start_time,
        duration,
        booking_items (
          console,
          quantity
        )
      `
      )
      .eq("cafe_id", cafeId)
      .eq("booking_date", selectedDate)
      .neq("status", "cancelled");

    if (bookingsError) {
      logger.error("Error fetching bookings:", bookingsError);
      return {};
    }

    // Initialize availability for all consoles
    const availability: Partial<Record<ConsoleId, ConsoleAvailability>> = {};
    availableConsoles.forEach((consoleId) => {
      availability[consoleId] = {
        total: consoleLimits[consoleId] || 0,
        booked: 0,
        available: consoleLimits[consoleId] || 0,
        nextAvailableAt: null,
      };
    });

    // Track overlapping bookings per console for "next available" calculation
    const overlappingBookingsPerConsole: Partial<
      Record<ConsoleId, { endMinutes: number; quantity: number }[]>
    > = {};

    // Process each booking and check for overlap
    (bookings ?? []).forEach((booking: BookingWithNestedItems & { duration?: number }) => {
      const bookingStartMinutes = timeStringToMinutes(booking.start_time || "");
      const bookingDuration = booking.duration || 60; // Default to 60 if not specified
      const bookingEndMinutes = bookingStartMinutes + bookingDuration;

      // Check if this booking overlaps with the selected time slot
      if (doTimeSlotsOverlap(selectedTimeMinutes, bookingStartMinutes, selectedDuration)) {
        (booking.booking_items ?? []).forEach((item) => {
          const consoleId = item.console as ConsoleId;
          if (consoleId && availability[consoleId]) {
            // How many physical machines this line actually occupies. Not one
            // per line: a PC booked with quantity 2 takes two PCs, while a PS5
            // with 2 controllers is still a single console. Counting one per
            // line showed a station free while someone was sitting at it.
            const unitsTaken = getOccupiedUnitCountForConsole(consoleId, item.quantity);

            availability[consoleId]!.booked += unitsTaken;
            availability[consoleId]!.available = Math.max(
              0,
              availability[consoleId]!.total - availability[consoleId]!.booked
            );

            // Track for "next available" calculation
            if (!overlappingBookingsPerConsole[consoleId]) {
              overlappingBookingsPerConsole[consoleId] = [];
            }
            overlappingBookingsPerConsole[consoleId]!.push({
              endMinutes: bookingEndMinutes,
              quantity: unitsTaken,
            });
          }
        });
      }
    });

    // Calculate "next available" time for partially or fully booked consoles
    availableConsoles.forEach((consoleId) => {
      const consoleData = availability[consoleId];
      if (!consoleData) return;

      // Only calculate if console has some bookings
      if (consoleData.available === 0 || consoleData.available < consoleData.total) {
        const overlappingBookings = overlappingBookingsPerConsole[consoleId] || [];

        if (overlappingBookings.length > 0) {
          // Find the earliest end time among overlapping bookings
          const sortedByEndTime = [...overlappingBookings].sort(
            (a, b) => a.endMinutes - b.endMinutes
          );
          const earliestEndMinutes = sortedByEndTime[0].endMinutes;
          availability[consoleId]!.nextAvailableAt = minutesToTimeString(earliestEndMinutes);
        }
      }
    });

    return availability;
  } catch (err) {
    logger.error("Error fetching availability:", err);
    return {};
  }
}
