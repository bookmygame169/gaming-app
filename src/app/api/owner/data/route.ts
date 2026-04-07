/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { requireOwnerContext } from "@/lib/ownerAuth";

export const dynamic = 'force-dynamic';

type OwnerDataScope = "dashboard" | "full";
type BookingQueryResult = {
  count?: number | null;
  data: any[] | null;
  error: { message?: string | null } | null;
};

const DASHBOARD_BOOKING_LOOKBACK_DAYS = 7;
const DASHBOARD_BOOKING_LIMIT = 300;
const FULL_BOOKING_LIMIT = 500;
const FULL_BOOKING_LOOKBACK_DAYS = 90;

const BOOKING_SELECT_BASE = `
  id, cafe_id, user_id, booking_date, start_time, duration, total_amount, status,
  source, payment_mode, created_at, customer_name, customer_phone,
  booking_items (id, console, quantity, price, title),
  booking_orders (id, item_name, quantity, total_price)
`;

const BOOKING_SELECT_WITH_UPDATED_AT = `
  id, cafe_id, user_id, booking_date, start_time, duration, total_amount, status,
  updated_at,
  source, payment_mode, created_at, customer_name, customer_phone,
  booking_items (id, console, quantity, price, title),
  booking_orders (id, item_name, quantity, total_price)
`;

function getIndiaDateString(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Failed to format India date string");
  }

  return `${year}-${month}-${day}`;
}

function getIndiaDateDaysAgo(daysAgo: number): string {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return getIndiaDateString(date);
}

function isMissingBookingsUpdatedAtError(error: { message?: string | null } | null | undefined): boolean {
  const message = error?.message?.toLowerCase() || "";
  return message.includes("bookings.updated_at") && message.includes("does not exist");
}

async function getRequestedScope(request: NextRequest): Promise<{ scope: OwnerDataScope; tab: string }> {
  try {
    const body = await request.json();
    return {
      scope: body?.scope === "full" ? "full" : "dashboard",
      tab: body?.tab || "",
    };
  } catch {
    return { scope: "dashboard", tab: "" };
  }
}

// Tabs that only need bookings — skip subscriptions, pricing, profiles
// Note: 'bookings' intentionally excluded so pricing loads for edit modal auto-calc
const BOOKINGS_ONLY_TABS = new Set(['customers']);
// Tabs that only need pricing — skip bookings, subscriptions, profiles
const PRICING_ONLY_TABS = new Set(['billing']);

export async function POST(request: NextRequest) {
  try {
    const { scope, tab } = await getRequestedScope(request);
    const auth = await requireOwnerContext(request);
    if (auth.response) {
      return auth.response;
    }

    const { ownerId, supabase } = auth.context;
    const todayStr = getIndiaDateString();
    const dashboardStartDate = getIndiaDateDaysAgo(DASHBOARD_BOOKING_LOOKBACK_DAYS);

    // bookings/customers tabs only need bookings data — skip everything else
    const isBookingsOnlyTab = scope === "full" && BOOKINGS_ONLY_TABS.has(tab);
    // billing tab only needs pricing data — skip bookings, subscriptions, profiles
    const isPricingOnlyTab = PRICING_ONLY_TABS.has(tab);

    // 1. Fetch Cafes
    const { data: cafeRows, error: cafesError } = await supabase
      .from("cafes")
      .select(`
        id, name, slug, address, description, phone, email, opening_hours, hourly_price,
        google_maps_url, instagram_url, cover_url, price_starts_from,
        monitor_details, processor_details, gpu_details, ram_details, accessories_details,
        ps5_count, ps4_count, xbox_count, pc_count, pool_count, snooker_count, arcade_count, vr_count, steering_wheel_count, racing_sim_count,
        created_at, is_active, peak_hours, popular_games, offers
      `)
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false });

    if (cafesError) throw cafesError;

    const ownerCafes = cafeRows ?? [];

    if (!ownerCafes.length) {
      return NextResponse.json({
        cafes: [], bookings: [], stationPricing: {}, consolePricing: {},
        cafeConsoles: [], availableConsoleTypes: [], membershipPlans: [],
        subscriptions: [], totalBookingsCount: 0,
      });
    }

    const cafeIds = ownerCafes.map((c: any) => c.id);

    // 2. Start parallel fetches
    const shouldLoadPricing = (scope === "full" && !isBookingsOnlyTab) || isPricingOnlyTab;

    const stationPricingPromise = shouldLoadPricing
      ? supabase
          .from("station_pricing")
          .select("*")
          .in("cafe_id", cafeIds)
      : Promise.resolve({ data: [], error: null });

    const consolePricingPromise = shouldLoadPricing
      ? supabase
          .from("console_pricing")
          .select("cafe_id, console_type, quantity, duration_minutes, price")
          .in("cafe_id", cafeIds)
      : Promise.resolve({ data: [], error: null });

    const loadBookings = async (includeUpdatedAt: boolean): Promise<BookingQueryResult> => {
      if (isPricingOnlyTab) {
        return { data: [], error: null, count: null };
      }

      const bookingSelect = includeUpdatedAt
        ? BOOKING_SELECT_WITH_UPDATED_AT
        : BOOKING_SELECT_BASE;

      if (scope === "full") {
        return supabase
          .from("bookings")
          .select(bookingSelect, { count: "exact" })
          .in("cafe_id", cafeIds)
          .is("deleted_at", null)
          .gte("booking_date", getIndiaDateDaysAgo(FULL_BOOKING_LOOKBACK_DAYS))
          .order("created_at", { ascending: false })
          .limit(FULL_BOOKING_LIMIT);
      }

      return supabase
        .from("bookings")
        .select(bookingSelect)
        .in("cafe_id", cafeIds)
        .is("deleted_at", null)
        .gte("booking_date", dashboardStartDate)
        .order("created_at", { ascending: false })
        .limit(DASHBOARD_BOOKING_LIMIT);
    };

    const bookingsPromise = loadBookings(true);

    const plansPromise = shouldLoadPricing
      ? supabase
          .from('membership_plans')
          .select('*')
          .in('cafe_id', cafeIds)
          .eq('is_active', true)
          .order('price')
      : Promise.resolve({ data: [], error: null });

    const subscriptionsPromise =
      isBookingsOnlyTab || isPricingOnlyTab
        ? Promise.resolve({ data: [], error: null })
        : scope === "full"
        ? supabase
            .from('subscriptions')
            .select('*, membership_plans(*)')
            .in('cafe_id', cafeIds)
            .gte('purchase_date', `${getIndiaDateDaysAgo(FULL_BOOKING_LOOKBACK_DAYS)}T00:00:00+05:30`)
            .order('created_at', { ascending: false })
        : supabase
            .from('subscriptions')
            .select(`
              id, amount_paid, purchase_date, customer_name, assigned_console_station,
              timer_active, timer_start_time, hours_remaining, membership_plans(name, console_type)
            `)
            .in('cafe_id', cafeIds)
            .or(`timer_active.eq.true,and(purchase_date.gte.${todayStr}T00:00:00+05:30,purchase_date.lte.${todayStr}T23:59:59+05:30)`)
            .order('created_at', { ascending: false });

    // Await all parallel fetches
    const [
      stationPricingRes,
      consolePricingRes,
      bookingsRes,
      plansRes,
      subscriptionsRes
    ] = await Promise.all([
      stationPricingPromise,
      consolePricingPromise,
      bookingsPromise,
      plansPromise,
      subscriptionsPromise
    ]);

    let bookingsResult: BookingQueryResult = bookingsRes;
    if (isMissingBookingsUpdatedAtError(bookingsRes.error)) {
      const fallbackBookingsRes = await loadBookings(false);
      if (fallbackBookingsRes.error) {
        throw fallbackBookingsRes.error;
      }

      bookingsResult = {
        ...fallbackBookingsRes,
        data: (fallbackBookingsRes.data || []).map((booking: any) => ({
          ...booking,
          updated_at: null,
        })),
      };
    }

    if (bookingsResult.error) throw bookingsResult.error;

    // Process Station Pricing
    const stationPricingMap: Record<string, any> = {};
    const uniqueTypes: string[] = [];
    const sortedStations = [...(stationPricingRes.data || [])].sort(
      (a: any, b: any) => (a.station_number || 0) - (b.station_number || 0)
    );
    stationPricingRes.data?.forEach((pricing: any) => {
      stationPricingMap[pricing.station_name] = pricing;
      if (!uniqueTypes.includes(pricing.station_type)) uniqueTypes.push(pricing.station_type);
    });

    // Process Console Pricing
    const consolePricingMap: Record<string, any> = {};
    consolePricingRes.data?.forEach((item: any) => {
      if (!consolePricingMap[item.cafe_id]) consolePricingMap[item.cafe_id] = {};
      if (!consolePricingMap[item.cafe_id][item.console_type]) {
        consolePricingMap[item.cafe_id][item.console_type] = {
          qty1_30min: null, qty1_60min: null, qty2_30min: null, qty2_60min: null,
          qty3_30min: null, qty3_60min: null, qty4_30min: null, qty4_60min: null,
        };
      }
      const key = `qty${item.quantity}_${item.duration_minutes}min`;
      consolePricingMap[item.cafe_id][item.console_type][key] = item.price;
    });

    // deleted_at now filtered in DB query — no need to filter in-process
    let ownerBookings = bookingsResult.data || [];
    
    // Auto-complete logic for bookings — use India timezone to match booking_date/start_time
    const now = new Date();
    const indiaTimeStr = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).format(now);
    const [indiaHour, indiaMinute] = indiaTimeStr.split(':').map(Number);
    const currentMinutes = indiaHour * 60 + indiaMinute;
    const endedIds: string[] = [];

    ownerBookings = ownerBookings.map((b: any) => {
        if (b.status === 'in-progress' || b.status === 'confirmed') {
            if (b.booking_date < todayStr) {
                b.status = 'completed'; // Mutate in memory
                endedIds.push(b.id);
            } else if (b.booking_date === todayStr && b.start_time && b.duration) {
                const timeParts = b.start_time.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
                if (timeParts) {
                    let hours = parseInt(timeParts[1]);
                    const minutes = parseInt(timeParts[2]);
                    const period = timeParts[3]?.toLowerCase();
                    if (period === 'pm' && hours !== 12) hours += 12;
                    else if (period === 'am' && hours === 12) hours = 0;
                    if (currentMinutes > hours * 60 + minutes + b.duration) {
                        b.status = 'completed';
                        endedIds.push(b.id);
                    }
                }
            }
        }
        return b;
    });

    // Fire & forget DB update for completed bookings (don't block the request)
    if (endedIds.length > 0) {
        supabase.from("bookings").update({ status: "completed" }).in("id", endedIds)
          .then(({ error }) => { if (error) console.error('Auto-complete bookings failed:', error.message); });
    }

    // Profiles enrichment keeps online bookings editable across dashboard and bookings views.
    const userProfiles = new Map();

    if (!isPricingOnlyTab) {
      const userIds = [...new Set(ownerBookings.map((b: any) => b.user_id).filter(Boolean))];
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
    }

    const enrichedBookings = ownerBookings.map((booking: any) => {
      const cafe = ownerCafes.find((c: any) => c.id === booking.cafe_id);
      const userProfile = booking.user_id ? userProfiles.get(booking.user_id) : null;
      return {
        ...booking,
        user_name: userProfile?.name || booking.customer_name || null,
        user_email: null,
        user_phone: userProfile?.phone || booking.customer_phone || null,
        cafe_name: cafe?.name || null,
      };
    });

    return NextResponse.json({
      cafes: ownerCafes,
      bookings: enrichedBookings,
      stationPricing: stationPricingMap,
      consolePricing: consolePricingMap,
      cafeConsoles: sortedStations,
      availableConsoleTypes: uniqueTypes,
      membershipPlans: plansRes.data || [],
      subscriptions: subscriptionsRes.data || [],
      totalBookingsCount: scope === "full" ? (bookingsResult.count ?? enrichedBookings.length) : 0,
    });
  } catch (err: any) {
    console.error("Error loading owner data:", err);
    return NextResponse.json({ error: err.message || "Failed to load data" }, { status: 500 });
  }
}
