/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { requireOwnerContext } from "@/lib/ownerAuth";
import { completeEndedBookings } from "@/lib/autoComplete";
import { normalizeRealtimeBookingStatus } from "@/lib/bookingFilters";
import { getIndiaDateDaysAgo, getIndiaDateString } from "@/lib/indiaTime";
import { buildStationPricingMap, dedupeStationPricingRows } from "@/lib/stationNames";
import { loadOwnerRevenueStats } from "@/lib/ownerDashboardStats";

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
  source, payment_mode, created_at, customer_name, customer_phone, deleted_at,
  booking_items (id, console, quantity, price, title),
  booking_orders (id, item_name, quantity, total_price)
`;

const BOOKING_SELECT_WITH_UPDATED_AT = `
  id, cafe_id, user_id, booking_date, start_time, duration, total_amount, status,
  updated_at,
  source, payment_mode, created_at, customer_name, customer_phone, deleted_at,
  booking_items (id, console, quantity, price, title),
  booking_orders (id, item_name, quantity, total_price)
`;

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

// Customers skip station/console pricing, not subscriptions (membership spend).
// Note: 'bookings' is not in this set so pricing still loads for the edit modal.
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
        created_at, is_active, peak_hours, popular_games, offers,
        upi_id, upi_display_name
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
        dashboardStats: null,
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
        .select(bookingSelect, { count: "exact" })
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

    // Customers still skip station pricing, but spend and the Members filter
    // need subscriptions. Membership checkout is billed on the subscription
    // (and a source=membership booking); omitting this list left Spent at ₹0.
    const subscriptionsPromise =
      isPricingOnlyTab
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
              id, cafe_id, amount_paid, purchase_date, expiry_date, payment_mode, customer_name,
              customer_phone, status, assigned_console_station, timer_active, timer_start_time,
              hours_purchased, hours_remaining, membership_plans(name, console_type, plan_type, hours, validity_days)
            `)
            .in('cafe_id', cafeIds)
            .or(`timer_active.eq.true,and(purchase_date.gte.${todayStr}T00:00:00+05:30,purchase_date.lte.${todayStr}T23:59:59+05:30)`)
            .order('created_at', { ascending: false });

    // Await all parallel fetches — use allSettled so one failure doesn't blank the dashboard
    const results = await Promise.allSettled([
      stationPricingPromise,
      consolePricingPromise,
      bookingsPromise,
      plansPromise,
      subscriptionsPromise
    ]);

    const getValue = <T,>(result: PromiseSettledResult<T>, fallback: T, label: string): T => {
      if (result.status === 'rejected') {
        console.error(`[owner/data] ${label} fetch failed:`, result.reason);
        return fallback;
      }
      return result.value;
    };

    const stationPricingRes = getValue(results[0], { data: [], error: null }, 'stationPricing');
    const consolePricingRes = getValue(results[1], { data: [], error: null }, 'consolePricing');
    const bookingsRes      = getValue(results[2], { data: [], error: null, count: null }, 'bookings');
    const plansRes         = getValue(results[3], { data: [], error: null }, 'membershipPlans');
    const subscriptionsRes = getValue(results[4], { data: [], error: null }, 'subscriptions');

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
    const uniqueTypes: string[] = [];
    const sortedStations = dedupeStationPricingRows((stationPricingRes.data || []) as any[]);
    const stationPricingMap = buildStationPricingMap(sortedStations);
    sortedStations.forEach((pricing: any) => {
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

    // Keep the DB filter and an in-process guard so stale/fallback payloads cannot leak deleted rows.
    let ownerBookings = (bookingsResult.data || []).filter((booking: any) => !booking.deleted_at);
    
    const endedIds: string[] = [];
    const confirmedIds: string[] = [];

    ownerBookings = ownerBookings.map((b: any) => {
      const normalized = normalizeRealtimeBookingStatus(b);
      if (normalized.status !== b.status) {
        if (normalized.status === "completed") endedIds.push(b.id);
        if (normalized.status === "confirmed") confirmedIds.push(b.id);
      }
      return normalized;
    });

    // Awaited, not fired and forgotten.
    //
    // This used to run as `void (async () => …)()` after the response was
    // built. On Vercel the function can be frozen the moment it responds, so
    // that work — marking the booking complete, locking its machine, awarding
    // the day's points — was only ever best-effort, and silently skipped
    // whenever the platform got there first. Sessions were left in-progress
    // with no points given and no error anywhere.
    //
    // The cost is that this response waits for it. That is the right trade:
    // the numbers below are read off these same rows, so returning before the
    // write lands means answering with figures this request already knows are
    // stale.
    if (endedIds.length > 0 || confirmedIds.length > 0) {
      try {
        if (endedIds.length > 0) {
          await completeEndedBookings(supabase, endedIds);
        }
        if (confirmedIds.length > 0) {
          const { error } = await supabase.from("bookings").update({ status: "confirmed" }).in("id", confirmedIds);
          if (error) console.error('Auto-confirm future bookings failed:', error.message, 'ids:', confirmedIds);
        }
      } catch (err: unknown) {
        // Never fatal: the dashboard still renders from what was read above.
        console.error('Realtime booking status update unexpected error:', err);
      }
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

    const { count: windowBookingCount } = isPricingOnlyTab
      ? { count: bookingsResult.count ?? 0 }
      : { count: bookingsResult.count ?? enrichedBookings.length };

    const dashboardStats = isPricingOnlyTab
      ? null
      : await loadOwnerRevenueStats(supabase, cafeIds);

    return NextResponse.json({
      cafes: ownerCafes,
      bookings: enrichedBookings,
      stationPricing: stationPricingMap,
      consolePricing: consolePricingMap,
      cafeConsoles: sortedStations,
      availableConsoleTypes: uniqueTypes,
      membershipPlans: plansRes.data || [],
      subscriptions: subscriptionsRes.data || [],
      totalBookingsCount: windowBookingCount ?? enrichedBookings.length,
      dashboardStats,
    });
  } catch (err: any) {
    console.error("Error loading owner data:", err);
    return NextResponse.json({ error: err.message || "Failed to load data" }, { status: 500 });
  }
}
