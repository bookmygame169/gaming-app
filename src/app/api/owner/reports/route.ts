import { NextRequest, NextResponse } from "next/server";
import {
  requireOwnerCafeAccess,
  requireOwnerContext,
} from "@/lib/ownerAuth";

export const dynamic = 'force-dynamic';

const getIndiaDateString = (date: Date = new Date()): string => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
};

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
    const { data: currentData, error: currentError } = await supabase
      .from('bookings')
      .select(`
        id, total_amount, created_at, booking_date, status, payment_mode, start_time,
        customer_name, source,
        booking_items (console, quantity, price)
      `)
      .eq('cafe_id', cafeId)
      .neq('status', 'cancelled')
      .is('deleted_at', null)
      .gte('booking_date', startDate)
      .lte('booking_date', endDate)
      .order('booking_date', { ascending: true });

    if (currentError) {
      return NextResponse.json({ error: currentError.message }, { status: 500 });
    }

    // Fetch booking_orders separately for snack-only bookings (no booking_items).
    // Inline PostgREST join from bookings→booking_orders is unreliable — fetching
    // directly by booking_id is guaranteed to work.
    const snackBookingIds = (currentData || [])
      .filter((b: any) => !b.booking_items || b.booking_items.length === 0)
      .map((b: any) => b.id);

    let snackOrdersMap: Record<string, any[]> = {};
    if (snackBookingIds.length > 0) {
      const { data: ordersData } = await supabase
        .from('booking_orders')
        .select('booking_id, item_name, quantity, unit_price, total_price')
        .in('booking_id', snackBookingIds);

      (ordersData || []).forEach((o: any) => {
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
    const enrichedCurrentData = (currentData || []).map((b: any) => ({
      ...b,
      booking_orders: snackOrdersMap[b.id] || [],
    }));

    // Fetch previous period bookings (exclude soft-deleted)
    const { data: prevData } = await supabase
      .from('bookings')
      .select('id, total_amount, booking_date, status, payment_mode')
      .eq('cafe_id', cafeId)
      .neq('status', 'cancelled')
      .is('deleted_at', null)
      .gte('booking_date', prevStartDate)
      .lte('booking_date', prevEndDate);

    // Fetch current period subscriptions
    const { data: currentSubscriptions, error: currentSubError } = await supabase
      .from('subscriptions')
      .select('id, amount_paid, purchase_date, payment_mode, customer_name, membership_plans(name)')
      .eq('cafe_id', cafeId)
      .eq('status', 'active') // Only count active subscriptions
      .gte('purchase_date', `${startDate}T00:00:00`)
      .lte('purchase_date', `${endDate}T23:59:59`);
      
    if (currentSubError) {
      console.error("Error fetching current subscriptions:", currentSubError);
    }
      
    // Fetch previous period subscriptions
    const { data: prevSubscriptions, error: prevSubError } = await supabase
      .from('subscriptions')
      .select('id, amount_paid, purchase_date, payment_mode')
      .eq('cafe_id', cafeId)
      .eq('status', 'active')
      .gte('purchase_date', `${prevStartDate}T00:00:00`)
      .lte('purchase_date', `${prevEndDate}T23:59:59`);

    if (prevSubError) {
      console.error("Error fetching previous subscriptions:", prevSubError);
    }

    // Map subscriptions to look like bookings
    const formattedCurrentSubscriptions = (currentSubscriptions || []).map((sub: any) => ({
      id: `sub_${sub.id}`,
      total_amount: sub.amount_paid ? parseFloat(sub.amount_paid) : 0,
      created_at: sub.purchase_date,
      booking_date: sub.purchase_date.split('T')[0],
      status: 'completed', // For reporting purposes, a paid subscription is completed revenue
      payment_mode: sub.payment_mode || 'cash',
      start_time: sub.purchase_date.split('T')[1]?.substring(0, 5) || '00:00',
      customer_name: sub.customer_name,
      source: 'membership',
      booking_items: [{
        console: 'Membership',
        quantity: 1,
        price: sub.amount_paid ? parseFloat(sub.amount_paid) : 0,
        name: sub.membership_plans?.name || 'Membership'
      }]
    }));

    const formattedPrevSubscriptions = (prevSubscriptions || []).map((sub: any) => ({
      id: `sub_${sub.id}`,
      total_amount: sub.amount_paid ? parseFloat(sub.amount_paid) : 0,
      booking_date: sub.purchase_date.split('T')[0],
      status: 'completed',
      payment_mode: sub.payment_mode || 'cash'
    }));

    // Combine bookings and subscriptions
    const combinedCurrentData = [...enrichedCurrentData, ...formattedCurrentSubscriptions]
      .sort((a, b) => new Date(a.booking_date).getTime() - new Date(b.booking_date).getTime());
      
    const combinedPrevData = [...(prevData || []), ...formattedPrevSubscriptions];

    return NextResponse.json({
      currentBookings: combinedCurrentData,
      previousBookings: combinedPrevData,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch reports" }, { status: 500 });
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

    const { data, error } = await supabase
      .from('bookings')
      .select('id, start_time, created_at, status')
      .eq('cafe_id', cafeId)
      .neq('status', 'cancelled')
      .is('deleted_at', null)
      .gte('booking_date', startDate)
      .lte('booking_date', endDate);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ bookings: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch peak hours data" }, { status: 500 });
  }
}
