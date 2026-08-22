import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  readStationIdentity,
  requireKnownStation,
  requireStationToken,
} from "@/lib/stationAgentAuth";
import {
  MAX_HOURS_IN_ONE_GO,
  consoleTypeOf,
  priceForDuration,
  type PricingRow,
} from "@/lib/stationPlayPricing";
import { buildStationPaymentUrl, getCafePayee } from "@/lib/upi";
import { dialableDigits } from "@/lib/phone";
import { toRupees } from "@/lib/wallet";

export const dynamic = "force-dynamic";

const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 60;

type RequestType = "hourly" | "membership" | "day_pass";

/**
 * What the customer will be charged, decided here and nowhere else.
 *
 * The lock screen was shown these same numbers by /play-options a moment ago,
 * but it is not asked to repeat them. Everything a café PC sends is typed by
 * whoever is sitting at it, and the one field that must never be is the price.
 */
async function resolvePrice(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  cafeId: string,
  stationName: string,
  type: RequestType,
  durationMinutes: number | null,
  planId: string | null
): Promise<{ amount: number; label: string } | { error: string }> {
  const consoleType = consoleTypeOf(stationName);

  if (type === "hourly") {
    if (!durationMinutes) {
      return { error: "Choose how long you want to play." };
    }

    if (durationMinutes > MAX_HOURS_IN_ONE_GO * 60) {
      return { error: `You can book up to ${MAX_HOURS_IN_ONE_GO} hours at a time here.` };
    }

    const { data: rows } = await supabase
      .from("console_pricing")
      .select("duration_minutes, price, quantity")
      .eq("cafe_id", cafeId)
      .eq("console_type", consoleType);

    const price = priceForDuration((rows || []) as PricingRow[], durationMinutes);

    // No row means the café does not sell that length, whatever the PC asked
    // for. Refusing beats inventing a price.
    if (price === null) {
      return { error: "That length is not available here. Please ask at the counter." };
    }

    const label =
      durationMinutes % 60 === 0
        ? `${durationMinutes / 60} hour${durationMinutes === 60 ? "" : "s"}`
        : `${durationMinutes} minutes`;

    return { amount: price, label };
  }

  // Memberships are not sold from a locked PC - see the note in play-options.
  // Refused here as well as hidden there, because leaving a choice out of the
  // UI is not the same as refusing it at the door.
  if (type === "membership") {
    return { error: "Memberships are bought in the app or at the counter." };
  }

  if (!planId) {
    return { error: "Choose a plan." };
  }

  const { data: plan } = await supabase
    .from("membership_plans")
    .select("id, name, price, plan_type, console_type, is_active")
    .eq("id", planId)
    .eq("cafe_id", cafeId)
    .maybeSingle();

  if (!plan || plan.is_active === false) {
    return { error: "That plan is no longer available." };
  }

  // Only day passes reach here now; memberships were refused above.
  if (plan.plan_type !== "day_pass") {
    return { error: "That plan cannot be used here." };
  }

  if ((plan.console_type || "").trim().toLowerCase() !== consoleType) {
    return { error: "That plan is not for this machine." };
  }

  return { amount: toRupees(plan.price), label: plan.name };
}

/**
 * POST /api/stations/play-request
 *
 * A customer at a locked PC asking to buy time.
 *
 * Writes a row and stops. Nothing here unlocks anything, changes a station's
 * status, or takes a payment — the owner approving it does all three. That
 * separation is the point: this route is reachable by anyone who can sit down
 * at a café PC, so it is only allowed to ask.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const identity = readStationIdentity(body);
    const unauthorized = requireStationToken(request, identity?.cafeId);
    if (unauthorized) return unauthorized;

    if (!identity) {
      return NextResponse.json({ error: "cafeId and stationName are required" }, { status: 400 });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const phone = dialableDigits(typeof body.phone === "string" ? body.phone : "");
    const type = body.type as RequestType;
    const paymentMethod = body.paymentMethod === "online" ? "online" : "counter";
    const durationMinutes = Number.isFinite(Number(body.durationMinutes))
      ? Math.round(Number(body.durationMinutes))
      : null;
    const planId = typeof body.planId === "string" && body.planId ? body.planId : null;

    if (name.length < MIN_NAME_LENGTH || name.length > MAX_NAME_LENGTH) {
      return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
    }

    // Ten digits, which is every Indian mobile number. Checked because this is
    // the only way the owner can identify the person at the machine, and the
    // only thing a membership's leftover hours can later be found by.
    if (phone.length !== 10) {
      return NextResponse.json(
        { error: "Please enter your 10-digit mobile number." },
        { status: 400 }
      );
    }

    if (type !== "hourly" && type !== "membership" && type !== "day_pass") {
      return NextResponse.json({ error: "Choose what you want to buy." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const unknown = await requireKnownStation(supabase, identity);
    if (unknown) return unknown;

    // Someone is already playing here. Taking a request for an occupied seat
    // would have the owner approve time on a machine that is not free.
    const { data: live } = await supabase
      .from("station_status")
      .select("status")
      .eq("cafe_id", identity.cafeId)
      .eq("station_name", identity.stationName)
      .maybeSingle();

    if ((live?.status || "").toLowerCase() === "unlocked") {
      return NextResponse.json(
        { error: "This PC is already unlocked. Please ask at the counter." },
        { status: 409 }
      );
    }

    const priced = await resolvePrice(
      supabase,
      identity.cafeId,
      identity.stationName,
      type,
      durationMinutes,
      planId
    );

    if ("error" in priced) {
      return NextResponse.json({ error: priced.error }, { status: 400 });
    }

    const { data: cafe } = await supabase
      .from("cafes")
      .select("name, upi_id, upi_display_name")
      .eq("id", identity.cafeId)
      .maybeSingle();

    // Null when the café has no UPI id, or when what it has is not a valid
    // one. Offering "pay online" with nowhere to pay would leave the customer
    // staring at a QR that goes nowhere, so the choice collapses to counter.
    const payee = cafe ? getCafePayee(cafe) : null;
    const method = paymentMethod === "online" && payee ? "online" : "counter";

    const { data: created, error: insertError } = await supabase
      .from("station_play_requests")
      .insert({
        cafe_id: identity.cafeId,
        station_name: identity.stationName,
        customer_name: name,
        customer_phone: phone,
        request_type: type,
        duration_minutes: type === "hourly" ? durationMinutes : null,
        membership_plan_id: type === "hourly" ? null : planId,
        amount: priced.amount,
        payment_method: method,
      })
      .select("id, created_at")
      .single();

    if (insertError) {
      // 23505 is the one-pending-per-station index. They already asked; show
      // them the request they have rather than a failure.
      if (insertError.code === "23505") {
        const { data: existing } = await supabase
          .from("station_play_requests")
          .select("id, amount, payment_method")
          .eq("cafe_id", identity.cafeId)
          .eq("station_name", identity.stationName)
          .eq("status", "pending")
          .maybeSingle();

        if (existing) {
          return NextResponse.json({
            requestId: existing.id,
            alreadyWaiting: true,
            amount: toRupees(existing.amount),
            label: priced.label,
            paymentMethod: existing.payment_method,
            upiLink:
              existing.payment_method === "online" && payee
                ? buildStationPaymentUrl(
                    payee,
                    toRupees(existing.amount),
                    identity.stationName
                  )
                : null,
          });
        }
      }

      if (insertError.message.includes("station_play_requests")) {
        return NextResponse.json(
          {
            error:
              "Paying from the screen is not set up yet. Run migration " +
              "20260820000000_station_play_requests.sql in Supabase.",
          },
          { status: 500 }
        );
      }

      console.error("Could not record play request:", insertError.message);
      return NextResponse.json({ error: "Could not send your request." }, { status: 500 });
    }

    console.log(
      `Play request ${created.id}: ${identity.stationName} — ${priced.label} for ${name} (${method}).`
    );

    return NextResponse.json({
      requestId: created.id,
      amount: priced.amount,
      label: priced.label,
      paymentMethod: method,
      upiLink:
        method === "online" && payee
          ? buildStationPaymentUrl(payee, priced.amount, identity.stationName)
          : null,
    });
  } catch (err) {
    console.error("Unexpected error creating play request:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * GET /api/stations/play-request?cafeId=&stationName=&requestId=
 *
 * The waiting lock screen asking whether the owner has answered yet.
 *
 * The unlock itself does not arrive this way — it comes over MQTT, the same as
 * every other unlock. This exists so the screen can stop saying "waiting" when
 * the answer was no, which nothing else would ever tell it.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const identity = readStationIdentity({
      cafeId: params.get("cafeId"),
      stationName: params.get("stationName"),
    });
    const unauthorized = requireStationToken(request, identity?.cafeId);
    if (unauthorized) return unauthorized;
    const requestId = params.get("requestId")?.trim() || "";

    if (!identity || !requestId) {
      return NextResponse.json(
        { error: "cafeId, stationName and requestId are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Matched on the station as well as the id: a request id is not a secret,
    // and one PC should not be able to read another's.
    const { data, error } = await supabase
      .from("station_play_requests")
      .select("id, status, decline_reason, approved_minutes, decided_at")
      .eq("id", requestId)
      .eq("cafe_id", identity.cafeId)
      .eq("station_name", identity.stationName)
      .maybeSingle();

    if (error) {
      console.error("Play request lookup failed:", error.message);
      return NextResponse.json({ error: "Could not check your request." }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    return NextResponse.json({
      requestId: data.id,
      status: data.status,
      declineReason: data.decline_reason,
      approvedMinutes: data.approved_minutes,
      decidedAt: data.decided_at,
    });
  } catch (err) {
    console.error("Unexpected error reading play request:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
