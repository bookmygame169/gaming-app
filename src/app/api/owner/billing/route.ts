import { NextRequest, NextResponse } from "next/server";
import {
  getOwnedBookingIdForBookingItem,
  getOwnedCafeIdForBooking,
  requireOwnerCafeAccess,
  requireOwnerContext,
} from "@/lib/ownerAuth";

export const dynamic = 'force-dynamic';

// PUT /api/owner/billing — update booking + optional booking_item or items array
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) {
      return auth.response;
    }

    const { ownerId, supabase } = auth.context;
    const { bookingId, bookingItemId, booking, item, items } = await request.json();

    if (!bookingId) {
      return NextResponse.json({ error: "bookingId is required" }, { status: 400 });
    }

    const ownedCafeId = await getOwnedCafeIdForBooking(supabase, bookingId, ownerId);
    if (!ownedCafeId) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    // Support single item update (backward compatibility)
    if (bookingItemId && item) {
      const { error: itemError } = await supabase
        .from("booking_items")
        .update(item)
        .eq("id", bookingItemId)
        .eq("booking_id", bookingId);

      if (itemError) {
        return NextResponse.json({ error: itemError.message }, { status: 500 });
      }
    }

    // Support multiple items sync
    if (items && Array.isArray(items)) {
      // 1. Get current items in DB
      const { data: currentDbItems, error: getError } = await supabase
        .from("booking_items")
        .select("id")
        .eq("booking_id", bookingId);

      if (getError) {
        return NextResponse.json({ error: getError.message }, { status: 500 });
      }

      const itemIdsToKeep = items.filter(it => it.id).map(it => it.id);
      const dbItemIds = (currentDbItems || []).map(it => it.id);
      const itemIdsToDelete = dbItemIds.filter(id => !itemIdsToKeep.includes(id));

      // 2. Delete removed items
      if (itemIdsToDelete.length > 0) {
        const { error: delError } = await supabase
          .from("booking_items")
          .delete()
          .in("id", itemIdsToDelete)
          .eq("booking_id", bookingId);
        
        if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });
      }

      // 3. Upsert items
      for (const it of items) {
        if (it.id) {
          // Update existing
          await supabase
            .from("booking_items")
            .update({
              console: it.console,
              quantity: it.quantity,
              price: it.price,
              title: it.title
            })
            .eq("id", it.id)
            .eq("booking_id", bookingId);
        } else {
          // Insert new
          await supabase
            .from("booking_items")
            .insert({
              booking_id: bookingId,
              console: it.console,
              quantity: it.quantity,
              price: it.price,
              title: it.title
            });
        }
      }
    }

    // Update booking
    if (booking) {
      const { error: bookingError } = await supabase
        .from("bookings")
        .update(booking)
        .eq("id", bookingId);

      if (bookingError) {
        return NextResponse.json({ error: bookingError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Error updating booking:", err);
    return NextResponse.json({ error: err.message || "Failed to update booking" }, { status: 500 });
  }
}

// DELETE /api/owner/billing — delete booking or specific booking_item
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) {
      return auth.response;
    }

    const { ownerId, supabase } = auth.context;
    const { bookingId, bookingItemIds, specificItemId, newTotalAmount } = await request.json();

    if (!bookingId) {
      return NextResponse.json({ error: "bookingId is required" }, { status: 400 });
    }

    const ownedCafeId = await getOwnedCafeIdForBooking(supabase, bookingId, ownerId);
    if (!ownedCafeId) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    if (specificItemId) {
      const ownedBookingId = await getOwnedBookingIdForBookingItem(
        supabase,
        specificItemId,
        ownerId
      );

      if (!ownedBookingId || ownedBookingId !== bookingId) {
        return NextResponse.json(
          { error: "Booking item not found" },
          { status: 404 }
        );
      }

      // Delete only a specific booking_item from a bulk booking
      const { error: itemError } = await supabase
        .from("booking_items")
        .delete()
        .eq("id", specificItemId);

      if (itemError) {
        return NextResponse.json({ error: itemError.message }, { status: 500 });
      }

      // Update the booking's total_amount
      if (newTotalAmount !== undefined) {
        const { error: updateError } = await supabase
          .from("bookings")
          .update({ total_amount: newTotalAmount })
          .eq("id", bookingId);

        if (updateError) {
          console.error("Error updating booking total after item delete:", updateError);
        }
      }
    } else {
      // Delete all booking_items first, then the booking
      if (bookingItemIds && bookingItemIds.length > 0) {
        const { error: itemsError } = await supabase
          .from("booking_items")
          .delete()
          .in("id", bookingItemIds);

        if (itemsError) {
          return NextResponse.json({ error: itemsError.message }, { status: 500 });
        }
      }

      const { error } = await supabase
        .from("bookings")
        .delete()
        .eq("id", bookingId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Error deleting booking:", err);
    return NextResponse.json({ error: err.message || "Failed to delete booking" }, { status: 500 });
  }
}

// POST /api/owner/billing — create booking + booking_items
export async function POST(request: NextRequest) {
  const auth = await requireOwnerContext(request);
  if (auth.response) {
    return auth.response;
  }

  const { ownerId, supabase } = auth.context;
  const body = await request.json();
  const { booking, items } = body;

  if (!booking?.cafe_id) {
    return NextResponse.json({ error: "booking.cafe_id is required" }, { status: 400 });
  }

  const accessResponse = await requireOwnerCafeAccess(
    supabase,
    ownerId,
    booking.cafe_id
  );
  if (accessResponse) {
    return accessResponse;
  }

  const { data: newBooking, error: bookingError } = await supabase
    .from('bookings')
    .insert(booking)
    .select()
    .single();

  if (bookingError) return NextResponse.json({ error: bookingError.message }, { status: 500 });

  if (items && items.length > 0) {
    const itemsToInsert = items.map((item: any) => ({
      booking_id: newBooking.id,
      console: item.console,
      quantity: item.quantity,
      price: item.price,
    }));

    const { error: itemsError } = await supabase
      .from('booking_items')
      .insert(itemsToInsert);

    if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, bookingId: newBooking.id });
}
