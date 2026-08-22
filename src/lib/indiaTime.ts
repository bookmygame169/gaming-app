/**
 * India Standard Time helpers.
 *
 * Booking dates, owner dashboards, reports, and station sessions all store
 * calendar days as IST with no offset. These used to be copied into five
 * modules; a sixth copy is how "today" drifted between screens.
 */

const IST = "Asia/Kolkata";

export function getIndiaDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getIndiaCurrentMinutes(date: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: IST,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const hours = Number(parts.find((part) => part.type === "hour")?.value || "0");
  const minutes = Number(parts.find((part) => part.type === "minute")?.value || "0");
  return hours * 60 + minutes;
}

/**
 * Calendar day in IST that is `daysAgo` UTC-noon days behind now.
 *
 * Noon UTC is used so subtracting days does not land on the previous IST date
 * around midnight in India.
 */
export function getIndiaDateDaysAgo(daysAgo: number, from: Date = new Date()): string {
  const date = new Date(from.getTime());
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return getIndiaDateString(date);
}

export function getIndiaDateTimeParts(date: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
  }).formatToParts(date);

  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  const year = value("year");
  const month = value("month");
  const day = value("day");
  const hour = value("hour");
  const minute = value("minute");

  if (!year || !month || !day || !hour || !minute) {
    throw new Error("Failed to format India date/time");
  }

  return {
    year,
    month,
    day,
    hour: Number(hour),
    minute: Number(minute),
  };
}
