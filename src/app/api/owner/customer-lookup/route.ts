import { NextRequest, NextResponse } from "next/server";
import { requireOwnerCafeAccess, requireOwnerContext } from "@/lib/ownerAuth";
import { phoneKey, pointsToRupees, getLoyaltySettings } from "@/lib/loyalty";
import { getIndiaDateString } from "@/lib/bookingFilters";

export const dynamic = "force-dynamic";

/**
 * GET /api/owner/customer-lookup?cafeId=…&phone=…
 *
 * Who this person is to the café, for the moment their number is typed at the
 * counter.
 *
 * Loyalty points are worthless if the only place to see them is a separate tab:
 * nobody stops mid-sale to go and check, so the balance never gets offered and
 * the scheme quietly does nothing. The number that matters — what this customer
 * could take off today — has to appear where the bill is being made.
 *
 * Fails soft in every direction. This sits in front of a sale, and a lookup
 * problem must never be the reason staff cannot take money.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;

    const { ownerId, supabase } = auth.context;
    const cafeId = request.nextUrl.searchParams.get("cafeId");
    const phone = request.nextUrl.searchParams.get("phone");

    if (!cafeId) {
      return NextResponse.json({ error: "cafeId is required" }, { status: 400 });
    }

    const accessError = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
    if (accessError) return accessError;

    const key = phoneKey(phone);
    if (!key) {
      return NextResponse.json({ found: false });
    }

    const [loyalty, membership] = await Promise.all([
      loadLoyalty(),
      loadMembership(),
    ]);

    return NextResponse.json({ found: true, phone: key, loyalty, membership });

    async function loadLoyalty() {
      try {
        const settings = await getLoyaltySettings(supabase, cafeId!);

        const { data, error } = await supabase
          .from("loyalty_ledger")
          .select("points")
          .eq("cafe_id", cafeId)
          .eq("customer_phone", key);

        if (error) return null;

        const balance = (data ?? []).reduce(
          (sum, row) => sum + (Number(row.points) || 0),
          0
        );

        return {
          enabled: settings.enabled,
          balance,
          worthRupees: pointsToRupees(balance, settings),
          minRedeemPoints: settings.minRedeemPoints,
          // The single fact the counter acts on.
          canRedeem: settings.enabled && balance >= settings.minRedeemPoints && balance > 0,
        };
      } catch {
        return null;
      }
    }

    /**
     * An active membership with hours left, so staff do not charge someone who
     * has already paid for the session in advance.
     */
    async function loadMembership() {
      try {
        // Matched in JS on the last ten digits, not with .eq(): this column
        // holds whatever was typed at the counter, so the same customer is
        // "9876543210" on one row and "+91 98765 43210" on the next. An exact
        // match silently finds nothing and the member gets charged again.
        const { data, error } = await supabase
          .from("subscriptions")
          .select("id, customer_phone, hours_remaining, expiry_date, status, membership_plans(name)")
          .eq("cafe_id", cafeId)
          .order("expiry_date", { ascending: false })
          .limit(500);

        if (error || !data || data.length === 0) return null;

        // India local, not UTC. Between midnight and 5:30am IST the UTC date
        // is still yesterday, which would keep an expired membership looking
        // valid for exactly the hours a late-night café is busiest.
        const today = getIndiaDateString();
        const usable = data.find((row) => {
          if (phoneKey(row.customer_phone) !== key) return false;

          const status = String(row.status ?? "active").toLowerCase();
          if (status === "cancelled" || status === "expired") return false;

          return !row.expiry_date || String(row.expiry_date).slice(0, 10) >= today;
        });

        if (!usable) return null;

        return {
          planName:
            (usable.membership_plans as unknown as { name?: string } | null)?.name ?? "Membership",
          hoursRemaining: Number(usable.hours_remaining) || 0,
          expiryDate: usable.expiry_date ?? null,
        };
      } catch {
        return null;
      }
    }
  } catch (err) {
    console.error("Customer lookup failed:", err);
    return NextResponse.json({ found: false });
  }
}
