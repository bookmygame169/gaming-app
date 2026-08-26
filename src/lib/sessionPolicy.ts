import { parseTimeToMinutes } from "@/lib/timeUtils";

/**
 * Whether a physical machine should be locked or unlocked for a booking.
 *
 * This is the only place that rule lives. stationSync, owner unlock, and
 * anything added later must call it rather than re-deriving remaining time.
 */

const CLOSED_STATUSES = new Set(["cancelled", "completed", "pending"]);

export type StationSessionDecision =
  | { action: "lock"; reason: string }
  | { action: "unlock"; remainingSeconds: number; reason: string }
  | { action: "noop"; reason: string };

export type StationSessionInput = {
  sessionId: string;
  forceLock?: boolean;
  deletedAt?: string | null;
  status?: string | null;
  bookingDate?: string | null;
  startTime?: string | null;
  durationMinutes: number;
  now?: Date;
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
};

/**
 * Turns a booking date + 12-hour start time into an IST instant.
 *
 * Both are stored as India local time with no offset. Inferring the zone on
 * Vercel (UTC) would shift sessions by 5.5 hours.
 */
export function parseBookingStartIst(
  bookingDate: string,
  startTime: string
): Date | null {
  const minutes = parseTimeToMinutes(startTime);
  if (minutes === null) return null;

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const iso = `${bookingDate}T${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:00+05:30`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function decideStationSession(input: StationSessionInput): StationSessionDecision {
  const now = (input.now ?? new Date()).getTime();
  const status = (input.status || "").toLowerCase();

  if (input.forceLock) {
    return { action: "lock", reason: "force_lock" };
  }

  if (input.deletedAt) {
    return { action: "lock", reason: "deleted" };
  }

  if (CLOSED_STATUSES.has(status)) {
    return { action: "lock", reason: `status:${status}` };
  }

  const start = resolveStart(input);
  const end = resolveEnd(input, start);

  if (!start) {
    if (!input.bookingDate || !input.startTime) {
      return { action: "noop", reason: "missing_start" };
    }
    return { action: "noop", reason: "unreadable_start" };
  }

  if (start.getTime() > now) {
    return { action: "lock", reason: "not_started" };
  }

  const sessionEnd =
    end ??
    new Date(
      start.getTime() + (input.durationMinutes > 0 ? input.durationMinutes : 60) * 60_000
    );
  const remainingSeconds = Math.floor((sessionEnd.getTime() - now) / 1000);

  if (remainingSeconds <= 0) {
    return { action: "lock", reason: "ended" };
  }

  return {
    action: "unlock",
    remainingSeconds,
    reason: "in_session",
  };
}

export function sessionDurationMinutes(parts: Array<number | null | undefined>): number {
  const values = parts.map((value) => Number(value) || 0);
  return Math.max(0, ...values) || 60;
}

function parseInstant(value?: string | Date | null): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveStart(input: StationSessionInput): Date | null {
  const fromColumn = parseInstant(input.startsAt);
  if (fromColumn) return fromColumn;
  if (!input.bookingDate || !input.startTime) return null;
  return parseBookingStartIst(input.bookingDate, input.startTime);
}

function resolveEnd(input: StationSessionInput, start: Date | null): Date | null {
  const fromColumn = parseInstant(input.endsAt);
  const minutes = input.durationMinutes > 0 ? input.durationMinutes : 60;
  const fromDuration = start ? new Date(start.getTime() + minutes * 60_000) : null;

  // Item duration can be longer than a stale header `ends_at` (written before
  // the lines existed). Ending early kicks a paid session off the PC.
  // Staff shortening a booking must also shrink duration / items.
  if (fromColumn && fromDuration) {
    return fromColumn.getTime() >= fromDuration.getTime() ? fromColumn : fromDuration;
  }
  return fromColumn ?? fromDuration;
}
