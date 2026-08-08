import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/userAuth";

export const dynamic = "force-dynamic";

/**
 * Reduces a phone number to just its digits, dropping any country code.
 *
 * The same person's number gets written many ways across the app: typed at the
 * counter as "9876543210", saved in a profile as "+91 98765 43210". Comparing
 * the raw strings would show a member nothing, so both sides are reduced to the
 * last ten digits before matching.
 */
function phoneKey(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

type SubscriptionRow = {
  id: string;
  cafe_id: string;
  customer_phone: string;
  hours_purchased: number;
  hours_remaining: number;
  amount_paid: number;
  purchase_date: string;
  expiry_date: string;
  status: string;
  membership_plans: {
    name: string;
    plan_type: string;
    description: string | null;
    hours: number | null;
    validity_days: number;
  } | null;
  cafes: { name: string } | null;
};

/**
 * GET /api/memberships/mine
 *
 * The signed-in customer's memberships: hours left, expiry, which café.
 *
 * Memberships are sold at the counter, so `subscriptions` holds a phone number
 * rather than an account id. The customer's saved phone is what links the two.
 * That means someone with no phone on their profile sees nothing, which the
 * response says explicitly rather than looking like an empty list.
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

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("phone")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      console.error("Could not read profile for memberships:", profileError.message);
      return NextResponse.json({ error: "Could not load your details" }, { status: 500 });
    }

    const myKey = phoneKey(profile?.phone);

    if (!myKey) {
      return NextResponse.json({
        memberships: [],
        needsPhone: true,
        message:
          "Add your phone number to your profile to see memberships bought at the counter.",
      });
    }

    // Filtered by phone in the query would miss the formatting differences this
    // is designed to absorb, so the comparison happens after fetching. Scoped to
    // active rows to keep that set small.
    const { data, error } = await supabase
      .from("subscriptions")
      .select(
        "id, cafe_id, customer_phone, hours_purchased, hours_remaining, amount_paid, " +
          "purchase_date, expiry_date, status, " +
          "membership_plans(name, plan_type, description, hours, validity_days), " +
          "cafes(name)"
      )
      .in("status", ["active", "expired"])
      .order("purchase_date", { ascending: false })
      .limit(200);

    if (error) {
      console.error("Could not read subscriptions:", error.message);
      return NextResponse.json({ error: "Could not load your memberships" }, { status: 500 });
    }

    const rows = (data ?? []) as unknown as SubscriptionRow[];
    const now = Date.now();

    const memberships = rows
      .filter((row) => phoneKey(row.customer_phone) === myKey)
      .map((row) => {
        const expiresAt = new Date(row.expiry_date).getTime();
        const isExpired = expiresAt < now || row.status === "expired";
        const daysLeft = Math.max(0, Math.ceil((expiresAt - now) / 86_400_000));

        return {
          id: row.id,
          cafeName: row.cafes?.name ?? "Café",
          planName: row.membership_plans?.name ?? "Membership",
          planType: row.membership_plans?.plan_type ?? null,
          description: row.membership_plans?.description ?? null,
          hoursPurchased: row.hours_purchased,
          hoursRemaining: row.hours_remaining,
          amountPaid: Number(row.amount_paid) || 0,
          purchaseDate: row.purchase_date,
          expiryDate: row.expiry_date,
          daysLeft,
          // Both conditions matter: hours can run out before the date, and the
          // date can pass with hours unused.
          isUsable: !isExpired && row.hours_remaining > 0,
          isExpired,
        };
      });

    return NextResponse.json({ memberships, needsPhone: false });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load memberships";
    console.error("Customer memberships error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
