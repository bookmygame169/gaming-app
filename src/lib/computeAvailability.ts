import { CONSOLE_DB_KEYS, type ConsoleId } from "@/lib/constants";
import { getOccupiedUnitCountForConsole } from "@/lib/ownerStationAssignments";
import { timeStringToMinutes, minutesToTimeString, doTimeSlotsOverlap } from "@/lib/timeUtils";
import type { ConsoleAvailability } from "@/types/booking";

export type OccupancyBooking = {
  start_time?: string | null;
  duration?: number | null;
  booking_items?: Array<{
    console?: string | null;
    quantity?: number | null;
  }> | null;
};

export function computeConsoleAvailability(options: {
  selectedTime: string;
  selectedDuration: number;
  consoleLimits: Partial<Record<ConsoleId, number>>;
  bookings: OccupancyBooking[];
}): Partial<Record<ConsoleId, ConsoleAvailability>> {
  const { selectedTime, selectedDuration, consoleLimits, bookings } = options;
  const selectedTimeMinutes = timeStringToMinutes(selectedTime);
  const consoleIds = Object.keys(consoleLimits) as ConsoleId[];

  const availability: Partial<Record<ConsoleId, ConsoleAvailability>> = {};
  const overlapping: Partial<Record<ConsoleId, { endMinutes: number }[]>> = {};

  for (const consoleId of consoleIds) {
    const total = consoleLimits[consoleId] || 0;
    availability[consoleId] = {
      total,
      booked: 0,
      available: total,
      nextAvailableAt: null,
    };
  }

  for (const booking of bookings) {
    const bookingStartMinutes = timeStringToMinutes(booking.start_time || "");
    const bookingDuration = booking.duration || 60;
    const bookingEndMinutes = bookingStartMinutes + bookingDuration;

    if (!doTimeSlotsOverlap(selectedTimeMinutes, bookingStartMinutes, selectedDuration)) {
      continue;
    }

    for (const item of booking.booking_items ?? []) {
      const consoleId = item.console as ConsoleId;
      const slot = availability[consoleId];
      if (!slot) continue;

      const unitsTaken = getOccupiedUnitCountForConsole(consoleId, item.quantity);
      slot.booked += unitsTaken;
      slot.available = Math.max(0, slot.total - slot.booked);

      if (!overlapping[consoleId]) overlapping[consoleId] = [];
      overlapping[consoleId]!.push({ endMinutes: bookingEndMinutes });
    }
  }

  for (const consoleId of consoleIds) {
    const slot = availability[consoleId];
    if (!slot || slot.available >= slot.total) continue;

    const ends = overlapping[consoleId] || [];
    if (ends.length === 0) continue;

    const earliest = [...ends].sort((a, b) => a.endMinutes - b.endMinutes)[0];
    slot.nextAvailableAt = minutesToTimeString(earliest.endMinutes);
  }

  return availability;
}

export function consoleLimitsFromCafe(
  cafe: Record<string, unknown> | null | undefined
): Partial<Record<ConsoleId, number>> {
  const limits: Partial<Record<ConsoleId, number>> = {};
  if (!cafe) return limits;

  (Object.keys(CONSOLE_DB_KEYS) as ConsoleId[]).forEach((consoleId) => {
    const count = Number(cafe[CONSOLE_DB_KEYS[consoleId]] || 0);
    if (count > 0) limits[consoleId] = count;
  });

  return limits;
}
