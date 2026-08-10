import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/userAuth";
import {
  phoneKey,
  pointsToRupees,
  describeReward,
  getRewards,
  DEFAULT_LOYALTY_SETTINGS,
  type LoyaltySettings,
} from "@/lib/loyalty";

export const dynamic = "force-dynamic";

type LedgerRow = {
  id: string;
  cafe_id: string;
  points: number;
  reason: string;
  note: string | null;
  created_at: string;
  cafes: { name: string } | null;
};

type SettingsRow = {
  cafe_id: string;
  enabled: boolean;
  min_daily_spend: number | null;
  points_per_day: number | null;
  rupees_per_point: number;
  min_redeem_points: number;
};

/**
 * GET /api/loyalty/mine
 *
 * The signed-in customer's points, per café.
 *
 * Points are keyed on phone number because they are earned mostly by walk-ins
 * who never sign in, so a customer with no phone on their profile is told that
 * rather than shown an empty balance that looks like their points vanished.
 */
export async function GET(request: NextRequest) {
  try {
    const { userId, response: authResponse } = await requireUser(request);
    if (authResponse) return authResponse;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: profile } = await supabase
      .from("profiles")
      .select("phone")
      .eq("id", userId)
      .maybeSingle();

    const myKey = phoneKey(profile?.phone);

    if (!myKey) {
      return NextResponse.json({
        cafes: [],
        needsPhone: true,
        message: "Add your phone number to your profile to see the points you have earned.",
      });
    }

    const { data, error } = await supabase
      .from("loyalty_ledger")
      .select("id, cafe_id, points, reason, note, created_at, cafes(name)")
      .eq("customer_phone", myKey)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("Could not read loyalty ledger:", error.message);
      return NextResponse.json(
        {
          error:
            "Could not load your points. If this is the first time, the loyalty tables " +
            "may not exist yet — run migration 20260807000001_add_loyalty_program.sql.",
        },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as unknown as LedgerRow[];

    if (rows.length === 0) {
      return NextResponse.json({ cafes: [], needsPhone: false });
    }

    // Only cafés the customer actually has history at, so the response does not
    // list every café on the platform.
    const cafeIds = [...new Set(rows.map((row) => row.cafe_id))];

    const { data: settingsRows } = await supabase
      .from("loyalty_settings")
      .select("cafe_id, enabled, min_daily_spend, points_per_day, rupees_per_point, min_redeem_points")
      .in("cafe_id", cafeIds);

    const settingsByCafe = new Map<string, LoyaltySettings>();
    for (const row of (settingsRows ?? []) as unknown as SettingsRow[]) {
      settingsByCafe.set(row.cafe_id, {
        enabled: Boolean(row.enabled),
        minDailySpend:
          row.min_daily_spend == null
            ? DEFAULT_LOYALTY_SETTINGS.minDailySpend
            : Number(row.min_daily_spend),
        pointsPerDay:
          row.points_per_day == null
            ? DEFAULT_LOYALTY_SETTINGS.pointsPerDay
            : Number(row.points_per_day),
        rupeesPerPoint: Number(row.rupees_per_point) || 0,
        minRedeemPoints: Number(row.min_redeem_points) || 0,
      });
    }

    // The menu for each café the customer has points at. Fetched together so
    // one slow café does not hold up the rest of the page.
    const rewardsByCafe = new Map(
      await Promise.all(
        cafeIds.map(
          async (id) => [id, await getRewards(supabase, id)] as const
        )
      )
    );

    const byCafe = new Map<
      string,
      { cafeId: string; cafeName: string; balance: number; history: LedgerRow[] }
    >();

    for (const row of rows) {
      const existing = byCafe.get(row.cafe_id) ?? {
        cafeId: row.cafe_id,
        cafeName: row.cafes?.name ?? "Café",
        balance: 0,
        history: [],
      };

      existing.balance += Number(row.points) || 0;
      existing.history.push(row);
      byCafe.set(row.cafe_id, existing);
    }

    return NextResponse.json({
      needsPhone: false,
      cafes: [...byCafe.values()]
        .sort((a, b) => b.balance - a.balance)
        .map((entry) => {
          const settings = settingsByCafe.get(entry.cafeId) ?? DEFAULT_LOYALTY_SETTINGS;

          return {
            cafeId: entry.cafeId,
            cafeName: entry.cafeName,
            balance: entry.balance,
            worthRupees: pointsToRupees(entry.balance, settings),
            minRedeemPoints: settings.minRedeemPoints,
            canRedeem: settings.enabled && entry.balance >= settings.minRedeemPoints,
            // Shown so a customer whose café has switched the scheme off is not
            // left wondering why a balance cannot be spent.
            programEnabled: settings.enabled,
            // What the points are actually for. Sorted by what they can claim
            // right now, so the top of the list is a reason to come in today
            // rather than something to save towards.
            rewards: (rewardsByCafe.get(entry.cafeId) ?? [])
              .map((reward) => ({
                id: reward.id,
                name: reward.name,
                description: reward.description,
                pointsCost: reward.pointsCost,
                detail: describeReward(reward),
                affordable: entry.balance >= reward.pointsCost,
                pointsToGo: Math.max(0, reward.pointsCost - entry.balance),
              }))
              .sort((a, b) =>
                a.affordable === b.affordable
                  ? a.pointsCost - b.pointsCost
                  : Number(b.affordable) - Number(a.affordable)
              ),
            history: entry.history.slice(0, 20).map((row) => ({
              id: row.id,
              points: row.points,
              reason: row.reason,
              note: row.note,
              createdAt: row.created_at,
            })),
          };
        }),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load points";
    console.error("Customer loyalty error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
