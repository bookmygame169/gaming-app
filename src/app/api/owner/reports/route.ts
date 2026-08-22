import { fetchAllRows, chunked } from "@/lib/db/pagination";
import { excludeCancelled, excludeDeleted, revenueBookings } from "@/lib/db/bookings";
import { NextRequest, NextResponse } from "next/server";
import {
  requireOwnerCafeAccess,
  requireOwnerContext,
} from "@/lib/ownerAuth";
import { getIndiaDateString } from "@/lib/indiaTime";

export const dynamic = 'force-dynamic';

type BookingRow = {
  id: string;
  total_amount: number;
  created_at?: string;
  booking_date: string;
  status: string;
  payment_mode: string;
  start_time?: string;
  customer_name?: string;
  customer_phone?: string;
  source?: string;
  booking_items?: Array<{ console: string; quantity: number; price?: number }>;
  booking_orders?: BookingOrderSummary[];
};

type BookingOrderRow = {
  booking_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
};

type BookingOrderSummary = Omit<BookingOrderRow, "booking_id">;

// POST /api/owner/reports — fetch booking data for reports
export async function POST(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) {
      return auth.response;
    }

    const { ownerId, supabase } = auth.context;
    const { cafeId, startDate, endDate, prevStartDate, prevEndDate } = await request.json();

    if (!cafeId) {
      return NextResponse.json({ error: "cafeId is required" }, { status: 400 });
    }

    const accessResponse = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
    if (accessResponse) {
      return accessResponse;
    }

    // Fetch current period bookings (exclude soft-deleted)
    // Paged, because an unbounded select stops at PostgREST's 1000-row ceiling
    // without saying so and every figure below is a JavaScript reduction over
    // whatever came back. On the one live café an all-time range matches 2,847
    // bookings and returned 1,000, so the reported revenue was a third of the
    // real number and looked entirely plausible.
    const REPORT_COLUMNS = `
        id, total_amount, created_at, booking_date, status, payment_mode, start_time,
        customer_name, customer_phone, source,
        booking_items (console, quantity, price)
      `;

    const { rows: currentRows, error: currentError, truncated: currentTruncated } =
      await fetchAllRows<BookingRow>(() =>
        revenueBookings(
          supabase
            .from('bookings')
            .select(REPORT_COLUMNS)
            .eq('cafe_id', cafeId)
        )
          .gte('booking_date', startDate)
          .lte('booking_date', endDate)
          .order('booking_date', { ascending: true })
      );

    if (currentError) {
      return NextResponse.json({ error: currentError }, { status: 500 });
    }

    if (currentTruncated) {
      // Loud rather than silent. A report this large is still worth showing,
      // but nobody should read a total that stopped early without knowing.
      console.warn(
        `Reports: hit the row ceiling for café ${cafeId} between ${startDate} and ${endDate}.`
      );
    }

    const currentData = currentRows;

    // Fetch booking_orders for ALL bookings in the period. Gaming and snack revenue
    // are stored separately as booking_items.price and booking_orders.total_price.
    const allBookingIds = ((currentData || []) as BookingRow[]).map((b) => b.id);

    const snackOrdersMap: Record<string, BookingOrderSummary[]> = {};
    if (allBookingIds.length > 0) {
      // Chunked: these ids go into the query string, and a few thousand uuids
      // makes a URL that proxies refuse.
      const ordersData: BookingOrderRow[] = [];
      for (const ids of chunked(allBookingIds)) {
        const { data: page } = await supabase
          .from('booking_orders')
          .select('booking_id, item_name, quantity, unit_price, total_price')
          .in('booking_id', ids);
        ordersData.push(...((page || []) as BookingOrderRow[]));
      }

      ordersData.forEach((o) => {
        if (!snackOrdersMap[o.booking_id]) snackOrdersMap[o.booking_id] = [];
        snackOrdersMap[o.booking_id].push({
          item_name: o.item_name,
          quantity: o.quantity,
          unit_price: o.unit_price,
          total_price: o.total_price,
        });
      });
    }

    // Attach booking_orders to each booking row
    const enrichedCurrentData = ((currentData || []) as BookingRow[]).map((b) => ({
      ...b,
      booking_orders: snackOrdersMap[b.id] || [],
    }));

    // Fetch previous period bookings (exclude soft-deleted)
    const { rows: prevData } = await fetchAllRows<BookingRow>(() =>
      revenueBookings(
        supabase
          .from('bookings')
          .select(`
        id, total_amount, booking_date, status, payment_mode, source,
        booking_items (console, quantity, price)
      `)
          .eq('cafe_id', cafeId)
      )
        .gte('booking_date', prevStartDate)
        .lte('booking_date', prevEndDate)
    );

    const prevBookingIds = ((prevData || []) as BookingRow[]).map((b) => b.id);
    const prevSnackOrdersMap: Record<string, BookingOrderSummary[]> = {};
    if (prevBookingIds.length > 0) {
      const prevOrdersData: BookingOrderRow[] = [];
      for (const ids of chunked(prevBookingIds)) {
        const { data: page } = await supabase
          .from('booking_orders')
          .select('booking_id, item_name, quantity, unit_price, total_price')
          .in('booking_id', ids);
        prevOrdersData.push(...((page || []) as BookingOrderRow[]));
      }

      prevOrdersData.forEach((o) => {
        if (!prevSnackOrdersMap[o.booking_id]) prevSnackOrdersMap[o.booking_id] = [];
        prevSnackOrdersMap[o.booking_id].push({
          item_name: o.item_name,
          quantity: o.quantity,
          unit_price: o.unit_price,
          total_price: o.total_price,
        });
      });
    }

    const enrichedPrevData = ((prevData || []) as BookingRow[]).map((b) => ({
      ...b,
      booking_orders: prevSnackOrdersMap[b.id] || [],
    }));

    // Membership checkout creates a booking ledger row as the revenue source.
    // Do not add subscriptions here as well, or reports double-count memberships.
    const combinedCurrentData = enrichedCurrentData
      .sort((a, b) => new Date(a.booking_date).getTime() - new Date(b.booking_date).getTime());
      
    const combinedPrevData = enrichedPrevData;

    return NextResponse.json({
      currentBookings: combinedCurrentData,
      previousBookings: combinedPrevData,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch reports";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET /api/owner/reports/peak — fetch 30-day bookings for peak hours
export async function GET(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) {
      return auth.response;
    }

    const { ownerId, supabase } = auth.context;
    const { searchParams } = new URL(request.url);
    const cafeId = searchParams.get('cafeId');

    if (!cafeId) {
      return NextResponse.json({ error: "cafeId is required" }, { status: 400 });
    }

    const accessResponse = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
    if (accessResponse) {
      return accessResponse;
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    const startDate = getIndiaDateString(thirtyDaysAgo);
    const endDate = getIndiaDateString(now);

    const { data, error } = await excludeCancelled(
      excludeDeleted(
        supabase
          .from('bookings')
          .select('id, start_time, created_at, status')
          .eq('cafe_id', cafeId)
      )
    )
      .gte('booking_date', startDate)
      .lte('booking_date', endDate);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ bookings: data || [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch peak hours data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
