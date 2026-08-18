import { phoneKey } from "@/lib/phone";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getIndiaDateString } from "@/lib/bookingFilters";

/**
 * Loyalty points: earning, balances, and the rules behind both.
 *
 * Kept in one place so the customer view, the owner view and the award-on-
 * completion hook cannot drift apart on what a point is worth.
 */

export type RewardKind = "free_minutes" | "free_item" | "discount";

export type LoyaltyReward = {
  id: string;
  name: string;
  description: string | null;
  pointsCost: number;
  kind: RewardKind;
  value: number;
  isActive: boolean;
  sortOrder: number;
};

/**
 * How a reward reads to a customer.
 *
 * "50 points" means nothing on its own. What brings someone back is knowing
 * that 50 points is a cold drink.
 */
export function describeReward(reward: Pick<LoyaltyReward, "kind" | "value">): string {
  switch (reward.kind) {
    case "free_minutes":
      return reward.value >= 60 && reward.value % 60 === 0
        ? `${reward.value / 60} hour${reward.value > 60 ? "s" : ""} of free play`
        : `${reward.value} minutes of free play`;
    case "discount":
      return `₹${reward.value} off your bill`;
    default:
      return reward.value > 0 ? `Worth about ₹${reward.value}` : "On the house";
  }
}

export type LoyaltySettings = {
  enabled: boolean;
  /** Rupees the customer must spend across one day before it earns anything. */
  minDailySpend: number;
  /** What a qualifying day is worth. Flat — the fifth visit earns the same as the first. */
  pointsPerDay: number;
  rupeesPerPoint: number;
  minRedeemPoints: number;
};

export const DEFAULT_LOYALTY_SETTINGS: LoyaltySettings = {
  enabled: false,
  minDailySpend: 300,
  pointsPerDay: 5,
  rupeesPerPoint: 1,
  minRedeemPoints: 50,
};

/**
 * Reduces a phone number to the last ten digits.
 *
 * The same customer is "9876543210" at the counter and "+91 98765 43210" in a
 * profile. Everything about loyalty is keyed on this, so a mismatch here means
 * a customer silently loses their balance.
 */


/**
 * What a day's spending earns.
 *
 * All or nothing against the threshold, and flat above it. Someone who spends
 * ₹1200 across five visits earns the same as someone who spends ₹300 once —
 * that is the rule the café asked for, and it is what stops a day of short
 * sessions paying out five times over.
 */
export function pointsForDay(daySpend: number, settings: LoyaltySettings): number {
  if (!settings.enabled || settings.pointsPerDay <= 0) return 0;
  return daySpend >= settings.minDailySpend ? settings.pointsPerDay : 0;
}

/** What a balance is worth in rupees. */
export function pointsToRupees(points: number, settings: LoyaltySettings): number {
  return Math.floor(Math.max(0, points) * settings.rupeesPerPoint);
}

export async function getLoyaltySettings(
  supabase: SupabaseClient,
  cafeId: string
): Promise<LoyaltySettings> {
  try {
    const { data, error } = await supabase
      .from("loyalty_settings")
      .select("enabled, min_daily_spend, points_per_day, rupees_per_point, min_redeem_points")
      .eq("cafe_id", cafeId)
      .maybeSingle();

    if (error || !data) {
      // A café that has never opened the settings page has no row. Defaults are
      // "off", so nothing accrues until an owner deliberately enables it.
      return DEFAULT_LOYALTY_SETTINGS;
    }

    return {
      enabled: Boolean(data.enabled),
      // Falls back to the defaults when the columns are absent, so this keeps
      // working between the deploy and the migration.
      minDailySpend:
        data.min_daily_spend == null
          ? DEFAULT_LOYALTY_SETTINGS.minDailySpend
          : Number(data.min_daily_spend),
      pointsPerDay:
        data.points_per_day == null
          ? DEFAULT_LOYALTY_SETTINGS.pointsPerDay
          : Number(data.points_per_day),
      rupeesPerPoint: Number(data.rupees_per_point) || 0,
      minRedeemPoints: Number(data.min_redeem_points) || 0,
    };
  } catch {
    return DEFAULT_LOYALTY_SETTINGS;
  }
}

/**
 * Awards a day's points once the customer has spent enough that day.
 *
 * The unit is the café-day, not the booking. Someone who plays five short
 * sessions in one afternoon has had one day out, and paying them five times for
 * it is how a scheme quietly becomes expensive. The day's spend is totalled
 * across every completed booking, so three ₹100 visits count the same as one
 * ₹300 visit — the customer spent ₹300 either way.
 *
 * Never throws. This runs off the back of a booking being marked complete, and
 * a loyalty problem must not fail the booking update that triggered it. The
 * once-per-day cap is a unique index rather than a check here, so neither a
 * retry nor two tills ringing up together can pay twice.
 */
export async function awardPointsForBooking(
  supabase: SupabaseClient,
  booking: {
    id: string;
    cafe_id: string;
    customer_phone: string | null;
    user_id: string | null;
    // No amount: the day's spend is read from the database, because one
    // booking's total is not the figure the threshold is measured against.
    booking_date?: string | null;
  }
): Promise<void> {
  try {
    const key = phoneKey(booking.customer_phone);
    if (!key) return;

    const settings = await getLoyaltySettings(supabase, booking.cafe_id);
    if (!settings.enabled || settings.pointsPerDay <= 0) return;

    // The café's booking date, not today's: a Friday session marked complete on
    // Saturday morning belongs to Friday.
    const awardDate = booking.booking_date || getIndiaDateString();

    // Every completed booking that customer had at this café on that day.
    // Fetched for the café-day and matched in JS, because customer_phone holds
    // whatever was typed at the counter and an exact match would miss the same
    // person saved as "+91 98765 43210".
    const { data: dayBookings, error: dayError } = await supabase
      .from("bookings")
      .select("customer_phone, total_amount, status, deleted_at")
      .eq("cafe_id", booking.cafe_id)
      .eq("booking_date", awardDate);

    if (dayError) {
      console.error("Could not total the day's spend:", dayError.message);
      return;
    }

    const daySpend = (dayBookings ?? [])
      .filter(
        (row) =>
          !row.deleted_at &&
          String(row.status ?? "").toLowerCase() === "completed" &&
          phoneKey(row.customer_phone as string | null) === key
      )
      .reduce((sum, row) => sum + (Number(row.total_amount) || 0), 0);

    const points = pointsForDay(daySpend, settings);
    if (points <= 0) return;

    const { error } = await supabase.from("loyalty_ledger").insert({
      cafe_id: booking.cafe_id,
      customer_phone: key,
      user_id: booking.user_id,
      points,
      reason: "booking",
      booking_id: booking.id,
      award_date: awardDate,
      note: `Earned on a ₹${daySpend} day`,
    });

    // 23505 is the once-per-day index doing its job: this customer already
    // earned today. Expected, not a problem.
    if (error && error.code !== "23505") {
      console.error("Could not award loyalty points:", error.message);
    }
  } catch (err) {
    console.error("Loyalty award failed:", err);
  }
}

/** The café's reward menu, cheapest first within the owner's own ordering. */
export async function getRewards(
  supabase: SupabaseClient,
  cafeId: string,
  includeInactive = false
): Promise<LoyaltyReward[]> {
  try {
    let query = supabase
      .from("loyalty_rewards")
      .select("id, name, description, points_cost, kind, value, is_active, sort_order")
      .eq("cafe_id", cafeId);

    if (!includeInactive) query = query.eq("is_active", true);

    const { data, error } = await query
      .order("sort_order", { ascending: true })
      .order("points_cost", { ascending: true });

    // An empty menu is the correct answer before the migration runs: the rest
    // of loyalty still works, there is just nothing to spend on yet.
    if (error || !data) return [];

    return data.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      pointsCost: Number(row.points_cost) || 0,
      kind: (row.kind as RewardKind) ?? "free_item",
      value: Number(row.value) || 0,
      isActive: Boolean(row.is_active),
      sortOrder: Number(row.sort_order) || 0,
    }));
  } catch {
    return [];
  }
}

/** Current balance for one customer at one café. */
export async function getBalance(
  supabase: SupabaseClient,
  cafeId: string,
  phone: string
): Promise<number> {
  const key = phoneKey(phone);
  if (!key) return 0;

  const { data, error } = await supabase
    .from("loyalty_ledger")
    .select("points")
    .eq("cafe_id", cafeId)
    .eq("customer_phone", key);

  if (error || !data) return 0;

  return data.reduce((sum, row) => sum + (Number(row.points) || 0), 0);
}

/**
 * Re-exported so existing importers keep working while there is only one
 * implementation. New code should import from "@/lib/phone" directly.
 */
export { phoneKey };
