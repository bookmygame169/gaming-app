import { NextRequest, NextResponse } from "next/server";
import { requireOwnerContext } from "@/lib/ownerAuth";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

// GET /api/owner/bookings — paginated, server-side filtered bookings for the Bookings tab
export async function GET(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;

    const { ownerId, supabase } = auth.context;
    const { searchParams } = new URL(request.url);

    const cafeId = searchParams.get("cafeId");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const status = searchParams.get("status") || "all";
    const search = searchParams.get("search") || "";
    const dateFrom = searchParams.get("dateFrom") || "";
    const dateTo = searchParams.get("dateTo") || "";

    // Verify cafe ownership
    const { data: cafes } = await supabase
      .from("cafes")
      .select("id")
      .eq("owner_id", ownerId);

    const ownedCafeIds = (cafes || []).map((c: any) => c.id);
    if (ownedCafeIds.length === 0) {
      return NextResponse.json({ bookings: [], total: 0, page, pageSize: PAGE_SIZE });
    }

    const targetCafeIds = cafeId && ownedCafeIds.includes(cafeId)
      ? [cafeId]
      : ownedCafeIds;

    const offset = (page - 1) * PAGE_SIZE;

    let query = supabase
      .from("bookings")
      .select(`
        id, cafe_id, user_id, booking_date, start_time, duration, total_amount, status,
        source, payment_mode, created_at, customer_name, customer_phone, deleted_at,
        booking_items (id, console, quantity, price, title),
        booking_orders (id, item_name, quantity, total_price)
      `, { count: "exact" })
      .in("cafe_id", targetCafeIds)
      .is("deleted_at", null);

    if (status !== "all") {
      query = query.eq("status", status);
    }

    if (dateFrom) query = query.gte("booking_date", dateFrom);
    if (dateTo) query = query.lte("booking_date", dateTo);

    if (search) {
      // Supabase OR filter across name, phone, id prefix
      query = query.or(
        `customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%,id.ilike.${search}%`
      );
    }

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      bookings: data || [],
      total: count ?? 0,
      page,
      pageSize: PAGE_SIZE,
    });
  } catch (err: any) {
    console.error("Error fetching paginated bookings:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch bookings" },
      { status: 500 }
    );
  }
}
