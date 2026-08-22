import { ConsoleId } from "@/lib/constants";
import { ConsoleAvailability } from "@/types/booking";
import { logger } from "@/lib/logger";

export async function fetchLiveAvailability(options: {
  cafeId: string;
  selectedDate: string;
  selectedTime: string;
  selectedDuration: number;
  availableConsoles: ConsoleId[];
  consoleLimits: Partial<Record<ConsoleId, number>>;
}): Promise<Partial<Record<ConsoleId, ConsoleAvailability>>> {
  const { cafeId, selectedDate, selectedTime, selectedDuration } = options;

  if (!cafeId || !selectedDate || !selectedTime) {
    return {};
  }

  try {
    const params = new URLSearchParams({
      date: selectedDate,
      time: selectedTime,
      duration: String(selectedDuration || 60),
    });

    const res = await fetch(
      `/api/cafes/${encodeURIComponent(cafeId)}/availability?${params.toString()}`
    );

    if (!res.ok) {
      logger.error("Error fetching availability:", res.status);
      return {};
    }

    const body = await res.json();
    return (body?.availability || {}) as Partial<Record<ConsoleId, ConsoleAvailability>>;
  } catch (err) {
    logger.error("Error fetching availability:", err);
    return {};
  }
}
