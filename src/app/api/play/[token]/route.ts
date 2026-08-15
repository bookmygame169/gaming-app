import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser } from "@/lib/userAuth";
import { phoneKey } from "@/lib/loyalty";
import { getWalletBalance, toRupees } from "@/lib/wallet";
import { sendStationCommands } from "@/lib/stationCommands";
import { getIndiaDateString } from "@/lib/bookingFilters";
import { buildAndroidUpiChooserUrl, buildUpiAppOptions, buildUpiPaymentUrl, getCafePayee } from "@/lib/upi";
import { getIndiaCurrentMinutes } from "@/lib/bookingFilters";
import { minutesToTimeString, convertTo12Hour } from "@/lib/timeUtils";
import { encodeAssignedStationsTitle } from "@/lib/ownerStationAssignments";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ token: string }> };

/** A station is considered reachable if it reported in this recently. */
const ONLINE_WITHIN_SECONDS = 90;

/** pc-01 -> pc, ps5-02 -> ps5. Matches how console_pricing is keyed. */
function consoleTypeOf(stationName: string): string {
  const prefix = stationName.split("-")[0]?.toLowerCase() || "";
  return prefix === "ps5" ? "ps5" : "pc";
}

type PricingRow = {
  duration_minutes: number;
  price: number | string | null;
  quantity: number | string | null;
};

/**
 * One seat on a lock-screen PC is quantity 1. Owner prices are stored per
 * player-count as well as duration, so reading every row and calling
 * maybeSingle() on a duration blows up the moment a café has a 2-player price.
 *
 * Prefer quantity 1; if that row is missing, take the lowest quantity that
 * exists for that duration so the phone still has something to charge.
 */
function priceForSingleStation(rows: PricingRow[], durationMinutes?: number): number | null {
  const matching = rows.filter((row) =>
    durationMinutes === undefined ? true : Number(row.duration_minutes) === durationMinutes
  );
  if (matching.length === 0) return null;

  const qtyOne = matching.find((row) => Number(row.quantity) === 1);
  const chosen = qtyOne || [...matching].sort((a, b) => Number(a.quantity) - Number(b.quantity))[0];
  return toRupees(chosen.price);
}

function durationOptions(rows: PricingRow[]): { durationMinutes: number; price: number }[] {
  const byDuration = new Map<number, number>();

  const ordered = [...rows].sort((a, b) => {
    const qtyDiff = Number(a.quantity || 99) - Number(b.quantity || 99);
    if (qtyDiff !== 0) return qtyDiff;
    return Number(a.duration_minutes) - Number(b.duration_minutes);
  });

  for (const row of ordered) {
    const duration = Number(row.duration_minutes);
    if (!Number.isFinite(duration) || duration <= 0) continue;
    if (byDuration.has(duration)) continue;
    byDuration.set(duration, toRupees(row.price));
  }

  return [...byDuration.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([durationMinutes, price]) => ({ durationMinutes, price }));
}

/**
 * Reads a token without spending it.
 *
 * Deliberately separate from claiming. The phone loads this page before the
 * customer has decided anything, and burning the code just for looking would
 * mean a moment's hesitation costs them a walk back to the screen.
 */
async function peekToken(supabase: ReturnType<typeof getSupabaseAdmin>, token: string) {
  const { data } = await supabase
    .from("station_unlock_tokens")
    .select("cafe_id, station_name, expires_at, redeemed_at")
    .eq("token", token)
    .maybeSingle();

  if (!data) return { error: "This code is not valid. Scan the screen again." };
  if (data.redeemed_at) return { error: "This code has already been used. Scan the screen again." };
  if (new Date(data.expires_at).getTime() < Date.now()) {
    return { error: "This code has expired. Scan the screen again." };
  }

  return { station: data };
}

/** How much unused, unexpired membership time this customer holds here. */
async function planHoursFor(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  cafeId: string,
  phone: string | null
) {
  const key = phoneKey(phone);
  if (!key) return { hours: 0, rows: [] as { id: string; hours_remaining: number }[] };

  const { data } = await supabase
    .from("subscriptions")
    .select("id, customer_phone, hours_remaining, status, expiry_date")
    .eq("cafe_id", cafeId);

  const today = getIndiaDateString();

  // Filtered in JS on the last ten digits, never with .eq(): customer_phone
  // holds whatever was typed over the years — with +91, with spaces, without.
  const usable = (data || [])
    .filter((row) => phoneKey(row.customer_phone as string | null) === key)
    .filter((row) => (row.status || "").toLowerCase() === "active")
    .filter((row) => !row.expiry_date || String(row.expiry_date) >= today)
    .map((row) => ({ id: row.id as string, hours_remaining: Number(row.hours_remaining) || 0 }))
    .filter((row) => row.hours_remaining > 0);

  return {
    hours: usable.reduce((sum, row) => sum + row.hours_remaining, 0),
    rows: usable,
  };
}

/**
 * How long a pending session counts for.
 *
 * The same ten minutes the phone waits before telling the customer to go and
 * ask, and for the same reason: past that they have given up, walked off, or
 * been served at the counter. Anything older is abandoned.
 *
 * Without this the guard against duplicate bookings became a lock on the
 * machine. A session left pending from an hour earlier was still "a payment in
 * progress", so scanning returned that dead session instead of the duration
 * options, and there was no way to start a new one - the fix for double
 * booking stopped anybody booking at all.
 */
const PENDING_COUNTS_FOR_MINUTES = 10;

/**
 * A payment already waiting on this machine, if there is one.
 *
 * Found through the code that was scanned, which is the only thing tying a
 * booking to a station: nobody chose a seat from a list, so there is no station
 * on the booking itself.
 */
async function findPendingSession(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  cafeId: string,
  stationName: string
) {
  const { data: tokens } = await supabase
    .from("station_unlock_tokens")
    .select("booking_id, duration_minutes, created_at")
    .eq("cafe_id", cafeId)
    .eq("station_name", stationName)
    .not("booking_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(20);

  const cutoff = Date.now() - PENDING_COUNTS_FOR_MINUTES * 60_000;

  for (const row of tokens || []) {
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, user_id, status, total_amount, created_at")
      .eq("id", row.booking_id)
      .maybeSingle();

    if (!booking || (booking.status || "").toLowerCase() !== "pending") {
      continue;
    }

    const startedAt = booking.created_at ? new Date(booking.created_at).getTime() : 0;

    if (startedAt < cutoff) {
      // Long abandoned. Closed here rather than left, so it stops holding the
      // machine and stops appearing on the owner's list of payments to check
      // for money that never arrived.
      await supabase.from("bookings").update({ status: "cancelled" }).eq("id", booking.id);
      await supabase
        .from("booking_payment_claims")
        .update({ status: "rejected", note: "Abandoned — no payment confirmed" })
        .eq("booking_id", booking.id)
        .eq("status", "claimed");
      continue;
    }

    return {
      bookingId: booking.id as string,
      userId: booking.user_id as string,
      amount: toRupees(booking.total_amount),
      durationMinutes: Number(row.duration_minutes) || 0,
    };
  }

  return null;
}

/**
 * GET — what the customer's phone shows after scanning.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { token } = await params;
    const { userId, response: authResponse } = await requireUser(request);
    if (authResponse) return authResponse;

    const supabase = getSupabaseAdmin();
    const peek = await peekToken(supabase, token);
    if (peek.error) return NextResponse.json({ error: peek.error }, { status: 410 });

    const station = peek.station!;

    const [{ data: profile }, { data: cafe }, { data: live }, { data: prices }] =
      await Promise.all([
        supabase.from("profiles").select("phone").eq("id", userId).maybeSingle(),
        supabase.from("cafes").select("name").eq("id", station.cafe_id).maybeSingle(),
        supabase
          .from("station_status")
          .select("status, last_seen_at")
          .eq("cafe_id", station.cafe_id)
          .eq("station_name", station.station_name)
          .maybeSingle(),
        supabase
          .from("console_pricing")
          .select("duration_minutes, price, quantity")
          .eq("cafe_id", station.cafe_id)
          .eq("console_type", consoleTypeOf(station.station_name))
          .order("quantity", { ascending: true })
          .order("duration_minutes", { ascending: true }),
      ]);

    const phone = profile?.phone?.trim() || null;
    const [walletBalance, plan] = await Promise.all([
      getWalletBalance(supabase, station.cafe_id, phone),
      planHoursFor(supabase, station.cafe_id, phone),
    ]);

    const secondsSinceSeen = live?.last_seen_at
      ? Math.floor((Date.now() - new Date(live.last_seen_at).getTime()) / 1000)
      : Number.MAX_SAFE_INTEGER;

    return NextResponse.json({
      station: station.station_name,
      cafeName: cafe?.name || "the café",
      online: secondsSinceSeen <= ONLINE_WITHIN_SECONDS,
      alreadyUnlocked: (live?.status || "").toLowerCase() === "unlocked",
      walletBalance,
      planHours: Number(plan.hours.toFixed(2)),
      options: durationOptions((prices || []) as PricingRow[]),
    });
  } catch (err) {
    console.error("Unexpected error reading play token:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST — pay for and start a session on the station this code came from.
 *
 * The order of what follows is the whole point of this route, so it is worth
 * stating: everything that can refuse is checked before anything is spent, the
 * booking is written before the QR is claimed (so a failed save does not burn
 * the code), and the money is only kept if the machine confirms it can be told
 * to unlock.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { token } = await params;
    const { userId, response: authResponse } = await requireUser(request);
    if (authResponse) return authResponse;

    const body = await request.json().catch(() => ({}));
    const durationMinutes = Number(body.durationMinutes);
    const method = body.method === "upi" ? "upi" : "wallet";
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      return NextResponse.json({ error: "Choose how long you want to play" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const peek = await peekToken(supabase, token);
    if (peek.error) return NextResponse.json({ error: peek.error }, { status: 410 });
    const station = peek.station!;

    // 1. Is the machine actually able to be unlocked? Taking money for a PC
    //    that cannot hear us is the single worst outcome here.
    const { data: live } = await supabase
      .from("station_status")
      .select("status, last_seen_at")
      .eq("cafe_id", station.cafe_id)
      .eq("station_name", station.station_name)
      .maybeSingle();

    const secondsSinceSeen = live?.last_seen_at
      ? Math.floor((Date.now() - new Date(live.last_seen_at).getTime()) / 1000)
      : Number.MAX_SAFE_INTEGER;

    if (secondsSinceSeen > ONLINE_WITHIN_SECONDS) {
      return NextResponse.json(
        { error: "That PC is not responding right now. Please ask at the counter." },
        { status: 409 }
      );
    }

    // 2. What does this cost? Read from the café's own price list rather than
    //    anything the phone sent, so a edited request cannot set its own price.
    //    Quantity 1 only: this is one physical station, not a multi-player row.
    const { data: priceRows, error: priceError } = await supabase
      .from("console_pricing")
      .select("price, quantity, duration_minutes")
      .eq("cafe_id", station.cafe_id)
      .eq("console_type", consoleTypeOf(station.station_name))
      .eq("duration_minutes", durationMinutes);

    if (priceError) {
      console.error("Could not read station price:", priceError.message);
      return NextResponse.json({ error: "Could not start the session" }, { status: 500 });
    }

    const price = priceForSingleStation((priceRows || []) as PricingRow[], durationMinutes);
    if (price === null) {
      return NextResponse.json({ error: "That length is not available here" }, { status: 400 });
    }

    // 3. Can they afford it, and with what?
    const { data: profile } = await supabase
      .from("profiles")
      .select("phone, first_name, last_name")
      .eq("id", userId)
      .maybeSingle();

    const phone = profile?.phone?.trim() || null;
    if (!phoneKey(phone)) {
      return NextResponse.json(
        { error: "Add your phone number to your profile first — your balance is held against it." },
        { status: 400 }
      );
    }

    const cafeForPayee = (await supabase
          .from("cafes")
          .select("name, upi_id, upi_display_name")
          .eq("id", station.cafe_id)
          .maybeSingle()).data;

    if (method === "upi") {
      const payee = cafeForPayee ? getCafePayee(cafeForPayee) : null;
      if (!payee) {
        return NextResponse.json(
          { error: "This café has not set up UPI payments. Please ask at the counter." },
          { status: 409 }
        );
      }
    }

    const plan = await planHoursFor(supabase, station.cafe_id, phone);
    const hoursWanted = durationMinutes / 60;

    // Plan hours first: they are already paid for, and a member who watched
    // their wallet drain while holding unused hours would rightly complain.
    const hoursFromPlan = Math.min(plan.hours, hoursWanted);
    const remainingShare = hoursWanted > 0 ? (hoursWanted - hoursFromPlan) / hoursWanted : 0;

    // Whole rupees: wallet_ledger.amount is an integer, deliberately, so that a
    // wallet cannot disagree with the bill it pays. A part-plan session rounds
    // to the nearest rupee rather than being refused for having 50 paise in it.
    const cashNeeded = Math.round(price * remainingShare);

    const walletBalance = await getWalletBalance(supabase, station.cafe_id, phone);

    if (method === "wallet" && cashNeeded > walletBalance) {
      return NextResponse.json(
        {
          error: "Not enough balance",
          needed: cashNeeded,
          walletBalance,
          planHours: plan.hours,
        },
        { status: 402 }
      );
    }

    // 3b. Is somebody already part-way through paying for this machine?
    //
    //     A failed UPI payment used to leave a pending booking behind, and the
    //     natural response - scan again, try again - made a second one. One
    //     customer ended up with three pending bookings for the same PC inside
    //     a quarter of an hour, and the owner with three payments to reconcile
    //     against one seat.
    //
    //     Their own is handed back rather than refused. Refusing would be
    //     correct and useless: the payment they are retrying is the one that
    //     failed, and telling them they already have one is telling them to
    //     give up.
    const existing = await findPendingSession(supabase, station.cafe_id, station.station_name);

    if (existing && existing.userId === userId) {
      const payee = cafeForPayee ? getCafePayee(cafeForPayee) : null;

      return NextResponse.json({
        pending: true,
        resumed: true,
        bookingId: existing.bookingId,
        station: station.station_name,
        durationMinutes: existing.durationMinutes || durationMinutes,
        amount: existing.amount,
        upi: payee
          ? {
              payeeName: payee.displayName,
              payeeUpiId: payee.upiId,
              url: buildUpiPaymentUrl(payee, existing.amount, existing.bookingId, cafeForPayee?.name),
              chooserUrl: buildAndroidUpiChooserUrl(payee, existing.amount, existing.bookingId, cafeForPayee?.name),
              apps: buildUpiAppOptions(payee, existing.amount, existing.bookingId, cafeForPayee?.name),
            }
          : null,
      });
    }

    if (existing) {
      // Someone else's. Two people paying for one seat is worse than one of
      // them waiting a few minutes for the other to be confirmed or rejected.
      return NextResponse.json(
        { error: "Someone is already paying for this PC. Please ask at the counter." },
        { status: 409 }
      );
    }

    // 4. Record the session first, then claim the code.
    //
    //    Claiming first burned the QR even when the booking insert failed
    //    (missing duration, price lookup error, etc.), so a customer who
    //    tapped Pay was told "this code has already been used" and still had
    //    no session. The booking is unpaid until later, so a failed claim
    //    just cancels it.
    const sessionId = `qr-${userId.slice(0, 8)}-${Date.now()}`;
    const customerName =
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() || null;
    const startTime = convertTo12Hour(minutesToTimeString(getIndiaCurrentMinutes()));
    const stationTitle = encodeAssignedStationsTitle(durationMinutes, [station.station_name]);

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert({
        cafe_id: station.cafe_id,
        user_id: userId,
        customer_name: customerName,
        customer_phone: phone,
        booking_date: getIndiaDateString(),
        start_time: startTime,
        duration: durationMinutes,
        total_amount: price,
        status: method === "upi" ? "pending" : "confirmed",
        payment_mode: method,
        source: "qr",
      })
      .select("id")
      .single();

    if (bookingError || !booking?.id) {
      console.error("Could not record the QR booking:", bookingError?.message);
      return NextResponse.json({ error: "Could not start the session" }, { status: 500 });
    }

    const { error: itemError } = await supabase.from("booking_items").insert({
      booking_id: booking.id,
      console: consoleTypeOf(station.station_name),
      quantity: 1,
      price,
      title: stationTitle,
    });

    if (itemError) {
      console.error("Could not record the QR booking item:", itemError.message);
      await supabase.from("bookings").update({ status: "cancelled" }).eq("id", booking.id);
      return NextResponse.json({ error: "Could not start the session" }, { status: 500 });
    }

    // One statement in the database, so two scans of the same screen cannot
    // both get through. Happens after the booking exists so a failed save
    // does not spend the code.
    const { data: claimed, error: claimError } = await supabase.rpc("claim_unlock_token", {
      p_token: token,
      p_user_id: userId,
    });

    if (claimError) {
      console.error("claim_unlock_token failed:", claimError.message);
      await supabase.from("booking_items").delete().eq("booking_id", booking.id);
      await supabase.from("bookings").update({ status: "cancelled" }).eq("id", booking.id);
      return NextResponse.json({ error: "Could not start the session" }, { status: 500 });
    }

    if (!claimed || (Array.isArray(claimed) && claimed.length === 0)) {
      await supabase.from("booking_items").delete().eq("booking_id", booking.id);
      await supabase.from("bookings").update({ status: "cancelled" }).eq("id", booking.id);
      return NextResponse.json(
        { error: "This code has just been used. Scan the screen again." },
        { status: 410 }
      );
    }

    const tokenId = Array.isArray(claimed) ? claimed[0].token_id : null;

    // Record what this session was for. The request that takes a UPI payment is
    // long gone by the time the owner confirms it, so the station, the booking
    // and the length have to survive without it.
    if (tokenId) {
      await supabase
        .from("station_unlock_tokens")
        .update({ booking_id: booking.id, duration_minutes: durationMinutes })
        .eq("id", tokenId);
    }

    if (method === "upi") {
      const payee = getCafePayee(cafeForPayee!)!;

      await supabase.from("station_unlock_log").insert({
        cafe_id: station.cafe_id,
        station_name: station.station_name,
        action: "unlock",
        trigger_source: "qr-upi-pending",
        booking_id: booking.id,
        booking_amount: price,
        booking_status: "pending",
        duration_seconds: Math.round(durationMinutes * 60),
        payment_mode: "upi",
      });

      // Nothing is unlocked here. The customer pays their bank, the owner sees
      // it arrive and confirms, and that confirmation is what starts the
      // session - see PUT /api/owner/payments.
      return NextResponse.json({
        pending: true,
        bookingId: booking.id,
        station: station.station_name,
        durationMinutes,
        amount: price,
        upi: {
          payeeName: payee.displayName,
          payeeUpiId: payee.upiId,
          url: buildUpiPaymentUrl(payee, price, booking.id, cafeForPayee?.name),
          // Android's own "open with" sheet, listing every UPI app on the phone.
          // The plain upi:// link above goes straight to whichever app claimed
          // it as the default - WhatsApp, on a lot of handsets - and a
          // hand-written list of four can never include whatever the customer
          // actually banks with.
          chooserUrl: buildAndroidUpiChooserUrl(payee, price, booking.id, cafeForPayee?.name),
          apps: buildUpiAppOptions(payee, price, booking.id, cafeForPayee?.name),
        },
      });
    }

    // 6. Take the payment, wallet first.
    //
    //    Order matters here and it used to be the other way round. Plan hours
    //    were deducted, then the wallet spend was attempted - and the wallet is
    //    the one that can be refused, by a database trigger, even after the
    //    balance was checked a moment earlier. A member who was short then lost
    //    plan hours and got no session for them. Taking the refusable thing
    //    first means the only way to lose is one nobody notices: the café
    //    honouring a discount whose hours were never taken.
    if (cashNeeded > 0) {
      const { error: spendError } = await supabase.from("wallet_ledger").insert({
        cafe_id: station.cafe_id,
        customer_phone: phoneKey(phone),
        user_id: userId,
        amount: -cashNeeded,
        reason: "spend",
        booking_id: booking.id,
        note: `${station.station_name.toUpperCase()} — ${durationMinutes} minutes`,
      });

      if (spendError) {
        console.error("Wallet spend refused:", spendError.message);
        await supabase.from("bookings").update({ status: "cancelled" }).eq("id", booking.id);
        return NextResponse.json(
          { error: "Not enough balance. Please top up at the counter." },
          { status: 402 }
        );
      }
    }

    let hoursLeftToTake = hoursFromPlan;
    for (const row of plan.rows) {
      if (hoursLeftToTake <= 0) break;
      const take = Math.min(row.hours_remaining, hoursLeftToTake);
      await supabase
        .from("subscriptions")
        .update({ hours_remaining: Math.round((row.hours_remaining - take) * 100) / 100 })
        .eq("id", row.id);
      hoursLeftToTake -= take;
    }

    // 7. Unlock. If this is the step that fails, the money goes back — the
    //    customer is standing in front of a locked PC either way, and the only
    //    thing worse is being charged for it.
    try {
      await sendStationCommands([station.station_name], () => ({
        action: "unlock",
        duration_seconds: Math.round(durationMinutes * 60),
        session_id: sessionId,
      }));
    } catch (err) {
      console.error("QR unlock publish failed, refunding:", err);

      if (cashNeeded > 0) {
        await supabase.from("wallet_ledger").insert({
          cafe_id: station.cafe_id,
          customer_phone: phoneKey(phone),
          user_id: userId,
          amount: cashNeeded,
          reason: "refund",
          booking_id: booking.id,
          note: `${station.station_name.toUpperCase()} did not unlock`,
        });
      }

      // plan.rows holds what each subscription had BEFORE the deduction, so
      // writing those values back restores them exactly. Same rows, same order,
      // so only the ones actually touched are rewritten.
      let hoursToReturn = hoursFromPlan;
      for (const row of plan.rows) {
        if (hoursToReturn <= 0) break;
        await supabase
          .from("subscriptions")
          .update({ hours_remaining: row.hours_remaining })
          .eq("id", row.id);
        hoursToReturn -= Math.min(row.hours_remaining, hoursToReturn);
      }

      await supabase
        .from("bookings")
        .update({ status: "cancelled" })
        .eq("id", booking.id);

      return NextResponse.json(
        { error: "Could not reach that PC. Nothing has been charged — please ask at the counter." },
        { status: 502 }
      );
    }

    await supabase.from("station_unlock_log").insert({
      cafe_id: station.cafe_id,
      station_name: station.station_name,
      action: "unlock",
      trigger_source: "qr",
      booking_id: booking.id,
      booking_amount: price,
      booking_status: "confirmed",
      duration_seconds: Math.round(durationMinutes * 60),
      payment_mode: hoursFromPlan > 0 ? (cashNeeded > 0 ? "plan+wallet" : "plan") : "wallet",
    });

    return NextResponse.json({
      success: true,
      station: station.station_name,
      durationMinutes,
      chargedFromWallet: cashNeeded,
      chargedFromPlanHours: Number(hoursFromPlan.toFixed(2)),
      walletBalance: Math.round((walletBalance - cashNeeded) * 100) / 100,
    });
  } catch (err) {
    console.error("Unexpected error redeeming play token:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
