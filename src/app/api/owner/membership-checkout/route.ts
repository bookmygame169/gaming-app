import { NextRequest, NextResponse } from "next/server";
import { requireOwnerCafeAccess, requireOwnerContext } from "@/lib/ownerAuth";
import { awardPointsForBooking } from "@/lib/loyalty";
import { getIndiaDateString, getIndiaDateTimeParts } from "@/lib/indiaTime";
import {
  encodeAssignedStationsTitle,
  loadStationReservationState,
  reserveStations,
} from "@/lib/ownerStationAssignments";

export const dynamic = "force-dynamic";

const DAY_PASS_END_HOUR_IST = 22;
const MEMBERSHIP_LEDGER_BOOKING_DURATION_MINUTES = 60;

type CheckoutItem = {
  planId?: string;
  quantity?: number;
};

type MembershipPlanRecord = {
  id: string;
  name: string;
  price: number | null;
  hours: number | null;
  validity_days: number | null;
  plan_type: string;
  console_type: string | null;
  is_active: boolean | null;
};

function getDayPassWindow(now: Date = new Date()) {
  const parts = getIndiaDateTimeParts(now);
  const endAt = new Date(`${parts.year}-${parts.month}-${parts.day}T${String(DAY_PASS_END_HOUR_IST).padStart(2, "0")}:00:00+05:30`);
  const currentMinutes = parts.hour * 60 + parts.minute;
  const endMinutes = DAY_PASS_END_HOUR_IST * 60;
  const durationMinutes = Math.max(0, endMinutes - currentMinutes);

  return {
    durationHours: Number((durationMinutes / 60).toFixed(2)),
    durationMinutes,
    endAt,
  };
}

function toWholeRupees(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric));
}

function distributeWholeRupeeAmounts(totalAmount: number, weights: number[]): number[] {
  if (weights.length === 0) return [];

  const wholeTotal = toWholeRupees(totalAmount);
  const normalizedWeights = weights.map((weight) => Math.max(0, weight));
  const totalWeight = normalizedWeights.reduce((sum, weight) => sum + weight, 0);

  if (totalWeight <= 0) {
    const baseShare = Math.floor(wholeTotal / normalizedWeights.length);
    const remainder = wholeTotal - baseShare * normalizedWeights.length;

    return normalizedWeights.map((_, index) => baseShare + (index < remainder ? 1 : 0));
  }

  const provisional = normalizedWeights.map((weight, index) => {
    const raw = (wholeTotal * weight) / totalWeight;
    const floor = Math.floor(raw);
    return {
      floor,
      fraction: raw - floor,
      index,
    };
  });

  let remaining = wholeTotal - provisional.reduce((sum, entry) => sum + entry.floor, 0);
  provisional
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index)
    .forEach((entry) => {
      if (remaining <= 0) return;
      entry.floor += 1;
      remaining -= 1;
    });

  return provisional
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.floor);
}

export async function POST(request: NextRequest) {
  const auth = await requireOwnerContext(request);
  if (auth.response) {
    return auth.response;
  }

  const { ownerId, supabase } = auth.context;
  const body = await request.json();

  const cafeId = body?.cafe_id as string | undefined;
  const rawItems = Array.isArray(body?.items) ? (body.items as CheckoutItem[]) : [];
  const customerName = String(body?.customer_name || "").trim();
  const customerPhone = String(body?.customer_phone || "").trim();
  const paymentMode = body?.payment_mode === "upi" ? "upi" : "cash";

  if (!cafeId) {
    return NextResponse.json({ error: "cafe_id is required" }, { status: 400 });
  }

  if (!customerName) {
    return NextResponse.json({ error: "Customer name is required" }, { status: 400 });
  }

  if (!customerPhone) {
    return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
  }

  if (!/^\+?\d[\d\s\-()]{7,14}$/.test(customerPhone)) {
    return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
  }

  if (rawItems.length === 0) {
    return NextResponse.json({ error: "At least one membership plan is required" }, { status: 400 });
  }

  const accessResponse = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
  if (accessResponse) {
    return accessResponse;
  }

  const sanitizedItems = rawItems
    .map((item) => ({
      planId: String(item.planId || "").trim(),
      quantity: Math.max(0, Math.floor(Number(item.quantity || 0))),
    }))
    .filter((item) => item.planId && item.quantity > 0);

  if (sanitizedItems.length === 0) {
    return NextResponse.json({ error: "No valid membership plans were provided" }, { status: 400 });
  }

  const planIds = Array.from(new Set(sanitizedItems.map((item) => item.planId)));
  const { data: plans, error: plansError } = await supabase
    .from("membership_plans")
    .select("id, name, price, hours, validity_days, plan_type, console_type, is_active")
    .eq("cafe_id", cafeId)
    .in("id", planIds);

  if (plansError) {
    return NextResponse.json({ error: plansError.message }, { status: 500 });
  }

  const planMap = new Map((plans || []).map((plan) => [plan.id, plan as MembershipPlanRecord]));
  const purchasedUnits: MembershipPlanRecord[] = [];

  for (const item of sanitizedItems) {
    const plan = planMap.get(item.planId);
    if (!plan || plan.is_active === false) {
      return NextResponse.json({ error: "One or more selected plans are invalid" }, { status: 400 });
    }

    if (plan.plan_type !== "day_pass" && (!plan.hours || plan.hours <= 0)) {
      return NextResponse.json(
        { error: `${plan.name} is missing its configured hours` },
        { status: 400 }
      );
    }

    for (let index = 0; index < item.quantity; index += 1) {
      purchasedUnits.push(plan);
    }
  }

  const baseAmounts = purchasedUnits.map((plan) => toWholeRupees(plan.price));
  const calculatedTotal = baseAmounts.reduce((sum, amount) => sum + amount, 0);
  const requestedFinalAmount = Number(body?.final_amount);

  if (body?.final_amount !== undefined && (!Number.isFinite(requestedFinalAmount) || requestedFinalAmount < 0)) {
    return NextResponse.json({ error: "Final amount cannot be negative" }, { status: 400 });
  }

  const finalAmount = body?.final_amount !== undefined
    ? toWholeRupees(requestedFinalAmount)
    : calculatedTotal;

  const perUnitAmounts = distributeWholeRupeeAmounts(finalAmount, baseAmounts);
  const now = new Date();
  const todayStr = getIndiaDateString(now);
  const currentIndiaTime = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(now);
  const requiresAutoAssignedStations = purchasedUnits.some((plan) => plan.plan_type === "day_pass");
  const dayPassWindow = getDayPassWindow(now);

  if (requiresAutoAssignedStations && dayPassWindow.durationMinutes <= 0) {
    return NextResponse.json(
      { error: "Day pass can only be sold before 10:00 PM." },
      { status: 400 }
    );
  }

  const createdBookingIds: string[] = [];
  const createdSubscriptionIds: string[] = [];

  try {
    const reservationState = requiresAutoAssignedStations
      ? await loadStationReservationState(supabase, cafeId, todayStr, currentIndiaTime, dayPassWindow.durationMinutes)
      : null;

    for (const [index, plan] of purchasedUnits.entries()) {
      const isDayPass = plan.plan_type === "day_pass";
      const purchasedHours = isDayPass ? dayPassWindow.durationHours : Number(plan.hours || 0);
      const membershipDuration = isDayPass ? dayPassWindow.durationMinutes : Math.round(purchasedHours * 60);
      const amountPaid = toWholeRupees(perUnitAmounts[index] ?? 0);
      const expiryDate = isDayPass ? dayPassWindow.endAt : new Date(now);
      if (!isDayPass) {
        expiryDate.setDate(expiryDate.getDate() + Number(plan.validity_days || 30));
      }

      const assignedStations =
        isDayPass && reservationState
          ? reserveStations(reservationState, plan.console_type || "pc", 1)
          : [];

      const { data: subscription, error: subscriptionError } = await supabase
        .from("subscriptions")
        .insert({
          cafe_id: cafeId,
          customer_name: customerName,
          customer_phone: customerPhone,
          membership_plan_id: plan.id,
          hours_purchased: purchasedHours,
          hours_remaining: purchasedHours,
          amount_paid: amountPaid,
          payment_mode: paymentMode,
          purchase_date: now.toISOString(),
          expiry_date: expiryDate.toISOString(),
          status: "active",
          timer_active: isDayPass,
          timer_start_time: isDayPass ? now.toISOString() : null,
          assigned_console_station: assignedStations[0] || null,
        })
        .select("id")
        .single();

      if (subscriptionError || !subscription?.id) {
        throw new Error(subscriptionError?.message || "Failed to create subscription");
      }

      createdSubscriptionIds.push(subscription.id);

      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .insert({
          cafe_id: cafeId,
          customer_name: customerName,
          customer_phone: customerPhone,
          booking_date: todayStr,
          start_time: now.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
            timeZone: "Asia/Kolkata",
          }).toLowerCase(),
          // bookings.duration is constrained to normal session durations.
          // The actual membership/day-pass length lives on subscriptions and in the item title.
          duration: MEMBERSHIP_LEDGER_BOOKING_DURATION_MINUTES,
          total_amount: amountPaid,
          status: "completed",
          source: "membership",
          payment_mode: paymentMode,
        })
        .select("id")
        .single();

      if (bookingError || !booking?.id) {
        throw new Error(bookingError?.message || "Failed to create membership booking");
      }

      createdBookingIds.push(booking.id);

      const { error: bookingItemError } = await supabase
        .from("booking_items")
        .insert({
          booking_id: booking.id,
          console: plan.console_type || "pc",
          quantity: 1,
          price: amountPaid,
          title: encodeAssignedStationsTitle(membershipDuration, assignedStations),
        });

      if (bookingItemError) {
        throw new Error(bookingItemError.message);
      }
    }

    // Buying a membership is money spent at the café on that day, so it counts
    // towards the day's loyalty threshold like any other completed booking.
    // Awarding is capped at once per day by the ledger's index, so several
    // plans bought together still earn one day's points.
    for (const createdBookingId of createdBookingIds) {
      await awardPointsForBooking(supabase, {
        id: createdBookingId,
        cafe_id: cafeId,
        customer_phone: customerPhone,
        user_id: null,
        booking_date: todayStr,
      });
    }

    return NextResponse.json({
      success: true,
      createdSubscriptions: createdSubscriptionIds.length,
      createdBookings: createdBookingIds.length,
    });
  } catch (err: unknown) {
    if (createdBookingIds.length > 0) {
      await supabase.from("booking_items").delete().in("booking_id", createdBookingIds);
      await supabase.from("bookings").delete().in("id", createdBookingIds);
    }

    if (createdSubscriptionIds.length > 0) {
      await supabase.from("subscriptions").delete().in("id", createdSubscriptionIds);
    }

    const message = err instanceof Error ? err.message : "Failed to complete membership checkout";
    const status = /occupied|available|configured|station/i.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
