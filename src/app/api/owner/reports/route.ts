import { NextRequest, NextResponse } from "next/server";
import {
  requireOwnerCafeAccess,
  requireOwnerContext,
} from "@/lib/ownerAuth";

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

type SubscriptionRow = {
  id: string;
  amount_paid: number | string;
  purchase_date: string;
  payment_mode?: string | null;
  customer_name?: string | null;
  membership_plans?: { name?: string | null } | null;
};

const getIndiaDateString = (date: Date = new Date()): string => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
};

const parseAmount = (amount: number | string | null | undefined): number => {
  if (typeof amount === "number") {
    return amount;
  }

  if (typeof amount === "string") {
    const parsed = Number.parseFloat(amount);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
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
        customer_name, customer_phone, source,
        booking_items (console, quantity, price)
      `)
      .eq('cafe_id', cafeId)
      .neq('status', 'cancelled')
      .neq('payment_mode', 'owner')
      .is('deleted_at', null)
      .gte('booking_date', startDate)
      .lte('booking_date', endDate)
      .order('booking_date', { ascending: true });

    if (currentError) {
      return NextResponse.json({ error: currentError.message }, { status: 500 });
    }

    // Fetch booking_orders for ALL bookings in the period. Gaming and snack revenue
    // are stored separately as booking_items.price and booking_orders.total_price.
    const allBookingIds = ((currentData || []) as BookingRow[]).map((b) => b.id);

    const snackOrdersMap: Record<string, BookingOrderSummary[]> = {};
    if (allBookingIds.length > 0) {
      const { data: ordersData } = await supabase
        .from('booking_orders')
        .select('booking_id, item_name, quantity, unit_price, total_price')
        .in('booking_id', allBookingIds);

      ((ordersData || []) as BookingOrderRow[]).forEach((o) => {
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
    const { data: prevData } = await supabase
      .from('bookings')
      .select(`
        id, total_amount, booking_date, status, payment_mode, source,
        booking_items (console, quantity, price)
      `)
      .eq('cafe_id', cafeId)
      .neq('status', 'cancelled')
      .neq('payment_mode', 'owner')
      .is('deleted_at', null)
      .gte('booking_date', prevStartDate)
      .lte('booking_date', prevEndDate);

    const prevBookingIds = ((prevData || []) as BookingRow[]).map((b) => b.id);
    const prevSnackOrdersMap: Record<string, BookingOrderSummary[]> = {};
    if (prevBookingIds.length > 0) {
      const { data: prevOrdersData } = await supabase
        .from('booking_orders')
        .select('booking_id, item_name, quantity, unit_price, total_price')
        .in('booking_id', prevBookingIds);

      ((prevOrdersData || []) as BookingOrderRow[]).forEach((o) => {
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

    // Fetch current period subscriptions
    const { data: currentSubscriptions, error: currentSubError } = await supabase
      .from('subscriptions')
      .select('id, amount_paid, purchase_date, payment_mode, customer_name, membership_plans(name)')
      .eq('cafe_id', cafeId)
      .is('deleted_at', null)
      .gte('purchase_date', `${startDate}T00:00:00+05:30`)
      .lte('purchase_date', `${endDate}T23:59:59+05:30`);

    if (currentSubError) {
      console.error("Error fetching current subscriptions:", currentSubError);
    }
      
    // Fetch previous period subscriptions
    const { data: prevSubscriptions, error: prevSubError } = await supabase
      .from('subscriptions')
      .select('id, amount_paid, purchase_date, payment_mode')
      .eq('cafe_id', cafeId)
      .is('deleted_at', null)
      .gte('purchase_date', `${prevStartDate}T00:00:00+05:30`)
      .lte('purchase_date', `${prevEndDate}T23:59:59+05:30`);

    if (prevSubError) {
      console.error("Error fetching previous subscriptions:", prevSubError);
    }

    // Map subscriptions to look like bookings
    const formattedCurrentSubscriptions = ((currentSubscriptions || []) as SubscriptionRow[]).map((sub) => ({
      id: `sub_${sub.id}`,
      total_amount: parseAmount(sub.amount_paid),
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
        price: parseAmount(sub.amount_paid),
        name: sub.membership_plans?.name || 'Membership'
      }],
      booking_orders: [],
    }));

    const formattedPrevSubscriptions = ((prevSubscriptions || []) as SubscriptionRow[]).map((sub) => ({
      id: `sub_${sub.id}`,
      total_amount: parseAmount(sub.amount_paid),
      booking_date: sub.purchase_date.split('T')[0],
      status: 'completed',
      payment_mode: sub.payment_mode || 'cash',
      source: 'membership',
      booking_items: [{
        console: 'Membership',
        quantity: 1,
        price: parseAmount(sub.amount_paid),
      }],
      booking_orders: [],
    }));

    // Combine bookings and subscriptions
    const combinedCurrentData = [...enrichedCurrentData, ...formattedCurrentSubscriptions]
      .sort((a, b) => new Date(a.booking_date).getTime() - new Date(b.booking_date).getTime());
      
    const combinedPrevData = [...enrichedPrevData, ...formattedPrevSubscriptions];

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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch peak hours data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
