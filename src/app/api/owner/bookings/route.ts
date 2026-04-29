import { NextRequest, NextResponse } from "next/server";
import { requireOwnerContext } from "@/lib/ownerAuth";
import { isSessionBooking, normalizeRealtimeBookingStatus } from "@/lib/bookingFilters";
import { getBookingRevenueTotal, getOwnerPaymentBucket } from "@/lib/ownerRevenue";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const ALLOWED_PAGE_SIZES = [10, 30, 50, 100];
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

type OwnedCafeRecord = { id: string };
type BookingListRecord = {
  customer_name?: string | null;
  customer_phone?: string | null;
  deleted_at?: string | null;
  updated_at?: string | null;
  user_id?: string | null;
} & Record<string, unknown>;
type BookingQueryResult = {
  count: number | null;
  data: unknown[] | null;
  error: { message?: string | null } | null;
};
type SingleBookingQueryResult = {
  data: unknown | null;
  error: { message?: string | null } | null;
};
type ProfileRecord = {
  first_name: string | null;
  id: string;
  last_name: string | null;
  phone: string | null;
};
type ProfileIdRecord = {
  id: string;
};
type ProfileLookupResult = {
  data: unknown[] | null;
  error: { message?: string | null } | null;
};
type ProfileLookupClient = {
  from: (table: string) => {
    select: (columns: string) => {
      or: (filters: string) => {
        limit: (count: number) => PromiseLike<ProfileLookupResult>;
      };
    };
  };
};
type BookingFilterQuery = {
  eq: (column: string, value: string) => BookingFilterQuery;
  gte: (column: string, value: string) => BookingFilterQuery;
  lte: (column: string, value: string) => BookingFilterQuery;
  neq: (column: string, value: string) => BookingFilterQuery;
  or: (filters: string) => BookingFilterQuery;
  order: (column: string, options: { ascending: boolean }) => {
    range: (from: number, to: number) => PromiseLike<BookingQueryResult>;
  };
};
type BookingSummaryQuery = BookingFilterQuery & {
  order: (column: string, options: { ascending: boolean }) => PromiseLike<BookingQueryResult>;
};
type BookingSummaryRecord = {
  booking_date?: string | null;
  booking_items?: { id?: string | null; price?: number | string | null; title?: string | null }[] | null;
  booking_orders?: { id?: string | null; total_price?: number | string | null }[] | null;
  deleted_at?: string | null;
  payment_mode?: string | null;
  id?: string | null;
  duration?: number | null;
  start_time?: string | null;
  status?: string | null;
  total_amount?: number | null;
};
type BookingSummary = {
  cashTotal: number;
  completed: number;
  inProgress: number;
  pending: number;
  upiTotal: number;
};

function isMissingBookingsUpdatedAtError(error: { message?: string | null } | null | undefined): boolean {
  const message = error?.message?.toLowerCase() || "";
  return message.includes("bookings.updated_at") && message.includes("does not exist");
}

function sanitizeSearchTerm(search: string): string {
  return search.replace(/[(),]/g, " ").replace(/\s+/g, " ").trim();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function findMatchingProfileIds(supabase: unknown, search: string): Promise<string[]> {
  const tokens = sanitizeSearchTerm(search).split(" ").filter(Boolean).slice(0, 4);
  if (tokens.length === 0) return [];

  const clauses = tokens.flatMap((token) => [
    `first_name.ilike.%${token}%`,
    `last_name.ilike.%${token}%`,
    `phone.ilike.%${token}%`,
  ]);

  const client = supabase as ProfileLookupClient;
  const { data, error } = await client
    .from("profiles")
    .select("id")
    .or(clauses.join(","))
    .limit(100);

  if (error) {
    throw new Error(error.message || "Failed to search profiles");
  }

  return [...new Set(((data || []) as ProfileIdRecord[]).map((profile) => profile.id).filter(Boolean))];
}

function applyBookingFilters(query: unknown, {
  status,
  source,
  dateFrom,
  dateTo,
  search,
  matchingUserIds,
}: {
  dateFrom: string;
  dateTo: string;
  matchingUserIds: string[];
  search: string;
  source: string;
  status: string;
}): BookingFilterQuery {
  let nextQuery = query as BookingFilterQuery;

  if (status !== "all") {
    nextQuery = nextQuery.eq("status", status);
  }

  if (source === "membership") {
    nextQuery = nextQuery.eq("source", "membership");
  } else if (source === "normal") {
    nextQuery = nextQuery.neq("source", "membership");
  }

  if (dateFrom) nextQuery = nextQuery.gte("booking_date", dateFrom);
  if (dateTo) nextQuery = nextQuery.lte("booking_date", dateTo);

  const safeSearch = sanitizeSearchTerm(search);
  if (safeSearch) {
    const compactSearch = safeSearch.replace(/\s+/g, "");
    const clauses = [
      `customer_name.ilike.%${safeSearch}%`,
      `customer_phone.ilike.%${safeSearch}%`,
    ];

    if (isUuid(compactSearch)) {
      clauses.push(`id.eq.${compactSearch}`);
    }

    if (matchingUserIds.length > 0) {
      clauses.push(`user_id.in.(${matchingUserIds.join(",")})`);
    }

    nextQuery = nextQuery.or(clauses.join(","));
  }

  return nextQuery;
}

function buildBookingSummary(summaryRows: BookingSummaryRecord[]): BookingSummary {
  return summaryRows.reduce<BookingSummary>((acc, booking) => {
    if (booking.deleted_at || !isSessionBooking(booking)) return acc;

    const amount = getBookingRevenueTotal(booking);
    const paymentBucket = getOwnerPaymentBucket(booking.payment_mode);
    const status = booking.status?.toLowerCase() || "";

    if (status === "completed") acc.completed += 1;
    if (status === "in-progress") acc.inProgress += 1;
    if (status === "confirmed" || status === "pending") acc.pending += 1;

    if (status !== "cancelled") {
      if (paymentBucket === "cash") acc.cashTotal += amount;
      if (paymentBucket === "upi") acc.upiTotal += amount;
    }

    return acc;
  }, {
    cashTotal: 0,
    completed: 0,
    inProgress: 0,
    pending: 0,
    upiTotal: 0,
  });
}

function normalizeRealtimeBookings(bookings: BookingSummaryRecord[]): { endedIds: string[]; normalized: BookingSummaryRecord[] } {
  const endedIds = new Set<string>();
  const normalized = bookings.map((booking) => {
    const nextBooking = normalizeRealtimeBookingStatus(booking);
    if (booking.status !== nextBooking.status && nextBooking.status === "completed" && nextBooking.id) {
      endedIds.add(nextBooking.id);
    }
    return nextBooking;
  });

  return {
    endedIds: Array.from(endedIds),
    normalized,
  };
}

// GET /api/owner/bookings — paginated, server-side filtered bookings for the Bookings tab
export async function GET(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;

    const { ownerId, supabase } = auth.context;
    const { searchParams } = new URL(request.url);

    const cafeId = searchParams.get("cafeId");
    const bookingId = searchParams.get("bookingId");
    const bookingDate = searchParams.get("bookingDate") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const requestedSize = parseInt(searchParams.get("pageSize") || "30", 10);
    const PAGE_SIZE = ALLOWED_PAGE_SIZES.includes(requestedSize) ? requestedSize : 30;
    const status = searchParams.get("status") || "all";
    const source = searchParams.get("source") || "all";
    const search = searchParams.get("search") || "";
    const dateFrom = searchParams.get("dateFrom") || "";
    const dateTo = searchParams.get("dateTo") || "";

    // Verify cafe ownership
    const { data: cafes } = await supabase
      .from("cafes")
      .select("id")
      .eq("owner_id", ownerId);

    const ownedCafeIds = ((cafes || []) as OwnedCafeRecord[]).map((c) => c.id);
    if (ownedCafeIds.length === 0) {
      return NextResponse.json({ bookings: [], total: 0, page, pageSize: PAGE_SIZE });
    }

    const targetCafeIds = cafeId && ownedCafeIds.includes(cafeId)
      ? [cafeId]
      : ownedCafeIds;

    const offset = (page - 1) * PAGE_SIZE;

    const enrichBookings = async (rawBookings: BookingListRecord[]) => {
      const bookings = rawBookings.filter((booking) => !booking.deleted_at);
      const userIds = [...new Set(bookings.map((booking) => booking.user_id).filter((userId): userId is string => Boolean(userId)))];
      const userProfiles = new Map<string, { name: string | null; phone: string | null }>();

      if (userIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, phone")
          .in("id", userIds);

        if (profilesError) {
          throw new Error(profilesError.message);
        }

        (profiles as ProfileRecord[] | null)?.forEach((profile) => {
          const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || null;
          userProfiles.set(profile.id, { name: fullName, phone: profile.phone || null });
        });
      }

      return bookings.map((booking) => {
        const userProfile = booking.user_id ? userProfiles.get(booking.user_id) : null;
        return {
          ...booking,
          user_name: userProfile?.name || booking.customer_name || null,
          user_email: null,
          user_phone: userProfile?.phone || booking.customer_phone || null,
        };
      });
    };

    const matchingUserIds = search ? await findMatchingProfileIds(supabase, search) : [];

    const runSingleBookingQuery = async (includeUpdatedAt: boolean): Promise<SingleBookingQueryResult> => {
      return await supabase
        .from("bookings")
        .select(includeUpdatedAt ? BOOKING_SELECT_WITH_UPDATED_AT : BOOKING_SELECT_BASE)
        .eq("id", bookingId!)
        .in("cafe_id", targetCafeIds)
        .is("deleted_at", null)
        .maybeSingle() as unknown as SingleBookingQueryResult;
    };

    const runSingleBookingScan = async (includeUpdatedAt: boolean): Promise<SingleBookingQueryResult> => {
      let query = supabase
        .from("bookings")
        .select(includeUpdatedAt ? BOOKING_SELECT_WITH_UPDATED_AT : BOOKING_SELECT_BASE)
        .in("cafe_id", targetCafeIds)
        .is("deleted_at", null);

      if (bookingDate) {
        query = query.eq("booking_date", bookingDate);
      }

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(500) as unknown as BookingQueryResult;

      return {
        data: ((data || []) as BookingListRecord[]).find((booking) => booking.id === bookingId) || null,
        error,
      };
    };

    const runBookingQuery = async (includeUpdatedAt: boolean): Promise<BookingQueryResult> => {
      let query: unknown = supabase
        .from("bookings")
        .select(includeUpdatedAt ? BOOKING_SELECT_WITH_UPDATED_AT : BOOKING_SELECT_BASE, { count: "exact" })
        .in("cafe_id", targetCafeIds)
        .is("deleted_at", null);

      query = applyBookingFilters(query, {
        dateFrom,
        dateTo,
        matchingUserIds,
        search,
        source,
        status,
      });

      return await (query as BookingFilterQuery)
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1) as unknown as BookingQueryResult;
    };

    const runBookingSummaryQuery = async (): Promise<BookingQueryResult> => {
      let query: unknown = supabase
        .from("bookings")
        .select("id, booking_date, start_time, duration, status, payment_mode, total_amount, deleted_at, booking_items(id, price, title), booking_orders(id, total_price)", { count: "exact" })
        .in("cafe_id", targetCafeIds)
        .is("deleted_at", null);

      query = applyBookingFilters(query, {
        dateFrom,
        dateTo,
        matchingUserIds,
        search,
        source,
        status,
      });

      return await (query as BookingSummaryQuery).order("created_at", { ascending: false }) as unknown as BookingQueryResult;
    };

    if (bookingId) {
      let { data, error } = await runSingleBookingQuery(true);
      if (isMissingBookingsUpdatedAtError(error)) {
        const fallbackResult = await runSingleBookingQuery(false);
        data = fallbackResult.data
          ? { ...(fallbackResult.data as Record<string, unknown>), updated_at: null }
          : null;
        error = fallbackResult.error;
      }

      if (!error && !data) {
        const scanResult = await runSingleBookingScan(true);
        if (isMissingBookingsUpdatedAtError(scanResult.error)) {
          const fallbackScanResult = await runSingleBookingScan(false);
          data = fallbackScanResult.data
            ? { ...(fallbackScanResult.data as Record<string, unknown>), updated_at: null }
            : null;
          error = fallbackScanResult.error;
        } else {
          data = scanResult.data;
          error = scanResult.error;
        }
      }

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!data) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

      const normalizedBooking = normalizeRealtimeBookingStatus(data as BookingSummaryRecord) as BookingListRecord;
      const enrichedBookings = await enrichBookings([normalizedBooking]);
      const booking = enrichedBookings[0];

      if (!booking) {
        return NextResponse.json({ error: "Booking not found" }, { status: 404 });
      }

      return NextResponse.json({ booking });
    }

    let { data, error } = await runBookingQuery(true);
    if (isMissingBookingsUpdatedAtError(error)) {
      const fallbackResult = await runBookingQuery(false);
      const fallbackData = ((fallbackResult.data || []) as Record<string, unknown>[]);
      data = fallbackData.map((booking) => ({
        ...booking,
        updated_at: null,
      }));
      error = fallbackResult.error;
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const summaryResult = await runBookingSummaryQuery();
    if (summaryResult.error) {
      return NextResponse.json({ error: summaryResult.error.message }, { status: 500 });
    }

    const rawBookings = (data || []) as BookingListRecord[];
    const normalizedPageBookings = normalizeRealtimeBookings(rawBookings as BookingSummaryRecord[]);
    const summaryRows = ((summaryResult.data || []) as BookingSummaryRecord[]);
    const normalizedSummaryBookings = normalizeRealtimeBookings(summaryRows);
    const endedIds = [...new Set([...normalizedPageBookings.endedIds, ...normalizedSummaryBookings.endedIds])];

    if (endedIds.length > 0) {
      void (async () => {
        try {
          const { error: updateError } = await supabase.from("bookings").update({ status: "completed" }).in("id", endedIds);
          if (updateError) {
            console.error("Auto-complete bookings failed:", updateError.message, "ids:", endedIds);
          }
        } catch (updateErr: unknown) {
          console.error("Auto-complete bookings unexpected error:", updateErr);
        }
      })();
    }

    const visibleRawBookings = normalizedPageBookings.normalized.filter((booking) => isSessionBooking(booking));
    const enrichedBookings = await enrichBookings(visibleRawBookings as BookingListRecord[]);
    const visibleSummaryRows = normalizedSummaryBookings.normalized.filter((booking) => !booking.deleted_at && isSessionBooking(booking));

    return NextResponse.json({
      bookings: enrichedBookings,
      summary: buildBookingSummary(visibleSummaryRows),
      total: visibleSummaryRows.length,
      page,
      pageSize: PAGE_SIZE,
    });
  } catch (err: unknown) {
    console.error("Error fetching paginated bookings:", err);
    const message = err instanceof Error ? err.message : "Failed to fetch bookings";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
