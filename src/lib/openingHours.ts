// src/lib/openingHours.ts
/**
 * Reads a café's opening hours out of the free-text field the owner settings
 * page writes ("Mon-Sun: 10:00 AM - 11:00 PM").
 *
 * It is text rather than two time columns, so this parser is deliberately
 * forgiving and returns null on anything it does not recognise. Callers fall
 * back to a default window in that case: refusing to show any slot because a
 * café typed its hours oddly would lose the booking outright.
 */

export type OpeningWindow = {
  /** Minutes from midnight. */
  openMinutes: number;
  /**
   * Minutes from midnight, and greater than 24h when the café closes after
   * midnight — a 2 AM close is 1560, not 120. Callers comparing "is this slot
   * inside opening hours" need the unwrapped value or every late-night slot
   * looks like it falls before opening.
   */
  closeMinutes: number;
  /** True when closing time is past midnight. */
  overnight: boolean;
};

const TIME_PATTERN = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi;

const MINUTES_PER_DAY = 24 * 60;

function toMinutes(hour: number, minute: number, period: string | undefined): number | null {
  if (minute > 59) return null;

  let hours = hour;

  if (period) {
    if (hours < 1 || hours > 12) return null;
    if (period.toLowerCase() === "pm" && hours !== 12) hours += 12;
    else if (period.toLowerCase() === "am" && hours === 12) hours = 0;
  } else if (hours > 23) {
    return null;
  }

  return hours * 60 + minute;
}

export function parseOpeningHours(raw: string | null | undefined): OpeningWindow | null {
  if (!raw) return null;

  // Drop the day part ("Mon-Sun:") so its digits are not mistaken for a time.
  // Only when what precedes the colon is actually words: splitting on the first
  // colon unconditionally turns "10:00 - 23:00" into "00 - 23:00", and the café
  // opens at midnight.
  const colonIndex = raw.indexOf(":");
  const timePart =
    colonIndex > 0 && /[a-z]/i.test(raw.slice(0, colonIndex)) ? raw.slice(colonIndex + 1) : raw;

  const matches = [...timePart.matchAll(TIME_PATTERN)];
  if (matches.length < 2) return null;

  const open = toMinutes(Number(matches[0][1]), Number(matches[0][2] ?? 0), matches[0][3]);
  const close = toMinutes(Number(matches[1][1]), Number(matches[1][2] ?? 0), matches[1][3]);

  if (open === null || close === null) return null;

  // Equal times are treated as 24 hours rather than a zero-length day, which
  // is how "10:00 AM - 10:00 AM" is meant.
  const overnight = close <= open;

  return {
    openMinutes: open,
    closeMinutes: overnight ? close + MINUTES_PER_DAY : close,
    overnight,
  };
}

/** The window to use when a café's hours cannot be read. */
export const DEFAULT_OPENING_WINDOW: OpeningWindow = {
  openMinutes: 10 * 60,
  closeMinutes: 23 * 60,
  overnight: false,
};

export function getOpeningWindow(raw: string | null | undefined): OpeningWindow {
  return parseOpeningHours(raw) ?? DEFAULT_OPENING_WINDOW;
}

/**
 * Whether a session starting at `startMinutes` and running `duration` fits
 * inside the café's hours.
 *
 * A start time before opening is also checked against the previous night's
 * window, so 1 AM on a café that closes at 2 AM is inside hours rather than
 * eight hours before it opens.
 */
export function sessionFitsOpeningHours(
  window: OpeningWindow,
  startMinutes: number,
  durationMinutes: number
): boolean {
  const candidates = [startMinutes];
  if (window.overnight && startMinutes < window.openMinutes) {
    candidates.push(startMinutes + MINUTES_PER_DAY);
  }

  return candidates.some(
    (start) => start >= window.openMinutes && start + durationMinutes <= window.closeMinutes
  );
}
