import { NextRequest, NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/adminAuth";
import { syncStationsForBooking } from "@/lib/stationSync";

export const dynamic = "force-dynamic";

/**
 * Bookings, from the admin panel.
 *
 * Written straight to Supabase from the browser before, which the cafés' ISP
 * blocks — and which also meant an admin changing a booking's status or
 * deleting it left the physical machine untouched, exactly the gap the owner
 * side had.
 */

const ALLOWED_STATUSES = new Set([
  "pending",
  "confirmed",
  "in-progress",
  "completed",
  "cancelled",
]);

/** PUT /api/admin/bookings — body: { bookingId, status } */
export async function PUT(request: NextRequest) {
  const { context, response } = await requireAdminContext(request);
  if (response) return response;

  const { bookingId, status } = await request.json().catch(() => ({}));

  if (!bookingId) {
    return NextResponse.json({ error: "bookingId is required" }, { status: 400 });
  }

  if (!ALLOWED_STATUSES.has(status)) {
    return NextResponse.json({ error: `Unknown status: ${status}` }, { status: 400 });
  }

  const { error } = await context.supabase
    .from("bookings")
    .update({ status })
    .eq("id", bookingId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Brings the machine in line with the new status — unlocked while a session
  // is running, locked once it is cancelled or complete.
  await syncStationsForBooking(context.supabase, bookingId);

  return NextResponse.json({ success: true });
}

/** DELETE /api/admin/bookings — body: { bookingId } */
export async function DELETE(request: NextRequest) {
  const { context, response } = await requireAdminContext(request);
  if (response) return response;

  const { bookingId } = await request.json().catch(() => ({}));

  if (!bookingId) {
    return NextResponse.json({ error: "bookingId is required" }, { status: 400 });
  }

  const supabase = context.supabase;

  // Lock first: once the rows are gone there is nothing left to say which
  // machine this booking was holding, and it would stay unlocked with no
  // record of why.
  await syncStationsForBooking(supabase, bookingId, { forceLock: true });

  // Children before the parent — booking_orders as well as booking_items,
  // which the panel's own delete forgot, leaving snack rows behind pointing at
  // a booking that no longer exists.
  await supabase.from("booking_orders").delete().eq("booking_id", bookingId);
  await supabase.from("booking_items").delete().eq("booking_id", bookingId);

  const { error } = await supabase.from("bookings").delete().eq("id", bookingId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
