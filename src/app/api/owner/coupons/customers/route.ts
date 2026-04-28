import { NextRequest, NextResponse } from "next/server";
import {
  requireOwnerCafeAccess,
  requireOwnerContext,
} from "@/lib/ownerAuth";
import { getBookingRevenueTotal } from "@/lib/ownerRevenue";

export const dynamic = 'force-dynamic';

type CustomerBookingRow = {
  id: string;
  user_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  total_amount?: number | string | null;
  booking_date?: string | null;
  created_at?: string | null;
  status?: string | null;
  source?: string | null;
  payment_mode?: string | null;
  booking_items?: Array<{ id?: string | null; price?: number | string | null }> | null;
  booking_orders?: Array<{ id?: string | null; total_price?: number | string | null }> | null;
};

type ProfileRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
};

type CouponCustomerSummary = {
  id: string;
  name: string;
  phone: string;
  visits: number;
  total_spent: number;
  last_visit: string;
  coupon_sent: boolean;
};

// GET /api/owner/coupons/customers?cafeId=...&search=...
// If `search` is provided, returns up to 10 matching customers quickly (for autocomplete).
// Without `search`, returns full customer list with stats (for coupons page).
export async function GET(request: NextRequest) {
  const auth = await requireOwnerContext(request);
  if (auth.response) {
    return auth.response;
  }

  const { ownerId, supabase } = auth.context;
  const cafeId = request.nextUrl.searchParams.get('cafeId');
  const search = request.nextUrl.searchParams.get('search')?.trim() || '';

  if (!cafeId) return NextResponse.json({ error: "cafeId required" }, { status: 400 });

  const accessResponse = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
  if (accessResponse) {
    return accessResponse;
  }

  // Fast path: autocomplete search — targeted query, no full customer map build
  if (search.length >= 2) {
    const { data, error } = await supabase
      .from('bookings')
      .select('customer_name, customer_phone')
      .eq('cafe_id', cafeId)
      .neq('status', 'cancelled')
      .neq('payment_mode', 'owner')
      .or(`customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%`)
      .not('customer_phone', 'is', null)
      .not('customer_name', 'is', null)
      .limit(20);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Deduplicate by phone
    const seen = new Set<string>();
    const results: { name: string; phone: string }[] = [];
    for (const row of data || []) {
      if (row.customer_phone && !seen.has(row.customer_phone)) {
        seen.add(row.customer_phone);
        results.push({ name: row.customer_name, phone: row.customer_phone });
        if (results.length >= 10) break;
      }
    }
    return NextResponse.json(results);
  }

  // Full path: load all customers for coupons page
  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('id, user_id, customer_name, customer_phone, total_amount, booking_date, created_at, status, source, payment_mode, booking_items(id, price), booking_orders(id, total_price)')
    .eq('cafe_id', cafeId)
    .neq('payment_mode', 'owner');

  if (bookingsError) return NextResponse.json({ error: bookingsError.message }, { status: 500 });

  if (!bookings || bookings.length === 0) return NextResponse.json([]);

  const bookingRows = bookings as CustomerBookingRow[];
  const userIds = [...new Set(bookingRows.map((b) => b.user_id).filter((id): id is string => Boolean(id)))];
  const userProfiles = new Map<string, { name: string; phone: string | null }>();

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, phone')
      .in('id', userIds);

    (profiles as ProfileRow[] | null)?.forEach((p) => {
      userProfiles.set(p.id, {
        name: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown',
        phone: p.phone || null,
      });
    });
  }

  const customerMap = new Map<string, CouponCustomerSummary>();
  bookingRows.forEach((booking) => {
    if (booking.status === 'cancelled') return;
    const userProfile = booking.user_id ? userProfiles.get(booking.user_id) : null;
    const phone = booking.customer_phone || userProfile?.phone;
    if (!phone) return;
    const customerName = booking.customer_name || userProfile?.name || 'Unknown';
    const existing = customerMap.get(phone);
    if (existing) {
      existing.visits += 1;
      existing.total_spent += getBookingRevenueTotal(booking);
      const bookingDate = booking.booking_date || booking.created_at;
      if (bookingDate && new Date(bookingDate) > new Date(existing.last_visit)) {
        existing.last_visit = bookingDate;
        existing.name = customerName;
      }
    } else {
      customerMap.set(phone, {
        id: phone,
        name: customerName,
        phone,
        visits: 1,
        total_spent: getBookingRevenueTotal(booking),
        last_visit: booking.booking_date || booking.created_at || new Date().toISOString(),
        coupon_sent: false,
      });
    }
  });

  const customers = Array.from(customerMap.values()).sort((a, b) => b.total_spent - a.total_spent);
  return NextResponse.json(customers);
}
