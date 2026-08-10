import type { SupabaseClient } from "@supabase/supabase-js";

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
  pointsPerHundred: number;
  rupeesPerPoint: number;
  minRedeemPoints: number;
};

export const DEFAULT_LOYALTY_SETTINGS: LoyaltySettings = {
  enabled: false,
  pointsPerHundred: 5,
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
export function phoneKey(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/**
 * Points earned for an amount spent.
 *
 * Rounded down so the café never awards more than it intended, but a paid
 * booking always earns at least one point — earning zero for a small session
 * reads as broken.
 */
export function pointsForAmount(amount: number, settings: LoyaltySettings): number {
  if (!settings.enabled || settings.pointsPerHundred <= 0 || amount <= 0) return 0;
  return Math.max(1, Math.floor((amount / 100) * settings.pointsPerHundred));
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
      .select("enabled, points_per_hundred, rupees_per_point, min_redeem_points")
      .eq("cafe_id", cafeId)
      .maybeSingle();

    if (error || !data) {
      // A café that has never opened the settings page has no row. Defaults are
      // "off", so nothing accrues until an owner deliberately enables it.
      return DEFAULT_LOYALTY_SETTINGS;
    }

    return {
      enabled: Boolean(data.enabled),
      pointsPerHundred: Number(data.points_per_hundred) || 0,
      rupeesPerPoint: Number(data.rupees_per_point) || 0,
      minRedeemPoints: Number(data.min_redeem_points) || 0,
    };
  } catch {
    return DEFAULT_LOYALTY_SETTINGS;
  }
}

/**
 * Awards points for a completed booking.
 *
 * Never throws. This runs off the back of a booking being marked complete, and
 * a loyalty problem must not fail the booking update that triggered it. A
 * duplicate award is refused by a unique index rather than checked for here, so
 * a retry cannot pay twice.
 */
export async function awardPointsForBooking(
  supabase: SupabaseClient,
  booking: {
    id: string;
    cafe_id: string;
    customer_phone: string | null;
    user_id: string | null;
    total_amount: number | null;
  }
): Promise<void> {
  try {
    const key = phoneKey(booking.customer_phone);
    if (!key) return;

    const amount = Number(booking.total_amount) || 0;
    if (amount <= 0) return;

    const settings = await getLoyaltySettings(supabase, booking.cafe_id);
    if (!settings.enabled) return;

    const points = pointsForAmount(amount, settings);
    if (points <= 0) return;

    const { error } = await supabase.from("loyalty_ledger").insert({
      cafe_id: booking.cafe_id,
      customer_phone: key,
      user_id: booking.user_id,
      points,
      reason: "booking",
      booking_id: booking.id,
      note: `Earned on a ₹${amount} session`,
    });

    // 23505 is the unique violation from the one-award-per-booking index, which
    // means it was already awarded. Expected, not a problem.
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
