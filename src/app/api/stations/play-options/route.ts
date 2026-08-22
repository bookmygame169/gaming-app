import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  readStationIdentity,
  requireKnownStation,
  requireStationToken,
} from "@/lib/stationAgentAuth";
import {
  consoleTypeOf,
  durationOptions,
  withWholeHourBlocks,
  type PricingRow,
} from "@/lib/stationPlayPricing";
import { toRupees } from "@/lib/wallet";

export const dynamic = "force-dynamic";

type PlanRow = {
  id: string;
  name: string;
  price: number | string | null;
  hours: number | null;
  validity_days: number | null;
  plan_type: string;
  console_type: string | null;
};

function planShape(row: PlanRow) {
  return {
    id: row.id,
    name: row.name,
    price: toRupees(row.price),
    hours: row.hours,
    validityDays: row.validity_days,
  };
}

/**
 * POST /api/stations/play-options
 *
 * What a customer sitting at this locked machine is allowed to buy.
 *
 * The agent asks for this rather than holding a price list of its own, and
 * that is the whole point of the route. Prices live in one place — the owner's
 * dashboard — and a café PC caching them means an owner raising the hourly
 * rate has to remember to reinstall four machines before it takes effect.
 *
 * It also means the amount can never be sent up from the PC. The lock screen
 * displays what this route said; the request route looks the price up again
 * for itself. A customer naming their own price is the same hole whichever
 * screen they are sitting at.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const identity = readStationIdentity(body);
    const unauthorized = requireStationToken(request, identity?.cafeId);
    if (unauthorized) return unauthorized;

    if (!identity) {
      return NextResponse.json(
        { error: "cafeId and stationName are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const unknown = await requireKnownStation(supabase, identity);
    if (unknown) return unknown;

    const consoleType = consoleTypeOf(identity.stationName);

    const [{ data: cafe }, { data: prices }, { data: plans }, { data: pending }] =
      await Promise.all([
        supabase
          .from("cafes")
          .select("name, upi_id, upi_display_name")
          .eq("id", identity.cafeId)
          .maybeSingle(),
        supabase
          .from("console_pricing")
          .select("duration_minutes, price, quantity")
          .eq("cafe_id", identity.cafeId)
          .eq("console_type", consoleType),
        supabase
          .from("membership_plans")
          .select("id, name, price, hours, validity_days, plan_type, console_type")
          .eq("cafe_id", identity.cafeId)
          .eq("is_active", true),
        supabase
          .from("station_play_requests")
          .select("id, status, created_at, amount, request_type, payment_method")
          .eq("cafe_id", identity.cafeId)
          .eq("station_name", identity.stationName)
          .eq("status", "pending")
          .maybeSingle(),
      ]);

    // console_type on a plan is free text the owner typed ("PC", "PS5"), while
    // console_pricing is keyed lower case. Compared case-insensitively so a
    // café that capitalised one and not the other still sees its own plans.
    const forThisStation = (plans || []).filter(
      (plan) => (plan.console_type || "").trim().toLowerCase() === consoleType
    ) as PlanRow[];

    const upiId = cafe?.upi_id?.trim() || null;

    return NextResponse.json({
      station: identity.stationName,
      cafeName: cafe?.name || "the café",
      hourly: withWholeHourBlocks(durationOptions((prices || []) as PricingRow[])),
      // Deliberately empty, and kept in the response so an older agent that
      // still renders the section simply finds nothing to show.
      //
      // A membership is joined to its owner by the phone number typed when it
      // is sold, and nothing checks that number. At a counter it can be read
      // back; in the app it is already their account; on a locked PC it is a
      // stranger typing into a box, and one wrong digit puts thousands of
      // rupees of hours on a phone that does not exist - which the customer
      // cannot discover, because seeing their membership requires the number
      // they got wrong. Day passes and hours are consumed on the spot, so a
      // typo there costs nobody anything.
      //
      // Members are pointed at the QR instead: that flow knows who they are.
      memberships: [],
      dayPasses: forThisStation
        .filter((plan) => plan.plan_type === "day_pass")
        .map(planShape)
        .sort((a, b) => a.price - b.price),

      // Null when the café has not set a UPI id. The lock screen hides the
      // "pay online" choice entirely in that case — better no button than one
      // that sends a customer's money nowhere.
      upi: upiId ? { id: upiId, name: cafe?.upi_display_name?.trim() || cafe?.name || "" } : null,

      // So an agent that restarted mid-wait finds its own request again rather
      // than offering to make a second one.
      pendingRequest: pending
        ? {
            id: pending.id,
            amount: toRupees(pending.amount),
            requestType: pending.request_type,
            paymentMethod: pending.payment_method,
            createdAt: pending.created_at,
          }
        : null,
    });
  } catch (err) {
    console.error("Unexpected error reading play options:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
