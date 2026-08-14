import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/userAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendBookingConfirmation } from "@/lib/email";
import { CONSOLE_LABELS } from "@/lib/constants";
import { bookingRateLimiter, enforceRateLimit } from "@/lib/ratelimit";
import {
  getIndiaDateString,
  getIndiaCurrentMinutes,
  parseBookingStartMinutes,
} from "@/lib/bookingFilters";
import { determinePriceForTier, calculateConsoleMaxQuantity } from "@/lib/ticketService";
import {
  encodeAssignedStationsTitle,
  findConflictingStations,
  loadStationReservationState,
  reserveStations,
} from "@/lib/ownerStationAssignments";
import { syncStationsForBooking } from "@/lib/stationSync";
import { getOpeningWindow, sessionFitsOpeningHours } from "@/lib/openingHours";
import { getWalletBalance, isMissingWalletTable, toRupees } from "@/lib/wallet";
import type { ConsoleId } from "@/lib/constants";
import type { ConsolePricingTier } from "@/types/booking";

export const dynamic = "force-dynamic";

/**
 * POST /api/bookings — a customer places their own booking.
 *
 * This exists as a server route for three reasons, each of which was a real
 * defect when the browser wrote to the database directly:
 *
 * 1. The ISP the cafés run on blocks Supabase, so a client-side insert simply
 *    fails. Every write has to go through this origin.
 * 2. The price arrived from sessionStorage, which anyone can edit. Prices are
 *    recalculated here from console_pricing and the client's figure ignored.
 * 3. No machine was reserved, so two people could book the last PC, and the
 *    lock agent never learned an online booking existed — the customer arrived
 *    to a locked screen.
 */

const VALID_DURATIONS = new Set([30, 60, 90]);

type ItemPayload = { console: string; quantity: number };

type CafeRow = {
  id: string;
  name: string;
  is_active: boolean | null;
  hourly_price: number | null;
  opening_hours: string | null;
} & Record<string, unknown>;

const COUNT_FIELD: Record<string, string> = {
  ps5: "ps5_count",
  ps4: "ps4_count",
  xbox: "xbox_count",
  pc: "pc_count",
  pool: "pool_count",
  snooker: "snooker_count",
  arcade: "arcade_count",
  vr: "vr_count",
  steering: "steering_wheel_count",
  racing_sim: "racing_sim_count",
};

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await enforceRateLimit(
      request,
      bookingRateLimiter,
      10,
      10 * 60 * 1000
    );
    if (rateLimitResponse) return rateLimitResponse;

    const { userId, response: authResponse } = await requireUser(request);
    if (authResponse) return authResponse;

    const body = await request.json().catch(() => ({}));
    const { cafeId, bookingDate, startTime, couponCode } = body;
    const durationMinutes = Number(body.durationMinutes);

    // ------------------------------------------------------------- validation

    if (!cafeId || typeof cafeId !== "string") {
      return NextResponse.json({ error: "Which café is this for?" }, { status: 400 });
    }

    if (typeof bookingDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
      return NextResponse.json({ error: "Pick a date." }, { status: 400 });
    }

    // The booking page sends the slot label ("6:00 PM"), while the owner side
    // sends "18:00". The shared parser reads both; a 12-hour-only reader would
    // see 6 PM as 6 AM and reject the booking as already past.
    const startMinutes =
      typeof startTime === "string" ? parseBookingStartMinutes(startTime) : null;
    if (startMinutes === null) {
      return NextResponse.json({ error: "Pick a start time." }, { status: 400 });
    }

    if (!VALID_DURATIONS.has(durationMinutes)) {
      return NextResponse.json({ error: "Pick how long you want to play." }, { status: 400 });
    }

    // A slot that has already gone is refused here as well as hidden in the UI.
    // A page left open in a tab still offers this morning's slots.
    const today = getIndiaDateString();
    if (bookingDate < today) {
      return NextResponse.json({ error: "That date has already passed." }, { status: 400 });
    }
    if (bookingDate === today && startMinutes <= getIndiaCurrentMinutes()) {
      return NextResponse.json(
        { error: "That time has already passed. Pick a later slot." },
        { status: 400 }
      );
    }

    const rawItems: ItemPayload[] = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length === 0) {
      return NextResponse.json({ error: "Choose at least one console." }, { status: 400 });
    }
    if (rawItems.length > 10) {
      return NextResponse.json({ error: "That is too many rows for one booking." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // ------------------------------------------------------------------- café

    const { data: cafeRow, error: cafeError } = await supabase
      .from("cafes")
      .select(
        "id, name, is_active, hourly_price, opening_hours, ps5_count, ps4_count, xbox_count, pc_count, " +
          "pool_count, snooker_count, arcade_count, vr_count, steering_wheel_count, racing_sim_count"
      )
      .eq("id", cafeId)
      .maybeSingle();

    // The generated types do not narrow a long select string, so the shape is
    // stated once here rather than cast at every use below.
    const cafe = cafeRow as CafeRow | null;

    if (cafeError) {
      console.error("Booking: café lookup failed:", cafeError.message);
      return NextResponse.json({ error: "Could not load the café." }, { status: 500 });
    }

    if (!cafe || cafe.is_active === false) {
      return NextResponse.json({ error: "This café is not taking bookings." }, { status: 404 });
    }

    // The whole session has to fit inside opening hours, not just its start.
    // The slot grid already hides impossible starts, but duration is chosen
    // after the time, so a 90-minute session can still overrun closing.
    const openingWindow = getOpeningWindow(cafe.opening_hours);
    if (!sessionFitsOpeningHours(openingWindow, startMinutes, durationMinutes)) {
      return NextResponse.json(
        { error: "That session would run past closing time. Try a shorter one or an earlier slot." },
        { status: 400 }
      );
    }

    const { data: pricingRows } = await supabase
      .from("console_pricing")
      .select("*")
      .eq("cafe_id", cafe.id);

    const pricingByConsole = new Map<string, ConsolePricingTier>();
    for (const row of pricingRows ?? []) {
      pricingByConsole.set(String(row.console_type), row as ConsolePricingTier);
    }

    const fallbackPrice = Number(cafe.hourly_price) || 100;

    // -------------------------------------------------- price, server-side only

    const pricedItems: Array<{ console: string; quantity: number; price: number }> = [];
    let serverTotal = 0;

    for (const raw of rawItems) {
      const consoleId = String(raw.console || "").trim().toLowerCase();
      const quantity = Math.round(Number(raw.quantity) || 0);

      const countField = COUNT_FIELD[consoleId];
      if (!countField) {
        return NextResponse.json({ error: `Unknown console: ${consoleId}` }, { status: 400 });
      }

      const cafeHas = Number(cafe[countField] ?? 0);
      if (cafeHas <= 0) {
        return NextResponse.json(
          { error: `This café does not have ${consoleId.toUpperCase()}.` },
          { status: 400 }
        );
      }

      const maxQuantity = Math.min(calculateConsoleMaxQuantity(consoleId as ConsoleId), cafeHas);
      if (quantity < 1 || quantity > maxQuantity) {
        return NextResponse.json(
          { error: `You can book 1 to ${maxQuantity} ${consoleId.toUpperCase()} at a time.` },
          { status: 400 }
        );
      }

      // The client sends what it wants, never what it costs.
      const price = Math.round(
        determinePriceForTier(
          pricingByConsole.get(consoleId) ?? null,
          quantity,
          durationMinutes as 30 | 60 | 90,
          fallbackPrice,
          consoleId as ConsoleId
        )
      );

      pricedItems.push({ console: consoleId, quantity, price });
      serverTotal += price;
    }

    // ------------------------------------------------------------- reserve kit

    let reservationState;
    try {
      reservationState = await loadStationReservationState(
        supabase,
        cafe.id,
        bookingDate,
        startTime,
        durationMinutes,
        null
      );
    } catch (err) {
      console.error("Booking: could not read station state:", err);
      return NextResponse.json({ error: "Could not check what is free." }, { status: 500 });
    }

    const itemsWithStations: Array<{
      console: string;
      quantity: number;
      price: number;
      stations: string[];
    }> = [];

    for (const item of pricedItems) {
      try {
        const stations = reserveStations(reservationState, item.console, item.quantity);
        itemsWithStations.push({ ...item, stations });
      } catch (err) {
        // reserveStations throws a message already written for a person.
        const message = err instanceof Error ? err.message : "That slot is no longer free.";
        return NextResponse.json({ error: message }, { status: 409 });
      }
    }

    // ----------------------------------------------------------------- coupon

    let coupon: { id: string; code: string; discount: number; bonusMinutes: number } | null = null;

    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name, phone")
      .eq("id", userId)
      .maybeSingle();

    const customerPhone = profile?.phone?.trim() || null;
    const customerName =
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() || null;

    if (typeof couponCode === "string" && couponCode.trim()) {
      // Revalidated here even though the browser already checked it: the
      // browser's answer is a suggestion, and the discount is money.
      const { data: couponRows, error: couponError } = await supabase.rpc("validate_coupon", {
        p_code: couponCode.trim(),
        p_cafe_id: cafe.id,
        p_order_amount: serverTotal,
        p_user_phone: customerPhone || undefined,
      });

      const result = Array.isArray(couponRows) ? couponRows[0] : null;

      if (couponError || !result?.is_valid) {
        return NextResponse.json(
          { error: result?.error_message || "That coupon cannot be used." },
          { status: 400 }
        );
      }

      let discount =
        result.discount_type === "percentage"
          ? (serverTotal * Number(result.discount_value)) / 100
          : Number(result.discount_value);

      if (result.discount_type === "percentage" && result.max_discount_amount) {
        discount = Math.min(discount, Number(result.max_discount_amount));
      }

      coupon = {
        id: result.coupon_id,
        code: couponCode.trim().toUpperCase(),
        discount: Math.round(Math.min(Math.max(0, discount), serverTotal)),
        bonusMinutes: Number(result.bonus_minutes) || 0,
      };
    }

    const finalAmount = Math.max(0, serverTotal - (coupon?.discount ?? 0));

    // ------------------------------------------------------------------ wallet
    //
    // Money the customer has already paid this café. Paying from it needs no
    // verification by anyone: the café was paid when the wallet was topped up,
    // so there is nothing left to confirm and the session can start on time.
    //
    // The amount is decided here, never sent by the client. A wallet that
    // deducts whatever a browser asks for is not a wallet.
    let walletUsed = 0;

    if (body.useWallet === true && customerPhone && finalAmount > 0) {
      const balance = await getWalletBalance(supabase, cafe.id, customerPhone);
      // Partial is fine and common: ₹200 in the wallet against a ₹300 session
      // pays what it can and the rest is settled at the counter.
      walletUsed = Math.max(0, Math.min(toRupees(balance), finalAmount));
    }

    const payableAtVenue = finalAmount - walletUsed;

    // ------------------------------------------------------------------ write

    const { data: newBooking, error: bookingError } = await supabase
      .from("bookings")
      .insert({
        cafe_id: cafe.id,
        user_id: userId,
        booking_date: bookingDate,
        start_time: startTime,
        // Previously left unset, so every online booking looked like 60
        // minutes to availability, auto-complete and the lock agent.
        duration: durationMinutes + (coupon?.bonusMinutes ?? 0),
        // The session price, whatever paid for it. The wallet moving money is
        // recorded in its own ledger; overwriting this would make the café's
        // revenue reports disagree with what was actually charged.
        total_amount: finalAmount,
        status: "confirmed",
        source: "online",
        // Only "wallet" when the wallet covered all of it. A part-paid booking
        // still has cash to collect, and calling it paid would tell staff to
        // wave someone through.
        payment_mode: walletUsed >= finalAmount && walletUsed > 0 ? "wallet" : "cash",
        // Loyalty and membership are matched on the phone number, so an online
        // booking without one silently earns nothing.
        customer_name: customerName,
        customer_phone: customerPhone,
        // The columns that actually exist on this table are coupon_code and
        // discount_amount. Bonus minutes have no column and do not need one:
        // they are already folded into duration above, which is what every
        // reader — availability, auto-complete, the lock agent — goes by.
        coupon_code: coupon?.code ?? null,
        discount_amount: coupon?.discount ?? 0,
      })
      .select("id")
      .maybeSingle();

    if (bookingError || !newBooking) {
      console.error("Booking insert failed:", bookingError?.message);

      // 42703 is an unknown column: the code and the database disagree about
      // the schema. Saying so beats "could not place the booking", which sent
      // us looking at the booking logic when the row was simply malformed.
      const isSchemaMismatch = bookingError?.code === "42703";

      return NextResponse.json(
        {
          error: isSchemaMismatch
            ? `Booking could not be saved — the database is missing a column (${bookingError?.message}). This needs a migration.`
            : "Could not place the booking.",
        },
        { status: 500 }
      );
    }

    const bookingId = newBooking.id;

    const { error: itemsError } = await supabase.from("booking_items").insert(
      itemsWithStations.map((item) => ({
        booking_id: bookingId,
        console: item.console,
        quantity: item.quantity,
        price: item.price,
        // The station names ride in the title, the same encoding the owner
        // side writes, so one booking looks identical whoever created it.
        title: encodeAssignedStationsTitle(durationMinutes, item.stations),
      }))
    );

    if (itemsError) {
      await supabase.from("bookings").delete().eq("id", bookingId);
      console.error("Booking items insert failed:", itemsError.message);
      return NextResponse.json({ error: "Could not place the booking." }, { status: 500 });
    }

    // Two people can pass the check above at the same moment and both write.
    // Re-reading now catches that and undoes ours rather than seating two
    // customers at one machine.
    const claimedStations = itemsWithStations.flatMap((item) => item.stations);
    if (claimedStations.length > 0) {
      const conflicts = await findConflictingStations(
        supabase,
        cafe.id,
        bookingDate,
        startTime,
        durationMinutes,
        bookingId,
        claimedStations
      );

      if (conflicts.length > 0) {
        await supabase.from("booking_items").delete().eq("booking_id", bookingId);
        await supabase.from("bookings").delete().eq("id", bookingId);
        return NextResponse.json(
          {
            error: `${conflicts
              .map((name) => name.toUpperCase())
              .join(", ")} was just taken. Please pick another slot.`,
          },
          { status: 409 }
        );
      }
    }

    if (coupon) {
      await supabase.rpc("use_coupon", {
        p_coupon_id: coupon.id,
        p_booking_id: bookingId,
        p_user_phone: customerPhone,
        p_user_email: null,
        p_discount_applied: coupon.discount,
        p_extra_minutes: coupon.bonusMinutes,
      });
    }

    // ---------------------------------------------------------- take the money
    //
    // After the booking exists, so the ledger row can point at what it paid
    // for — a deduction with no booking attached is money nobody can account
    // for. If it fails the booking is removed rather than left standing as
    // unpaid, because the customer was told it would come out of their wallet.
    if (walletUsed > 0) {
      const { error: walletError } = await supabase.from("wallet_ledger").insert({
        cafe_id: cafe.id,
        customer_phone: customerPhone,
        user_id: userId,
        amount: -walletUsed,
        reason: "spend",
        booking_id: bookingId,
        // The booking id: a retried request for the same booking cannot deduct
        // twice, whatever else goes wrong.
        idempotency_key: `booking:${bookingId}`,
        note: `Session on ${bookingDate}`,
      });

      if (walletError) {
        // 23505 means this booking already paid — a retry, not a failure.
        if (walletError.code !== "23505") {
          await supabase.from("booking_items").delete().eq("booking_id", bookingId);
          await supabase.from("bookings").delete().eq("id", bookingId);

          console.error("Wallet deduction failed:", walletError.message);

          return NextResponse.json(
            {
              error: isMissingWalletTable(walletError.message)
                ? "Wallet payment is not set up yet. Book again without using the wallet."
                : "Could not take the money from your wallet. Nothing was charged.",
            },
            { status: 409 }
          );
        }
      }
    }

    // Tells the lock agent about the booking. It locks rather than unlocks for
    // anything unpaid or not yet started, so this is safe to call here.
    await syncStationsForBooking(supabase, bookingId);

    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    const authUser = userData?.user;
    const userEmail = authUser?.email;
    if (userEmail) {
      const bonusMinutes = coupon?.bonusMinutes ?? 0;
      sendBookingConfirmation({
        email: userEmail,
        name: customerName || authUser?.user_metadata?.full_name || authUser?.user_metadata?.name,
        bookingId,
        cafeName: cafe.name,
        bookingDate: new Date(bookingDate).toLocaleDateString("en-IN", { dateStyle: "long" }),
        startTime: startTime,
        duration: durationMinutes + bonusMinutes,
        tickets: itemsWithStations.map((item) => ({
          console: CONSOLE_LABELS[item.console as keyof typeof CONSOLE_LABELS] || item.console,
          quantity: item.quantity,
          price: item.price,
        })),
        totalAmount: finalAmount,
      }).catch((err) => console.error("Booking confirmation email failed:", err));
    }

    return NextResponse.json({
      success: true,
      bookingId,
      totalAmount: finalAmount,
      discount: coupon?.discount ?? 0,
      bonusMinutes: coupon?.bonusMinutes ?? 0,
      walletUsed,
      payableAtVenue,
      stations: claimedStations,
    });
  } catch (err) {
    console.error("Unexpected error placing booking:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
