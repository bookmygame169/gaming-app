/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { requireOwnerContext } from "@/lib/ownerAuth";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

// GET /api/owner/deleted-bookings — fetch soft-deleted bookings for owner's cafes
export async function GET(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;

    const { ownerId, supabase } = auth.context;
    const { searchParams } = new URL(request.url);
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));

    // Get owner's cafe IDs
    const { data: cafes, error: cafesError } = await supabase
      .from("cafes")
      .select("id, name")
      .eq("owner_id", ownerId);

    if (cafesError) throw cafesError;
    if (!cafes || cafes.length === 0) {
      return NextResponse.json({ deletedBookings: [] });
    }

    const cafeIds = cafes.map((c: any) => c.id);
    const cafeMap = Object.fromEntries(cafes.map((c: any) => [c.id, c.name]));

    // Fetch soft-deleted bookings (deleted_at IS NOT NULL)
    const { data: bookings, error: bookingsError } = await supabase
      .from("bookings")
      .select(`
        id, cafe_id, user_id, booking_date, start_time, duration,
        total_amount, status, source, payment_mode,
        customer_name, customer_phone, created_at, deleted_at, deleted_remark,
        booking_items (id, console, quantity, price)
      `)
      .in("cafe_id", cafeIds)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (bookingsError) throw bookingsError;

    // Enrich with cafe names and user profiles
    const userIds = [...new Set((bookings || []).map((b: any) => b.user_id).filter(Boolean))];
    const userProfiles = new Map();

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, phone")
        .in("id", userIds);

      profiles?.forEach((p: any) => {
        const fullName = [p.first_name, p.last_name].filter(Boolean).join(" ") || null;
        userProfiles.set(p.id, { name: fullName, phone: p.phone });
      });
    }

    const enriched = (bookings || []).map((b: any) => {
      const userProfile = b.user_id ? userProfiles.get(b.user_id) : null;
      return {
        ...b,
        cafe_name: cafeMap[b.cafe_id] || "Unknown Café",
        user_name: userProfile?.name || b.customer_name || null,
        user_phone: userProfile?.phone || b.customer_phone || null,
      };
    });

    return NextResponse.json({ deletedBookings: enriched, hasMore: enriched.length === PAGE_SIZE });
  } catch (err: any) {
    console.error("Error fetching deleted bookings:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch deleted bookings" },
      { status: 500 }
    );
  }
}

// DELETE /api/owner/deleted-bookings — permanently delete a soft-deleted booking
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;

    const { ownerId, supabase } = auth.context;
    const { bookingId } = await request.json();

    if (!bookingId) {
      return NextResponse.json({ error: "bookingId is required" }, { status: 400 });
    }

    // Verify ownership and that it's actually soft-deleted
    const { data: booking, error: fetchError } = await supabase
      .from("bookings")
      .select("cafe_id, deleted_at")
      .eq("id", bookingId)
      .not("deleted_at", "is", null)
      .maybeSingle();

    if (fetchError || !booking) {
      return NextResponse.json({ error: "Deleted booking not found" }, { status: 404 });
    }

    const { data: cafe } = await supabase
      .from("cafes")
      .select("id")
      .eq("id", booking.cafe_id)
      .eq("owner_id", ownerId)
      .maybeSingle();

    if (!cafe) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Hard-delete booking_items first, then the booking
    const { error: itemsDeleteError } = await supabase
      .from("booking_items")
      .delete()
      .eq("booking_id", bookingId);

    if (itemsDeleteError) {
      return NextResponse.json({ error: itemsDeleteError.message }, { status: 500 });
    }

    const { error } = await supabase.from("bookings").delete().eq("id", bookingId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Error permanently deleting booking:", err);
    return NextResponse.json(
      { error: err.message || "Failed to permanently delete booking" },
      { status: 500 }
    );
  }
}

// PATCH /api/owner/deleted-bookings — restore a soft-deleted booking
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;

    const { ownerId, supabase } = auth.context;
    const { bookingId } = await request.json();

    if (!bookingId) {
      return NextResponse.json({ error: "bookingId is required" }, { status: 400 });
    }

    // Verify ownership and that it's soft-deleted
    const { data: booking, error: fetchError } = await supabase
      .from("bookings")
      .select("cafe_id, deleted_at")
      .eq("id", bookingId)
      .not("deleted_at", "is", null)
      .maybeSingle();

    if (fetchError || !booking) {
      return NextResponse.json({ error: "Deleted booking not found" }, { status: 404 });
    }

    const { data: cafe } = await supabase
      .from("cafes")
      .select("id")
      .eq("id", booking.cafe_id)
      .eq("owner_id", ownerId)
      .maybeSingle();

    if (!cafe) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Restore: clear deleted_at
    const { error } = await supabase
      .from("bookings")
      .update({ deleted_at: null, deleted_remark: null })
      .eq("id", bookingId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Error restoring booking:", err);
    return NextResponse.json(
      { error: err.message || "Failed to restore booking" },
      { status: 500 }
    );
  }
}
