import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireOwnerCafeAccess, requireOwnerContext } from "@/lib/ownerAuth";
import { stationAssignmentFields } from "@/lib/ownerStationAssignments";
import { syncStationsForBooking } from "@/lib/stationSync";
import { toRupees } from "@/lib/wallet";

export const dynamic = "force-dynamic";

/** The most one approval may add, and the least. */
const MAX_EXTENSION_MINUTES = 3 * 60;
const MIN_EXTENSION_MINUTES = 15;

type ExtendRequestRow = {
  id: string;
  cafe_id: string;
  station_name: string;
  request_type: string;
  duration_minutes: number | null;
  amount: number | string;
  payment_method: "online" | "counter";
  status: string;
  extends_booking_id: string | null;
};

type LiveBookingRow = {
  id: string;
  status: string | null;
  deleted_at: string | null;
  duration: number | null;
  total_amount: number | string | null;
  ends_at?: string | null;
};

/**
 * Reads the booking being lengthened, whether or not this database has learned
 * about session instants yet.
 *
 * ends_at ships in a migration that is run by hand, so the column may or may
 * not be there when this runs. Asked for optimistically and asked again
 * without, rather than guessed at: where it does exist it decides when the
 * session ends, and an extension that left it alone would grow the books and
 * change nothing on the machine.
 */
async function loadBooking(
  supabase: SupabaseClient,
  bookingId: string,
  cafeId: string
): Promise<{ booking: LiveBookingRow | null; hasInstants: boolean }> {
  const withInstants = await supabase
    .from("bookings")
    .select("id, status, deleted_at, duration, total_amount, ends_at")
    .eq("id", bookingId)
    .eq("cafe_id", cafeId)
    .maybeSingle();

  if (!withInstants.error) {
    return { booking: (withInstants.data as LiveBookingRow) || null, hasInstants: true };
  }

  if (!/ends_at/i.test(withInstants.error.message)) {
    console.error("Could not load the session to extend:", withInstants.error.message);
    return { booking: null, hasInstants: false };
  }

  const plain = await supabase
    .from("bookings")
    .select("id, status, deleted_at, duration, total_amount")
    .eq("id", bookingId)
    .eq("cafe_id", cafeId)
    .maybeSingle();

  if (plain.error) {
    console.error("Could not load the session to extend:", plain.error.message);
    return { booking: null, hasInstants: false };
  }

  return { booking: (plain.data as LiveBookingRow) || null, hasInstants: false };
}

/**
 * POST /api/owner/play-requests/extend
 *
 * The owner agreeing to more time for somebody already playing.
 *
 * Body: { cafeId, requestId, action: "approve" | "decline", minutes?, reason? }
 *
 * Its own route rather than a branch of the ordinary approval, because it does
 * something different enough to be worth keeping apart: nothing is unlocked and
 * no booking is created. The booking the customer is already in grows, and the
 * machine hears about it through the ordinary sync - which sends what is now
 * left rather than what was bought, and which the agent applies without
 * restarting anything, so their game is never touched.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;

    const { ownerId, supabase } = auth.context;
    const body = await request.json().catch(() => ({}));

    const cafeId = String(body?.cafeId || "");
    const requestId = String(body?.requestId || "");
    const action = body?.action === "decline" ? "decline" : "approve";

    if (!cafeId || !requestId) {
      return NextResponse.json({ error: "cafeId and requestId are required" }, { status: 400 });
    }

    const accessError = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
    if (accessError) return accessError;

    const { data: found, error: loadError } = await supabase
      .from("station_play_requests")
      .select(
        "id, cafe_id, station_name, request_type, duration_minutes, amount, payment_method, status, extends_booking_id"
      )
      .eq("id", requestId)
      .eq("cafe_id", cafeId)
      .maybeSingle();

    if (loadError) {
      console.error("Could not load the extension request:", loadError.message);
      return NextResponse.json({ error: "Could not load that request." }, { status: 500 });
    }

    if (!found) {
      return NextResponse.json({ error: "Request not found." }, { status: 404 });
    }

    const playRequest = found as ExtendRequestRow;

    if (playRequest.request_type !== "extend") {
      return NextResponse.json(
        { error: "That request is for a new session, not more time." },
        { status: 400 }
      );
    }

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
        console.error("Could not decline the extension:", declineError.message);
        return NextResponse.json({ error: "Could not decline that request." }, { status: 500 });
      }

      return NextResponse.json({ success: true, status: "rejected" });
    }

    const bookingId = playRequest.extends_booking_id;
    if (!bookingId) {
      return NextResponse.json(
        { error: "That request does not say which session to extend." },
        { status: 400 }
      );
    }

    const requested = Number(body?.minutes);
    const minutes = Number.isFinite(requested) && requested > 0
      ? Math.min(MAX_EXTENSION_MINUTES, Math.max(MIN_EXTENSION_MINUTES, Math.round(requested)))
      : Math.max(MIN_EXTENSION_MINUTES, Number(playRequest.duration_minutes) || 60);

    const amount = toRupees(playRequest.amount);
    const stationName = playRequest.station_name;

    // Claimed first, exactly as a new session is: whoever's update matches
    // status = 'pending' is the one person who answered this. Two staff on two
    // phones must not both add an hour.
    const { data: claimed, error: claimError } = await supabase
      .from("station_play_requests")
      .update({ status: "approved", decided_by: ownerId, decided_at: new Date().toISOString() })
      .eq("id", requestId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (claimError) {
      console.error("Could not claim the extension request:", claimError.message);
      return NextResponse.json({ error: "Could not approve that request." }, { status: 500 });
    }

    if (!claimed) {
      return NextResponse.json({ error: "Someone just answered this request." }, { status: 409 });
    }

    const undoClaim = async () => {
      await supabase
        .from("station_play_requests")
        .update({ status: "pending", decided_by: null, decided_at: null })
        .eq("id", requestId);
    };

    const { booking, hasInstants } = await loadBooking(supabase, bookingId, cafeId);

    if (!booking) {
      await undoClaim();
      return NextResponse.json({ error: "Could not find that session." }, { status: 404 });
    }

    // Between the asking and the answering the customer may have run out, or
    // ended it themselves. Selling them more of a session that is over would
    // take money for nothing.
    if (booking.status !== "in-progress" || booking.deleted_at) {
      await undoClaim();
      return NextResponse.json(
        { error: "That session has already ended. Start a new one instead." },
        { status: 409 }
      );
    }

    const newDuration = (Number(booking.duration) || 0) + minutes;
    const newAmount = toRupees(booking.total_amount) + amount;

    // The item's title carries the minutes, and reports read them from there
    // rather than from the booking's own column. Leaving it alone would have
    // every extension reported at the length originally sold.
    const { data: items } = await supabase
      .from("booking_items")
      .select("id, price, station_names")
      .eq("booking_id", bookingId);

    const rows = items || [];

    // The item that names this station, or the only item there is. Anything
    // else is a booking covering several machines, where guessing which line to
    // lengthen would be worse than lengthening none of them.
    const item =
      rows.find((row) => ((row.station_names as string[] | null) || []).includes(stationName)) ||
      (rows.length === 1 ? rows[0] : null);

    if (item) {
      const { error: itemError } = await supabase
        .from("booking_items")
        .update({
          ...stationAssignmentFields(newDuration, [stationName]),
          price: toRupees(item.price) + amount,
        })
        .eq("id", item.id);

      if (itemError) {
        console.error("Could not lengthen the booking item:", itemError.message);
        await undoClaim();
        return NextResponse.json({ error: "Could not extend that session." }, { status: 500 });
      }
    } else {
      console.warn(
        `Booking ${bookingId} has no item for ${stationName}; extending the booking alone. ` +
          "Reports read the length off the item, so this one will read short."
      );
    }

    // Moved from the end it already had rather than recomputed from the start
    // time, so a session that began late ends late.
    const endsAt = hasInstants && booking.ends_at
      ? new Date(new Date(booking.ends_at).getTime() + minutes * 60_000).toISOString()
      : null;

    const { error: updateError } = await supabase
      .from("bookings")
      .update({
        duration: newDuration,
        total_amount: newAmount,
        ...(endsAt ? { ends_at: endsAt } : {}),
      })
      .eq("id", bookingId);

    if (updateError) {
      console.error("Could not lengthen the booking:", updateError.message);
      await undoClaim();
      return NextResponse.json({ error: "Could not extend that session." }, { status: 500 });
    }

    await supabase
      .from("station_play_requests")
      .update({ booking_id: bookingId, approved_minutes: minutes })
      .eq("id", requestId);

    // The machine hears about it last, deliberately: a PC running longer than
    // the booking says is time nobody is being charged for.
    try {
      await syncStationsForBooking(supabase, bookingId);
    } catch (err) {
      // Not rolled back. The customer has paid and the books are right, and the
      // sweep re-states every live session, so the machine catches up by
      // itself.
      console.error("Extension recorded, but the PC was not reached:", err);
    }

    await supabase.from("station_unlock_log").insert({
      cafe_id: cafeId,
      station_name: stationName,
      action: "unlock",
      booking_id: bookingId,
      trigger_source: "lock_screen_extend",
      staff_id: ownerId,
      booking_amount: amount,
      payment_mode: playRequest.payment_method === "online" ? "upi" : "cash",
      booking_status: "in-progress",
      duration_seconds: minutes * 60,
    });

    return NextResponse.json({
      success: true,
      status: "approved",
      extended: true,
      bookingId,
      minutes,
      station: stationName,
    });
  } catch (err) {
    console.error("Unexpected error extending a session:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
