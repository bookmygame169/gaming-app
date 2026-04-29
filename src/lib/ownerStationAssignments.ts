import type { SupabaseClient } from "@supabase/supabase-js";

type CafeConsoleCounts = {
  ps5_count?: number | null;
  ps4_count?: number | null;
  xbox_count?: number | null;
  pc_count?: number | null;
  pool_count?: number | null;
  snooker_count?: number | null;
  arcade_count?: number | null;
  vr_count?: number | null;
  steering_wheel_count?: number | null;
  racing_sim_count?: number | null;
};

type StationPricingRecord = {
  station_name?: string | null;
  station_type?: string | null;
  station_number?: number | null;
  is_active?: boolean | null;
};

type ExistingBookingItem = {
  console?: string | null;
  quantity?: number | null;
  title?: string | null;
};

type ExistingBookingRow = {
  id?: string | null;
  booking_items?: ExistingBookingItem[] | null;
  duration?: number | null;
  start_time?: string | null;
  status?: string | null;
};

type ExistingSubscriptionRow = {
  assigned_console_station?: string | null;
};

const CONTROLLER_BASED_CONSOLES = new Set(["ps5", "ps4", "xbox"]);

const CONSOLE_COUNT_FIELDS: Record<string, keyof CafeConsoleCounts> = {
  ps5: "ps5_count",
  ps4: "ps4_count",
  xbox: "xbox_count",
  pc: "pc_count",
  pool: "pool_count",
  snooker: "snooker_count",
  arcade: "arcade_count",
  vr: "vr_count",
  steering: "steering_wheel_count",
  racing_sim: "racing_sim_count",
};

function normaliseConsoleType(raw: string | null | undefined): string {
  if (!raw) return "";

  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");

  if (normalized === "steering_wheel") return "steering";
  return normalized;
}

function normaliseStationName(raw: string | null | undefined): string {
  return raw?.trim().toLowerCase() || "";
}

function getIndiaDateString(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Failed to format India date");
  }

  return `${year}-${month}-${day}`;
}

function parseStartMinutes(startTime?: string | null): number | null {
  const match = startTime?.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (!match) return null;

  let hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const period = match[3]?.toLowerCase();

  if (period === "pm" && hours !== 12) hours += 12;
  else if (period === "am" && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

function getExistingBookingDuration(booking: ExistingBookingRow): number {
  const itemDuration = (booking.booking_items || []).reduce((max, item) => {
    const duration = getItemDurationFromPayload(item);
    return Math.max(max, duration);
  }, 0);

  return itemDuration || booking.duration || 60;
}

function overlapsRequestedWindow(
  booking: ExistingBookingRow,
  requestedStartTime?: string | null,
  requestedDuration?: number | null
): boolean {
  const requestedStart = parseStartMinutes(requestedStartTime);
  const requestedLength = Number(requestedDuration || 0);
  if (requestedStart === null || requestedLength <= 0) return true;

  const existingStart = parseStartMinutes(booking.start_time);
  const existingDuration = getExistingBookingDuration(booking);
  if (existingStart === null || existingDuration <= 0) return true;

  const requestedEnd = requestedStart + requestedLength;
  const existingEnd = existingStart + existingDuration;
  return requestedStart < existingEnd && existingStart < requestedEnd;
}

function getGeneratedStationNames(cafe: CafeConsoleCounts, consoleType: string): string[] {
  const countField = CONSOLE_COUNT_FIELDS[consoleType];
  const count = countField ? Number(cafe[countField] || 0) : 0;
  return Array.from({ length: count }, (_, index) => `${consoleType}-${String(index + 1).padStart(2, "0")}`);
}

function getStationRowsForConsole(rows: StationPricingRecord[], consoleType: string): StationPricingRecord[] {
  return rows.filter((row) => {
    const stationName = normaliseStationName(row.station_name);
    const stationType = normaliseConsoleType(row.station_type || stationName.split("-")[0] || "");
    return stationType === consoleType;
  });
}

function getAvailableStationsForConsole(
  cafe: CafeConsoleCounts,
  rows: StationPricingRecord[],
  consoleType: string
): string[] {
  const stationRows = getStationRowsForConsole(rows, consoleType);
  const configured = [...stationRows]
    .filter((row) => row.is_active !== false && row.station_name)
    .sort((a, b) => {
      const aNumber = a.station_number ?? Number.MAX_SAFE_INTEGER;
      const bNumber = b.station_number ?? Number.MAX_SAFE_INTEGER;
      if (aNumber !== bNumber) return aNumber - bNumber;
      return normaliseStationName(a.station_name).localeCompare(normaliseStationName(b.station_name));
    })
    .map((row) => normaliseStationName(row.station_name))
    .filter(Boolean);

  const inactive = new Set(
    stationRows
      .filter((row) => row.is_active === false)
      .map((row) => normaliseStationName(row.station_name))
      .filter(Boolean)
  );

  const generated = getGeneratedStationNames(cafe, consoleType).filter((name) => !inactive.has(name));
  return Array.from(new Set([...configured, ...generated]));
}

export function parseAssignedStationsFromTitle(title: string | null | undefined): string[] {
  const raw = title?.split("|")[1]?.trim();
  if (!raw) return [];

  return raw
    .split(",")
    .map((stationName) => normaliseStationName(stationName))
    .filter(Boolean);
}

export function getOccupiedUnitCountForConsole(consoleType: string, quantity: number | null | undefined): number {
  const normalizedConsoleType = normaliseConsoleType(consoleType);
  if (CONTROLLER_BASED_CONSOLES.has(normalizedConsoleType)) {
    return 1;
  }

  return Math.max(1, Number(quantity || 1));
}

export function getItemDurationFromPayload(item: { duration?: number | null; title?: string | null }): number {
  if (typeof item.duration === "number" && item.duration > 0) {
    return item.duration;
  }

  const parsedDuration = parseInt(item.title || "", 10);
  return Number.isNaN(parsedDuration) || parsedDuration <= 0 ? 60 : parsedDuration;
}

export function encodeAssignedStationsTitle(duration: number, assignedStations: string[]): string {
  const normalizedStations = assignedStations.map((stationName) => normaliseStationName(stationName)).filter(Boolean);
  return normalizedStations.length > 0
    ? `${duration}|${normalizedStations.join(",")}`
    : String(duration || 60);
}

export type StationReservationState = {
  availableStationsByConsole: Record<string, string[]>;
  occupiedStations: Set<string>;
};

export async function loadStationReservationState(
  supabase: SupabaseClient,
  cafeId: string,
  bookingDate: string = getIndiaDateString(),
  requestedStartTime?: string | null,
  requestedDuration?: number | null,
  excludeBookingId?: string | null
): Promise<StationReservationState> {
  let bookingsQuery = supabase
    .from("bookings")
    .select("id, start_time, duration, status, booking_items(console, quantity, title)")
    .eq("cafe_id", cafeId)
    .eq("booking_date", bookingDate)
    .in("status", ["in-progress", "confirmed"]);

  if (excludeBookingId) {
    bookingsQuery = bookingsQuery.neq("id", excludeBookingId);
  }

  const [{ data: cafe, error: cafeError }, { data: stationPricing, error: stationPricingError }, { data: bookings, error: bookingsError }, { data: subscriptions, error: subscriptionsError }] =
    await Promise.all([
      supabase
        .from("cafes")
        .select("ps5_count, ps4_count, xbox_count, pc_count, pool_count, snooker_count, arcade_count, vr_count, steering_wheel_count, racing_sim_count")
        .eq("id", cafeId)
        .maybeSingle(),
      supabase
        .from("station_pricing")
        .select("station_name, station_type, station_number, is_active")
        .eq("cafe_id", cafeId),
      bookingsQuery,
      supabase
        .from("subscriptions")
        .select("assigned_console_station")
        .eq("cafe_id", cafeId)
        .eq("timer_active", true),
    ]);

  if (cafeError) throw new Error(cafeError.message);
  if (stationPricingError) throw new Error(stationPricingError.message);
  if (bookingsError) throw new Error(bookingsError.message);
  if (subscriptionsError) throw new Error(subscriptionsError.message);
  if (!cafe) throw new Error("Cafe not found");

  const stationRows = (stationPricing || []) as StationPricingRecord[];
  const availableStationsByConsole: Record<string, string[]> = {};

  Object.keys(CONSOLE_COUNT_FIELDS).forEach((consoleType) => {
    const stations = getAvailableStationsForConsole(cafe as CafeConsoleCounts, stationRows, consoleType);
    if (stations.length > 0) {
      availableStationsByConsole[consoleType] = stations;
    }
  });

  const occupiedStations = new Set<string>();
  const unassignedNeeds: Array<{ consoleType: string; unitCount: number }> = [];

  ((subscriptions || []) as ExistingSubscriptionRow[]).forEach((subscription) => {
    const stationName = normaliseStationName(subscription.assigned_console_station);
    if (stationName) {
      occupiedStations.add(stationName);
    }
  });

  ((bookings || []) as ExistingBookingRow[])
    .filter((booking) => overlapsRequestedWindow(booking, requestedStartTime, requestedDuration))
    .forEach((booking) => {
      (booking.booking_items || []).forEach((item) => {
        const consoleType = normaliseConsoleType(item.console);
        if (!consoleType) return;

        const assignedStations = parseAssignedStationsFromTitle(item.title);
        if (assignedStations.length > 0) {
          assignedStations.forEach((stationName) => occupiedStations.add(stationName));
          return;
        }

        unassignedNeeds.push({
          consoleType,
          unitCount: getOccupiedUnitCountForConsole(consoleType, item.quantity),
        });
      });
    });

  unassignedNeeds.forEach(({ consoleType, unitCount }) => {
    const freeStations = (availableStationsByConsole[consoleType] || []).filter((stationName) => !occupiedStations.has(stationName));
    freeStations.slice(0, unitCount).forEach((stationName) => occupiedStations.add(stationName));
  });

  return { availableStationsByConsole, occupiedStations };
}

export function reserveStations(
  state: StationReservationState,
  consoleType: string,
  quantity: number | null | undefined,
  requestedStations: string[] = []
): string[] {
  const normalizedConsoleType = normaliseConsoleType(consoleType);
  const availableStations = state.availableStationsByConsole[normalizedConsoleType] || [];
  const requiredUnits = getOccupiedUnitCountForConsole(normalizedConsoleType, quantity);
  const requested = requestedStations.map((stationName) => normaliseStationName(stationName)).filter(Boolean);

  if (requiredUnits <= 0) {
    throw new Error("Booking must reserve at least one station");
  }

  if (availableStations.length === 0) {
    throw new Error(`No ${normalizedConsoleType.toUpperCase()} stations are configured`);
  }

  if (requested.length > 0) {
    if (requested.length !== requiredUnits) {
      throw new Error(
        requiredUnits === 1
          ? `This ${normalizedConsoleType.toUpperCase()} session must use exactly one station`
          : `This ${normalizedConsoleType.toUpperCase()} booking needs ${requiredUnits} stations. Split it into separate rows or leave Station as Any.`
      );
    }

    requested.forEach((stationName) => {
      if (!availableStations.includes(stationName)) {
        throw new Error(`${stationName.toUpperCase()} is not available for ${normalizedConsoleType.toUpperCase()}`);
      }
      if (state.occupiedStations.has(stationName)) {
        throw new Error(`${stationName.toUpperCase()} is already occupied`);
      }
    });

    requested.forEach((stationName) => state.occupiedStations.add(stationName));
    return requested;
  }

  const freeStations = availableStations.filter((stationName) => !state.occupiedStations.has(stationName));
  if (freeStations.length < requiredUnits) {
    throw new Error(`All ${normalizedConsoleType.toUpperCase()} stations are occupied for this time`);
  }

  const assignedStations = freeStations.slice(0, requiredUnits);
  assignedStations.forEach((stationName) => state.occupiedStations.add(stationName));
  return assignedStations;
}
