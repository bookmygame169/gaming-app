import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  readStationIdentity,
  requireKnownStation,
  requireStationToken,
} from "@/lib/stationAgentAuth";
import { getIndiaDateString } from "@/lib/bookingFilters";
import { stationAssignmentFields } from "@/lib/ownerStationAssignments";

export const dynamic = "force-dynamic";

type ActiveSubscription = {
  id: string;
  hours_remaining: number | string | null;
  timer_start_time: string | null;
  membership_plan_id: string | null;
  membership_plans: { name: string | null; plan_type: string | null } | null;
};

/**
 * What the customer gets back for the time they did not use.
 *
 * Deliberately the same arithmetic as the counter's own stop-timer button, down
 * to clamping at zero: the two must agree, or a member's balance depends on
 * which button somebody happened to press.
 */
function settlementFor(subscription: ActiveSubscription, endedAt: Date) {
  const startedAt = subscription.timer_start_time
    ? new Date(subscription.timer_start_time)
    : endedAt;

  const elapsedHours = Math.max(0, (endedAt.getTime() - startedAt.getTime()) / 3_600_000);
  const before = Number(subscription.hours_remaining) || 0;

  return {
    startedAt,
    elapsedHours,
    hoursRemaining: Math.max(0, before - elapsedHours),
  };
}

/**
 * POST /api/stations/end-session
 *
 * The customer saying they have finished, from the machine they are sitting at.
 *
 * This is the half of an open-ended session that makes it worth having. A
 * membership sells hours, not a sitting: someone with a five-hour plan who
 * plays for two hours and thirteen minutes has two hours and forty-seven
 * minutes left, and they only get them back if something works out how long
 * they were actually here.
 *
 * Nothing here locks the machine. The agent does that itself the moment this
 * returns — it does not need permission, and making the lock wait on a network
 * call would leave a PC open when the café's internet is down.
 */
export async function POST(request: NextRequest) {
  try {
    const unauthorized = requireStationToken(request);
    if (unauthorized) return unauthorized;

    const body = await request.json().catch(() => ({}));
    const identity = readStationIdentity(body);
    if (!identity) {
      return NextResponse.json({ error: "cafeId and stationName are required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const unknown = await requireKnownStation(supabase, identity);
    if (unknown) return unknown;

    const endedAt = new Date();

    const settled = await settleSubscriptions(supabase, identity.cafeId, identity.stationName, endedAt);

    // At least a minute once anything settled at all. Rounding a very short
    // sitting to zero used to leave the booking claiming its full backstop -
    // five hours for a membership - and the dashboard reads a booking's
    // duration to decide whether a seat is busy, so the café would have been
    // unable to sell that machine for the rest of the block the customer had
    // already walked away from.
    const minutesPlayed = settled.count > 0 ? Math.max(1, settled.minutesPlayed) : 0;

    await completeBooking(supabase, identity.cafeId, identity.stationName, minutesPlayed);

    return NextResponse.json({
      settled: settled.count > 0,
      planName: settled.planName,
      hoursUsed: Number(settled.hoursUsed.toFixed(2)),
      hoursRemaining: Number(settled.hoursRemaining.toFixed(2)),
      isDayPass: settled.isDayPass,
    });
  } catch (err) {
    console.error("Unexpected error ending a station session:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function settleSubscriptions(
  supabase: SupabaseClient,
  cafeId: string,
  stationName: string,
  endedAt: Date
) {
  const empty = {
    count: 0,
    planName: null as string | null,
    hoursUsed: 0,
    hoursRemaining: 0,
    isDayPass: false,
    minutesPlayed: 0,
  };

  const { data, error } = await supabase
    .from("subscriptions")
    .select(`id, hours_remaining, timer_start_time, membership_plan_id,
             membership_plans(name, plan_type)`)
    .eq("cafe_id", cafeId)
    .eq("assigned_console_station", stationName)
    .eq("timer_active", true);

  if (error) {
    console.error("Could not load the running subscription:", error.message);
    return empty;
  }

  const running = (data || []) as unknown as ActiveSubscription[];
  if (running.length === 0) {
    return empty;
  }

  const result = { ...empty };

  for (const subscription of running) {
    const plan = Array.isArray(subscription.membership_plans)
      ? subscription.membership_plans[0]
      : subscription.membership_plans;

    const isDayPass = plan?.plan_type === "day_pass";
    const { startedAt, elapsedHours, hoursRemaining } = settlementFor(subscription, endedAt);

    const { error: updateError } = await supabase
      .from("subscriptions")
      .update({
        hours_remaining: hoursRemaining,
        timer_active: false,
        timer_start_time: null,
        assigned_console_station: null,
        updated_at: endedAt.toISOString(),

        // A day pass is spent once the day's sitting is over; an hours plan
        // keeps whatever is left on it for next time.
        ...(isDayPass ? { status: "expired" } : {}),
      })
      .eq("id", subscription.id)
      // Only if it is still running. Two things ending the same session at once
      // - the customer's button and the session timing out - would otherwise
      // deduct the same stretch of play twice.
      .eq("timer_active", true);

    if (updateError) {
      console.error("Could not settle the subscription:", updateError.message);
      continue;
    }

    // History second, and its failure is survivable: the balance is the thing
    // the customer cares about, and a missing history row does not change it.
    const { error: historyError } = await supabase.from("subscription_usage_history").insert({
      subscription_id: subscription.id,
      session_date: getIndiaDateString(),
      start_time: startedAt.toISOString(),
      end_time: endedAt.toISOString(),
      duration_hours: elapsedHours,
      assigned_console_station: stationName,
    });

    if (historyError) {
      console.warn("Session settled but usage history failed:", historyError.message);
    }

    result.count += 1;
    result.planName ??= plan?.name || null;
    result.isDayPass ||= isDayPass;
    result.hoursUsed += elapsedHours;
    result.hoursRemaining += hoursRemaining;
    result.minutesPlayed = Math.max(result.minutesPlayed, Math.round(elapsedHours * 60));

    console.log(
      `${stationName} ended: ${elapsedHours.toFixed(2)}h used, ${hoursRemaining.toFixed(2)}h left ` +
        `on subscription ${subscription.id}.`
    );
  }

  return result;
}

/**
 * The booking still running on this station, whoever started it.
 *
 * Sessions reach a PC by three routes - the counter, the lock screen's own Pay
 * and play, and a member scanning the QR - and only one of them leaves a
 * station_play_request behind. Matching on the station itself closes the other
 * two as well, rather than leaving their bookings showing "in progress" long
 * after the customer went home.
 */
async function inProgressBookingFor(
  supabase: SupabaseClient,
  cafeId: string,
  stationName: string
): Promise<string | null> {
  const { data } = await supabase
    .from("booking_items")
    .select("booking_id, bookings!inner(id, cafe_id, status, deleted_at, created_at)")
    .contains("station_names", [stationName])
    .eq("bookings.cafe_id", cafeId)
    .eq("bookings.status", "in-progress")
    .is("bookings.deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  return (data?.[0]?.booking_id as string | undefined) ?? null;
}

/**
 * Closes off the booking this session was started from.
 *
 * Only bookings this feature created — found through the play request that
 * produced them. A session started at the counter or from a phone belongs to
 * those flows, and reaching into their records from here would mean two places
 * deciding when a booking is finished.
 */
async function completeBooking(
  supabase: SupabaseClient,
  cafeId: string,
  stationName: string,
  minutesPlayed: number
) {
  try {
    const { data: request } = await supabase
      .from("station_play_requests")
      .select("id, booking_id, request_type")
      .eq("cafe_id", cafeId)
      .eq("station_name", stationName)
      .eq("status", "approved")
      .not("booking_id", "is", null)
      .order("decided_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // No play request means the session started somewhere else - the counter,
    // or a member scanning the QR. Those bookings need closing just the same,
    // so fall back to whatever is still in progress on this station.
    const bookingId = request?.booking_id ?? (await inProgressBookingFor(supabase, cafeId, stationName));
    const requestType = request?.request_type ?? "membership";

    if (!bookingId) {
      return;
    }

    const updates: Record<string, unknown> = { status: "completed" };

    // For a membership or day pass the stored duration was never a length
    // anybody bought — it was the backstop that stops a walked-away machine
    // sitting unlocked. Once the session really ends, what they played is the
    // truthful number. An hourly booking keeps the block they paid for.
    const rewriteDuration = requestType !== "hourly" && minutesPlayed > 0;
    if (rewriteDuration) {
      updates.duration = minutesPlayed;
    }

    const { error } = await supabase
      .from("bookings")
      .update(updates)
      .eq("id", bookingId)
      .eq("status", "in-progress");

    if (error) {
      console.warn("Could not complete the booking on session end:", error.message);
      return;
    }

    // The item's title carries the minutes too, and it is the one that counts:
    // reports read the duration out of "300|pc-01" and fall back to the
    // booking's own column only when that cannot be parsed. Leaving the title
    // alone would have every membership sitting reported at its full backstop
    // however briefly the customer actually played.
    if (rewriteDuration) {
      const { error: itemError } = await supabase
        .from("booking_items")
        .update(stationAssignmentFields(minutesPlayed, [stationName]))
        .eq("booking_id", bookingId);

      if (itemError) {
        console.warn("Could not correct the booking item on session end:", itemError.message);
      }
    }
  } catch (err) {
    console.warn("Could not complete the booking on session end:", err);
  }
}
