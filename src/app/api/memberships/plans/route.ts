import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

type PlanRow = {
  id: string;
  cafe_id: string;
  plan_type: string;
  name: string;
  description: string | null;
  price: number;
  hours: number | null;
  validity_days: number;
  is_unlimited: boolean | null;
  cafes: { name: string; slug: string | null } | null;
};

/**
 * GET /api/memberships/plans?cafeId=...
 *
 * Membership plans a customer can buy. Public: this is a price list, and
 * someone deciding whether to sign up has not signed in yet.
 *
 * `cafeId` is optional — without it, plans from every café are returned, which
 * is what the membership landing page shows.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cafeId = searchParams.get("cafeId");

    let query = supabase
      .from("membership_plans")
      .select("id, cafe_id, plan_type, name, description, price, hours, validity_days, is_unlimited, cafes(name, slug)")
      .eq("is_active", true)
      .order("price", { ascending: true });

    if (cafeId) {
      query = query.eq("cafe_id", cafeId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Could not read membership plans:", error.message);
      return NextResponse.json({ error: "Could not load membership plans" }, { status: 500 });
    }

    const rows = (data ?? []) as unknown as PlanRow[];

    return NextResponse.json({
      plans: rows.map((row) => ({
        id: row.id,
        cafeId: row.cafe_id,
        cafeName: row.cafes?.name ?? "Café",
        cafeSlug: row.cafes?.slug ?? null,
        // 'day_pass' means unlimited play for the day; 'hourly_package' is a
        // bundle of hours to use across validity_days.
        planType: row.plan_type,
        name: row.name,
        description: row.description,
        price: Number(row.price) || 0,
        hours: row.hours,
        validityDays: row.validity_days,
        // Sold as play without a meter. The hours column is meaningless on
        // these, so anything printing "N hours" has to check this first.
        isUnlimited: row.is_unlimited === true,
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load plans";
    console.error("Membership plans error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
