export type OwnerBookingItemLike = {
  price?: number | string | null;
};

export type OwnerBookingOrderLike = {
  total_price?: number | string | null;
};

export type OwnerBookingRevenueLike = {
  booking_items?: OwnerBookingItemLike[] | null;
  booking_orders?: OwnerBookingOrderLike[] | null;
  payment_mode?: string | null;
  source?: string | null;
  status?: string | null;
  total_amount?: number | string | null;
};

export const DIGITAL_OWNER_PAYMENT_MODES = new Set([
  "online",
  "upi",
  "paytm",
  "gpay",
  "phonepe",
  "card",
]);

export function toOwnerAmount(value?: number | string | null): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number.parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

export function hasBookingSessionItems(booking: OwnerBookingRevenueLike): boolean {
  return Boolean(booking.booking_items?.length);
}

export function getBookingSnackTotal(booking: OwnerBookingRevenueLike): number {
  return (booking.booking_orders || []).reduce(
    (sum, order) => sum + toOwnerAmount(order.total_price),
    0
  );
}

export function getBookingItemsTotal(booking: OwnerBookingRevenueLike): number {
  return (booking.booking_items || []).reduce(
    (sum, item) => sum + toOwnerAmount(item.price),
    0
  );
}

export function getBookingGamingTotal(booking: OwnerBookingRevenueLike): number {
  if (!hasBookingSessionItems(booking)) return 0;

  const itemTotal = getBookingItemsTotal(booking);
  if (itemTotal > 0) return itemTotal;

  const totalAmount = toOwnerAmount(booking.total_amount);
  const snackTotal = getBookingSnackTotal(booking);

  return snackTotal > 0 && totalAmount > snackTotal
    ? totalAmount - snackTotal
    : totalAmount;
}

export function getBookingRevenueTotal(booking: OwnerBookingRevenueLike): number {
  const snackTotal = getBookingSnackTotal(booking);
  return hasBookingSessionItems(booking)
    ? getBookingGamingTotal(booking) + snackTotal
    : snackTotal || toOwnerAmount(booking.total_amount);
}

export function isOwnerUseRevenueBooking(booking: OwnerBookingRevenueLike): boolean {
  return (booking.payment_mode || "").toLowerCase() === "owner";
}

export function isBillableRevenueBooking(booking: OwnerBookingRevenueLike): boolean {
  return booking.status !== "cancelled" && !isOwnerUseRevenueBooking(booking);
}

export function getOwnerPaymentBucket(mode?: string | null): "cash" | "upi" {
  const normalized = mode?.toLowerCase().trim() || "cash";
  return DIGITAL_OWNER_PAYMENT_MODES.has(normalized) ? "upi" : "cash";
}
