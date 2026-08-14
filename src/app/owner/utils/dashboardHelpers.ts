/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ConsoleId } from '@/lib/constants';
import type { BookingRow, CafeRow } from '../types';
import { getAvailableConsoleIds, getLocalDateString } from '../utils';

export const debugLog: (...args: any[]) => void = process.env.NODE_ENV !== "production" ? console.log.bind(console) : () => {};

const DIGITAL_PAYMENT_MODES = new Set(['online', 'upi', 'paytm', 'gpay', 'phonepe', 'card']);
const DAY_PASS_END_HOUR_IST = 22;

export function normaliseOwnerPaymentMode(mode: string | null | undefined): string {
  const normalized = mode?.toLowerCase() || '';
  return DIGITAL_PAYMENT_MODES.has(normalized) ? 'upi' : 'cash';
}

export function getAssignedStationsFromItemTitle(title: string | null | undefined): string[] {
  const stationPart = title?.split('|')[1]?.trim();
  if (!stationPart) return [];

  return stationPart
    .split(',')
    .map((station) => station.trim().toLowerCase())
    .filter(Boolean);
}

export function getBookingItemDuration(item: { duration?: number; title?: string | null } | null | undefined, fallback = 60): number {
  if (typeof item?.duration === 'number' && item.duration > 0) {
    return item.duration;
  }

  const parsedDuration = parseInt(item?.title?.split('|')[0] || '', 10);
  return Number.isNaN(parsedDuration) || parsedDuration <= 0 ? fallback : parsedDuration;
}

export function buildBookingItemTitle(existingTitle: string | null | undefined, duration: number): string {
  const stationPart = existingTitle?.split('|')[1]?.trim();
  return stationPart ? `${duration}|${stationPart}` : String(duration);
}

export function parseClockTimeToMinutes(timeStr: string | null | undefined): number | null {
  const timeParts = timeStr?.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (!timeParts) return null;

  let hours = parseInt(timeParts[1], 10);
  const minutes = parseInt(timeParts[2], 10);
  const period = timeParts[3]?.toLowerCase();

  if (period === 'pm' && hours !== 12) hours += 12;
  else if (period === 'am' && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

export function getDayPassDurationUntil10Pm(startTime: string): number {
  const startMinutes = parseClockTimeToMinutes(startTime);
  if (startMinutes === null) return 60;

  const endMinutes = DAY_PASS_END_HOUR_IST * 60;
  return Math.max(1, endMinutes - startMinutes);
}

export function getPreferredConsoleForCafe(cafe: CafeRow | null | undefined): ConsoleId {
  return getAvailableConsoleIds(cafe)[0] || 'ps5';
}

export function toWholeRupees(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function distributeWholeRupees<T extends { price?: number }>(items: T[], total: number): T[] {
  if (items.length === 0) return items;

  const wholeTotal = toWholeRupees(total);
  const weights = items.map((item) => Math.max(0, Number(item.price) || 0));
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const exactShares = weights.map((weight) => (
    weightTotal > 0 ? (wholeTotal * weight) / weightTotal : wholeTotal / items.length
  ));
  const baseShares = exactShares.map(Math.floor);
  let remaining = wholeTotal - baseShares.reduce((sum, share) => sum + share, 0);
  const bonusIndexes = exactShares
    .map((share, index) => ({ index, fraction: share - Math.floor(share) }))
    .sort((a, b) => b.fraction - a.fraction);

  const prices = [...baseShares];
  for (const { index } of bonusIndexes) {
    if (remaining <= 0) break;
    prices[index] += 1;
    remaining -= 1;
  }

  return items.map((item, index) => ({ ...item, price: prices[index] }));
}

export type TimeAdjustmentTarget = {
  booking: BookingRow;
  bookingItemId: string | null;
  currentDuration: number;
  nextDuration: number;
  customerName: string;
  stationName: string;
};

export function getIndiaParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  return {
    year: parts.find((part) => part.type === 'year')?.value,
    month: parts.find((part) => part.type === 'month')?.value,
    day: parts.find((part) => part.type === 'day')?.value,
  };
}

export function getDayPassEndAt(value?: string | null): Date | null {
  if (!value) return null;

  const sourceDate = new Date(value);
  if (Number.isNaN(sourceDate.getTime())) return null;

  const { year, month, day } = getIndiaParts(sourceDate);
  if (!year || !month || !day) return null;

  return new Date(`${year}-${month}-${day}T${String(DAY_PASS_END_HOUR_IST).padStart(2, '0')}:00:00+05:30`);
}

export function normalizePhoneDigits(value?: string | null): string {
  return (value || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
}

export function findMembershipSubscriptionForBooking(booking: BookingRow | null, subscriptions: any[]) {
  if (!booking || booking.source !== 'membership') return null;

  const bookingPhone = normalizePhoneDigits(booking.customer_phone || booking.user_phone);
  const bookingAmount = Number(booking.total_amount || 0);
  const bookingDate = booking.booking_date || '';
  const bookingCreatedAt = booking.created_at ? new Date(booking.created_at).getTime() : 0;

  const candidates = subscriptions
    .filter((subscription) => {
      if (booking.cafe_id && subscription.cafe_id && subscription.cafe_id !== booking.cafe_id) return false;
      if (bookingPhone && normalizePhoneDigits(subscription.customer_phone) !== bookingPhone) return false;
      return true;
    })
    .map((subscription) => {
      const purchaseDate = subscription.purchase_date
        ? getLocalDateString(new Date(subscription.purchase_date))
        : '';
      const purchaseTime = subscription.purchase_date ? new Date(subscription.purchase_date).getTime() : 0;
      const amountMatches = Math.abs(Number(subscription.amount_paid || 0) - bookingAmount) < 0.01;
      const dateMatches = bookingDate && purchaseDate === bookingDate;

      return {
        subscription,
        score: Number(amountMatches) * 4 + Number(dateMatches) * 3,
        timeDiff: bookingCreatedAt && purchaseTime ? Math.abs(bookingCreatedAt - purchaseTime) : Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((left, right) => right.score - left.score || left.timeDiff - right.timeDiff);

  return candidates[0]?.subscription || null;
}
