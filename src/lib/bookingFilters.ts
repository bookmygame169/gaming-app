type BookingLike = {
  booking_items?: unknown[] | null;
  booking_orders?: unknown[] | null;
  payment_mode?: string | null;
};

type BookingItemLike = {
  title?: string | null;
};

type RealtimeBookingLike = BookingLike & {
  booking_date?: string | null;
  booking_items?: BookingItemLike[] | null;
  duration?: number | null;
  id?: string | null;
  start_time?: string | null;
  status?: string | null;
};

export function isOwnerUseBooking(booking: BookingLike | null | undefined): boolean {
  return (booking?.payment_mode || "").toLowerCase() === "owner";
}

export function isSnackOnlyOrderBooking(booking: BookingLike | null | undefined): boolean {
  const bookingItemCount = Array.isArray(booking?.booking_items) ? booking.booking_items.length : 0;
  const bookingOrderCount = Array.isArray(booking?.booking_orders) ? booking.booking_orders.length : 0;
  return bookingOrderCount > 0 && bookingItemCount === 0;
}

export function isSessionBooking(booking: BookingLike | null | undefined): boolean {
  if (!booking) return false;
  if (isOwnerUseBooking(booking)) return false;
  if (isSnackOnlyOrderBooking(booking)) return false;
  return true;
}

function getIndiaDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getIndiaCurrentMinutes(date: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const hours = Number(parts.find((part) => part.type === "hour")?.value || "0");
  const minutes = Number(parts.find((part) => part.type === "minute")?.value || "0");
  return hours * 60 + minutes;
}

function parseStartMinutes(startTime?: string | null): number | null {
  if (!startTime) return null;

  const timeParts = startTime.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (!timeParts) return null;

  let hours = parseInt(timeParts[1], 10);
  const minutes = parseInt(timeParts[2], 10);
  const period = timeParts[3]?.toLowerCase();

  if (period === "pm" && hours !== 12) hours += 12;
  else if (period === "am" && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

function getBookingDurationMinutes(booking: RealtimeBookingLike): number {
  const titleDuration = booking.booking_items?.[0]?.title?.split("|")[0] || "";
  const parsedDuration = parseInt(titleDuration, 10);
  if (!Number.isNaN(parsedDuration) && parsedDuration > 0) {
    return parsedDuration;
  }
  return booking.duration || 60;
}

export function getRealtimeBookingStatus(booking: RealtimeBookingLike, now: Date = new Date()): string | null | undefined {
  const status = booking.status?.toLowerCase();
  if (status !== "in-progress" && status !== "confirmed") {
    return booking.status;
  }

  const bookingDate = booking.booking_date;
  if (!bookingDate) return booking.status;

  const todayStr = getIndiaDateString(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = getIndiaDateString(yesterday);

  if (bookingDate < yesterdayStr) return "completed";

  const startMinutes = parseStartMinutes(booking.start_time);
  const duration = getBookingDurationMinutes(booking);

  if (bookingDate === todayStr) {
    if (startMinutes === null || duration <= 0) return booking.status;
    return getIndiaCurrentMinutes(now) >= startMinutes + duration ? "completed" : booking.status;
  }

  if (bookingDate === yesterdayStr) {
    if (startMinutes === null || duration <= 0) return "completed";
    const endMinutes = startMinutes + duration;
    if (endMinutes <= 1440) return "completed";
    return getIndiaCurrentMinutes(now) >= endMinutes - 1440 ? "completed" : booking.status;
  }

  if (bookingDate < todayStr) return "completed";
  return booking.status;
}

export function normalizeRealtimeBookingStatus<T extends RealtimeBookingLike>(booking: T, now: Date = new Date()): T {
  const nextStatus = getRealtimeBookingStatus(booking, now);
  if (nextStatus === booking.status) {
    return booking;
  }

  return {
    ...booking,
    status: nextStatus,
  };
}
