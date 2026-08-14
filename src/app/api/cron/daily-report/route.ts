import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendDailyReport } from '@/lib/email';

const supabase = getSupabaseAdmin();

// Helper to format date as "Mon, 27 Jan 2026"
function formatReportDate(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// Helper to get local date string (YYYY-MM-DD)
function toLocalISODate(date: Date): string {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);
  return localDate.toISOString().slice(0, 10);
}

// Parse closing hour from opening_hours string like "Mon-Sun: 10:00 AM - 11:00 PM"
function parseClosingHour(openingHours: string | null): number | null {
  if (!openingHours) return null;

  const match = openingHours.match(
    /(\d{1,2})(?::\d{2})?\s*(AM|PM)\s*[-–]\s*(\d{1,2})(?::\d{2})?\s*(AM|PM)/i
  );

  if (match) {
    let closeHour = parseInt(match[3], 10);
    const closePeriod = match[4].toUpperCase();

    if (closePeriod === 'PM' && closeHour !== 12) {
      closeHour += 12;
    } else if (closePeriod === 'AM' && closeHour === 12) {
      closeHour = 0;
    }

    return closeHour;
  }

  return null;
}

interface BookingItem {
  console: string;
  quantity: number;
  price?: number;
}

interface OrderItem {
  name: string;
  quantity: number;
  unit_price: number;
}

interface Booking {
  id: string;
  total_amount: number;
  payment_mode: string;
  booking_items: BookingItem[];
}

interface Order {
  id: string;
  total_amount: number;
  items: OrderItem[];
}

async function generateReportForCafe(cafeId: string, cafeName: string, cafeEmail: string) {
  const now = new Date();
  const todayStr = toLocalISODate(now);

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = toLocalISODate(yesterday);

  // Fetch today's bookings
  const { data: todayBookings } = await supabase
    .from('bookings')
    .select(`
      id,
      total_amount,
      payment_mode,
      booking_items (
        console,
        quantity,
        price
      )
    `)
    .eq('cafe_id', cafeId)
    .neq('status', 'cancelled')
    .eq('booking_date', todayStr);

  // Fetch yesterday's bookings for comparison
  const { data: yesterdayBookings } = await supabase
    .from('bookings')
    .select('id, total_amount')
    .eq('cafe_id', cafeId)
    .neq('status', 'cancelled')
    .eq('booking_date', yesterdayStr);

  // Fetch today's F&B orders
  const bookingIds = (todayBookings || []).map((b: Booking) => b.id);

  let todayOrders: Order[] = [];
  if (bookingIds.length > 0) {
    const { data: orders } = await supabase
      .from('booking_orders')
      .select('id, total_amount, items')
      .in('booking_id', bookingIds);
    todayOrders = orders || [];
  }

  // Calculate metrics
  const bookings = (todayBookings || []) as Booking[];
  const totalRevenue = bookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);
  const totalBookings = bookings.length;

  const yBookings = yesterdayBookings || [];
  const yesterdayRevenue = yBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);
  const yesterdayBookingsCount = yBookings.length;

  const revenueChange =
    yesterdayRevenue > 0 ? ((totalRevenue - yesterdayRevenue) / yesterdayRevenue) * 100 : 0;
  const bookingsChange =
    yesterdayBookingsCount > 0
      ? ((totalBookings - yesterdayBookingsCount) / yesterdayBookingsCount) * 100
      : 0;

  // F&B metrics
  const fnbRevenue = todayOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
  let fnbItemsSold = 0;
  const itemSales: Record<string, { quantity: number; revenue: number }> = {};

  todayOrders.forEach((order) => {
    if (order.items && Array.isArray(order.items)) {
      order.items.forEach((item: OrderItem) => {
        fnbItemsSold += item.quantity || 1;
        const name = item.name || 'Unknown';
        if (!itemSales[name]) {
          itemSales[name] = { quantity: 0, revenue: 0 };
        }
        itemSales[name].quantity += item.quantity || 1;
        itemSales[name].revenue += (item.unit_price || 0) * (item.quantity || 1);
      });
    }
  });

  const topSellingItems = Object.entries(itemSales)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  // Console breakdown
  const consoleStats: Record<string, { count: number; revenue: number }> = {};
  bookings.forEach((b) => {
    if (b.booking_items && Array.isArray(b.booking_items)) {
      b.booking_items.forEach((item) => {
        const consoleName = item.console || 'Unknown';
        if (!consoleStats[consoleName]) {
          consoleStats[consoleName] = { count: 0, revenue: 0 };
        }
        consoleStats[consoleName].count += item.quantity || 1;
        consoleStats[consoleName].revenue +=
          typeof item.price === 'number'
            ? item.price
            : (b.total_amount || 0) / (b.booking_items?.length || 1);
      });
    }
  });

  const consoleBreakdown = Object.entries(consoleStats)
    .map(([name, data]) => ({ name: name.toUpperCase(), ...data }))
    .sort((a, b) => b.revenue - a.revenue);

  // Payment breakdown
  let cashRevenue = 0;
  let onlineRevenue = 0;
  bookings.forEach((b) => {
    const mode = (b.payment_mode || 'cash').toLowerCase();
    if (mode === 'cash') {
      cashRevenue += b.total_amount || 0;
    } else {
      onlineRevenue += b.total_amount || 0;
    }
  });

  // Send the email
  const result = await sendDailyReport({
    email: cafeEmail,
    cafeName,
    reportDate: formatReportDate(now),
    totalRevenue,
    yesterdayRevenue,
    revenueChange,
    totalBookings,
    yesterdayBookings: yesterdayBookingsCount,
    bookingsChange,
    fnbRevenue,
    fnbItemsSold,
    topSellingItems,
    consoleBreakdown,
    cashRevenue,
    onlineRevenue,
  });

  return result;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    console.error("[Daily Report Cron] CRON_SECRET is not set; rejecting request.");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get current hour in IST (UTC+5:30)
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset);
    const currentHour = istTime.getUTCHours();

    console.log(`[Daily Report Cron] Running at IST hour: ${currentHour}`);

    // Fetch all active cafes with email
    const { data: cafes, error: cafesError } = await supabase
      .from('cafes')
      .select('id, name, email, opening_hours')
      .eq('is_active', true)
      .not('email', 'is', null);

    if (cafesError) {
      console.error('[Daily Report Cron] Error fetching cafes:', cafesError);
      return NextResponse.json({ error: 'Failed to fetch cafes' }, { status: 500 });
    }

    if (!cafes || cafes.length === 0) {
      return NextResponse.json({ message: 'No cafes to process' });
    }

    const results: { cafeId: string; cafeName: string; success: boolean; error?: string }[] = [];

    for (const cafe of cafes) {
      // Send report to all cafes with email (runs once daily at 11 PM IST)
      if (cafe.email) {
        console.log(`[Daily Report Cron] Sending report for ${cafe.name}`);

        try {
          const result = await generateReportForCafe(cafe.id, cafe.name, cafe.email);
          results.push({
            cafeId: cafe.id,
            cafeName: cafe.name,
            success: result.success,
            error: result.error,
          });
        } catch (err) {
          console.error(`[Daily Report Cron] Error for cafe ${cafe.name}:`, err);
          results.push({
            cafeId: cafe.id,
            cafeName: cafe.name,
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    }

    return NextResponse.json({
      message: 'Daily report cron completed',
      currentHourIST: currentHour,
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error('[Daily Report Cron] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
