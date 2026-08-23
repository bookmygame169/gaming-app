import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireOwnerCafeAccess, requireOwnerContext } from "@/lib/ownerAuth";
import { sendStationCommands } from "@/lib/stationCommands";
import { stationAssignmentFields } from "@/lib/ownerStationAssignments";
import { consoleTypeOf } from "@/lib/stationPlayPricing";
import { getIndiaCurrentMinutes, getIndiaDateString } from "@/lib/bookingFilters";
import { minutesToTimeString, convertTo12Hour } from "@/lib/timeUtils";
import { toRupees } from "@/lib/wallet";
import { insertBooking } from "@/lib/bookingInstants";

export const dynamic = "force-dynamic";

/**
 * When a day pass stops being valid, in IST.
 *
 * The same hour the counter's own membership checkout uses. A day pass sold at
 * 9pm buys an hour, not a day, and both routes have to agree about that or the
 * same plan means two different things depending on who sold it.
 */
const DAY_PASS_END_HOUR_IST = 22;

/**
 * The longest any single unlock is allowed to be.
 *
 * A membership or a day pass has no requested duration — the customer plays
 * until they end the session. That is what was asked for, and it leaves one
 * hole: a customer who walks out without ending anything. Nothing else in this
 * agent would ever re-lock that machine, so it would sit unlocked overnight.
 *
 * So an open-ended session is really a very long one. The customer never
 * notices the cap; it exists only to catch the walk-away.
 */
const MAX_SESSION_MINUTES = 12 * 60;
const MIN_SESSION_MINUTES = 15;

type PlayRequestRow = {
  id: string;
  cafe_id: string;
  station_name: string;
  customer_name: string;
  customer_phone: string;
  request_type: "hourly" | "membership" | "day_pass";
  duration_minutes: number | null;
  membership_plan_id: string | null;
  amount: number | string;
  payment_method: "online" | "counter";
  status: string;
};

type PlanRow = {
  id: string;
  name: string;
  hours: number | null;
  validity_days: number | null;
  plan_type: string;
  is_unlimited?: boolean | null;
};

/** Minutes from now until the café closes, in IST. */
function minutesUntilDayPassEnds(): number {
  const nowMinutes = getIndiaCurrentMinutes();
  const closeMinutes = DAY_PASS_END_HOUR_IST * 60;
  return Math.max(MIN_SESSION_MINUTES, closeMinutes - nowMinutes);
}

/**
 * How long to unlock for, when the owner has not said.
 *
 * Hourly is what they asked and paid for. The other two are open-ended, so
 * this is only the backstop described on MAX_SESSION_MINUTES.
 */
function defaultMinutesFor(request: PlayRequestRow, plan: PlanRow | null): number {
  if (request.request_type === "hourly") {
    return request.duration_minutes || 60;
  }

  if (request.request_type === "day_pass") {
    return Math.min(MAX_SESSION_MINUTES, minutesUntilDayPassEnds());
  }

  // A membership cannot buy more time in one sitting than it holds.
  const planMinutes = Math.round((plan?.hours || 1) * 60);
  return Math.min(MAX_SESSION_MINUTES, Math.max(MIN_SESSION_MINUTES, planMinutes));
}

/**
 * GET /api/owner/play-requests?cafeId=
 *
 * Everything still waiting on the owner, newest first.
 */
export async function GET(request: NextRequest) {
  const auth = await requireOwnerContext(request);
  if (auth.response) return auth.response;

  const { ownerId, supabase } = auth.context;
  const cafeId = request.nextUrl.searchParams.get("cafeId") || "";

  if (!cafeId) {
    return NextResponse.json({ error: "cafeId is required" }, { status: 400 });
  }

  const accessError = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
  if (accessError) return accessError;

  const { data, error } = await supabase
    .from("station_play_requests")
    .select(
      `id, station_name, customer_name, customer_phone, request_type, duration_minutes,
       amount, payment_method, created_at, membership_plans(name, hours, validity_days)`
    )
    .eq("cafe_id", cafeId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    // The table is created by a migration that ships separately from this
    // code, so a deploy can land before it is run. Saying so beats a 500.
    if (error.message.includes("station_play_requests")) {
      return NextResponse.json({ requests: [], migrationMissing: true });
    }

    console.error("Could not load play requests:", error.message);
    return NextResponse.json({ error: "Could not load requests." }, { status: 500 });
  }

  return NextResponse.json({
    requests: (data || []).map((row) => {
      const plan = Array.isArray(row.membership_plans)
        ? row.membership_plans[0]
        : row.membership_plans;

      return {
        id: row.id,
        stationName: row.station_name,
        customerName: row.customer_name,
        customerPhone: row.customer_phone,
        requestType: row.request_type,
        durationMinutes: row.duration_minutes,
        amount: toRupees(row.amount),
        paymentMethod: row.payment_method,
        createdAt: row.created_at,
        planName: plan?.name || null,
        planHours: plan?.hours ?? null,
      };
    }),
  });
}

/**
 * POST /api/owner/play-requests
 *
 * The owner answering one. Body: { cafeId, requestId, action, minutes?, reason? }
 *
 * Approving does four things in a deliberate order: claim the request, write
 * the records, unlock the machine, and only then mark it approved. The claim is
 * first because two people tapping Approve on the same request would otherwise
 * both get through — one seat, two bookings, twice the money.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;

    const { ownerId, supabase } = auth.context;
    const body = await request.json().catch(() => ({}));

    const cafeId = String(body?.cafeId || "");
    const requestId = String(body?.requestId || "");
    const action = body?.action === "approve" ? "approve" : "decline";

    if (!cafeId || !requestId) {
      return NextResponse.json({ error: "cafeId and requestId are required" }, { status: 400 });
    }

    const accessError = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
    if (accessError) return accessError;

    const { data: found, error: loadError } = await supabase
      .from("station_play_requests")
      .select(
        `id, cafe_id, station_name, customer_name, customer_phone, request_type,
         duration_minutes, membership_plan_id, amount, payment_method, status`
      )
      .eq("id", requestId)
      .eq("cafe_id", cafeId)
      .maybeSingle();

    if (loadError) {
      console.error("Could not load play request:", loadError.message);
      return NextResponse.json({ error: "Could not load that request." }, { status: 500 });
    }

    if (!found) {
      return NextResponse.json({ error: "Request not found." }, { status: 404 });
    }

    const playRequest = found as PlayRequestRow;

    if (playRequest.status !== "pending") {
      return NextResponse.json(
        { error: `This request was already ${playRequest.status}.` },
        { status: 409 }
      );
    }

    if (action === "decline") {
      const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 200) : "";

      const { error: declineError } = await supabase
        .from("station_play_requests")
        .update({
          status: "rejected",
          decline_reason: reason || null,
          decided_by: ownerId,
          decided_at: new Date().toISOString(),
        })
        .eq("id", requestId)
        .eq("status", "pending");

      if (declineError) {
        console.error("Could not decline play request:", declineError.message);
        return NextResponse.json({ error: "Could not decline that request." }, { status: 500 });
      }

      return NextResponse.json({ success: true, status: "rejected" });
    }

    return approve(supabase, ownerId, playRequest, body);
  } catch (err) {
    console.error("Unexpected error answering a play request:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

async function approve(
  supabase: SupabaseClient,
  ownerId: string,
  playRequest: PlayRequestRow,
  body: Record<string, unknown>
): Promise<NextResponse> {
  const amount = toRupees(playRequest.amount);
  const stationName = playRequest.station_name;

  let plan: PlanRow | null = null;
  if (playRequest.membership_plan_id) {
    const { data } = await supabase
      .from("membership_plans")
      .select("id, name, hours, validity_days, plan_type, is_unlimited")
      .eq("id", playRequest.membership_plan_id)
      .maybeSingle();
    plan = (data as PlanRow) || null;
  }

  const requested = Number(body?.minutes);
  const minutes = Number.isFinite(requested) && requested > 0
    ? Math.min(MAX_SESSION_MINUTES, Math.max(MIN_SESSION_MINUTES, Math.round(requested)))
    : defaultMinutesFor(playRequest, plan);

  // 1. Claim it. This is the statement that decides who wins if two people tap
  //    Approve at once: only one update can match status = 'pending'.
  const { data: claimed, error: claimError } = await supabase
    .from("station_play_requests")
    .update({ status: "approved", decided_by: ownerId, decided_at: new Date().toISOString() })
    .eq("id", playRequest.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (claimError) {
    console.error("Could not claim play request:", claimError.message);
    return NextResponse.json({ error: "Could not approve that request." }, { status: 500 });
  }

  if (!claimed) {
    return NextResponse.json({ error: "Someone just answered this request." }, { status: 409 });
  }

  // From here on a failure has to undo the claim, or the request is stuck as
  // approved with nothing to show for it and the customer waits forever.
  const undoClaim = async () => {
    await supabase
      .from("station_play_requests")
      .update({ status: "pending", decided_by: null, decided_at: null })
      .eq("id", playRequest.id);
  };

  // 2. The booking. A session that is not in the books is money the owner
  //    cannot see, so this is written before the machine is touched.
  const consoleType = consoleTypeOf(stationName);
  const assignment = stationAssignmentFields(minutes, [stationName]);

  const { data: booking, error: bookingError } = await insertBooking(supabase, {
      cafe_id: playRequest.cafe_id,
      user_id: null,
      customer_name: playRequest.customer_name,
      customer_phone: playRequest.customer_phone,
      booking_date: getIndiaDateString(),
      start_time: convertTo12Hour(minutesToTimeString(getIndiaCurrentMinutes())),
      duration: minutes,
      total_amount: amount,
      status: "in-progress",
      payment_mode: playRequest.payment_method === "online" ? "upi" : "cash",
      source: "walk-in",
    });

  if (bookingError || !booking?.id) {
    console.error("Could not record the play-request booking:", bookingError?.message);
    await undoClaim();
    return NextResponse.json({ error: "Could not create the booking." }, { status: 500 });
  }

  const { error: itemError } = await supabase.from("booking_items").insert({
    booking_id: booking.id,
    console: consoleType,
    quantity: 1,
    price: amount,
    title: assignment.title,
    station_names: assignment.station_names,
  });

  if (itemError) {
    console.error("Could not record the play-request booking item:", itemError.message);
    await supabase.from("bookings").update({ status: "cancelled" }).eq("id", booking.id);
    await undoClaim();
    return NextResponse.json({ error: "Could not create the booking." }, { status: 500 });
  }

  // 3. The membership account, when one was bought.
  //
  //    This is where the customer's leftover hours will live. A day pass gets a
  //    row too, with no hours on it: it is what proves they may sit down again
  //    after a break without paying twice.
  let subscriptionId: string | null = null;

  if (plan) {
    const hours = playRequest.request_type === "membership" ? Number(plan.hours || 0) : 0;
    const validityDays = Number(plan.validity_days || 1);
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + validityDays);

    const { data: subscription, error: subscriptionError } = await supabase
      .from("subscriptions")
      .insert({
        cafe_id: playRequest.cafe_id,
        customer_name: playRequest.customer_name,
        customer_phone: playRequest.customer_phone,
        membership_plan_id: plan.id,
        hours_purchased: hours,
        hours_remaining: hours,
        is_unlimited: plan.is_unlimited === true,
        amount_paid: amount,
        expiry_date: expiry.toISOString(),
        status: "active",
        payment_mode: playRequest.payment_method === "online" ? "upi" : "cash",

        // Running from this moment. What the customer does not use comes back
        // when the session ends.
        timer_active: true,
        timer_start_time: new Date().toISOString(),
        assigned_console_station: stationName,
      })
      .select("id")
      .single();

    if (subscriptionError) {
      console.error("Could not create the subscription:", subscriptionError.message);
      await supabase.from("booking_items").delete().eq("booking_id", booking.id);
      await supabase.from("bookings").update({ status: "cancelled" }).eq("id", booking.id);
      await undoClaim();
      return NextResponse.json({ error: "Could not create the membership." }, { status: 500 });
    }

    subscriptionId = subscription?.id || null;
  }

  // 4. Unlock. The clock the customer is paying for starts here, at approval,
  //    not when they filled the form in — which may have been many minutes ago
  //    while they waited for someone to look at the dashboard.
  const sessionId = randomUUID();

  try {
    await sendStationCommands([stationName], () => ({
      action: "unlock",
      duration_seconds: minutes * 60,
      session_id: sessionId,
    }), { cafeId: playRequest.cafe_id });
  } catch (err) {
    console.error("Could not send the unlock:", err);

    // Everything is rolled back rather than left behind. A booking for a
    // session that never started is worse than no booking: it bills a customer
    // who is still sitting at a locked screen.
    if (subscriptionId) {
      await supabase.from("subscriptions").delete().eq("id", subscriptionId);
    }
    await supabase.from("booking_items").delete().eq("booking_id", booking.id);
    await supabase.from("bookings").update({ status: "cancelled" }).eq("id", booking.id);
    await undoClaim();

    return NextResponse.json(
      { error: "Could not reach that PC. Check it is on, then try again." },
      { status: 502 }
    );
  }

  await supabase
    .from("station_play_requests")
    .update({
      booking_id: booking.id,
      subscription_id: subscriptionId,
      approved_minutes: minutes,
    })
    .eq("id", playRequest.id);

  await supabase.from("station_unlock_log").insert({
    cafe_id: playRequest.cafe_id,
    station_name: stationName,
    action: "unlock",
    booking_id: booking.id,
    trigger_source: "lock_screen_request",
    staff_id: ownerId,
    booking_amount: amount,
    payment_mode: playRequest.payment_method === "online" ? "upi" : "cash",
    booking_status: "in-progress",
    duration_seconds: minutes * 60,
  });

  return NextResponse.json({
    success: true,
    status: "approved",
    bookingId: booking.id,
    subscriptionId,
    minutes,
    station: stationName,
  });
}
