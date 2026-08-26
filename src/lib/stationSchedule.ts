import type { SupabaseClient } from "@supabase/supabase-js";
import { getAssignedStations } from "@/lib/ownerStationAssignments";
import { getIndiaDateDaysAgo, getIndiaDateString } from "@/lib/indiaTime";
import { decideStationSession } from "@/lib/sessionPolicy";
import {
  sessionDurationMinutesForBooking,
  syncStationsForBooking,
} from "@/lib/stationSync";
import { completeEndedBookings } from "@/lib/autoComplete";

type DueBookingItem = {
  title: string | null;
  duration?: number | null;
  station_names?: string[] | null;
};

type DueBooking = {
  id: string;
  cafe_id?: string | null;
  booking_date: string | null;
  start_time: string | null;
  duration: number | null;
  status: string | null;
  deleted_at: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  booking_items?: DueBookingItem[] | null;
};

export type LiveStationRow = {
  cafe_id?: string | null;
  station_name?: string | null;
  session_id?: string | null;
  status?: string | null;
};

/**
 * True only when every assigned PC is already unlocked for this booking.
 * One unlocked seat must not skip the rest of a multi-PC session.
 */
export function allAssignedStationsUnlocked(
  assignedStationNames: string[],
  liveStations: LiveStationRow[],
  bookingId: string,
  cafeId?: string | null
): boolean {
  if (assignedStationNames.length === 0) return false;

  const unlocked = new Set(
    liveStations
      .filter((row) => {
        if (String(row.session_id || "") !== bookingId) return false;
        if ((row.status || "").toLowerCase() !== "unlocked") return false;
        if (cafeId && row.cafe_id && row.cafe_id !== cafeId) return false;
        return true;
      })
      .map((row) => (row.station_name || "").trim().toLowerCase())
      .filter(Boolean)
  );

  return assignedStationNames.every((name) => unlocked.has(name.trim().toLowerCase()));
}

type SelectResult = { data: unknown; error: { message: string } | null };

async function selectDueBookings(
  supabase: SupabaseClient,
  columns: string,
  options: { cafeId?: string | null; from: number; to: number; hasInstants: boolean }
): Promise<SelectResult> {
  const dates = [
    getIndiaDateDaysAgo(1),
    getIndiaDateString(),
    getIndiaDateDaysAgo(-1),
  ];
  const nowIso = new Date().toISOString();

  let query = supabase
    .from("bookings")
    .select(columns)
    .in("booking_date", dates)
    .in("status", ["confirmed", "in-progress"])
    .is("deleted_at", null)
    .range(options.from, options.to);

  if (options.hasInstants) {
    query = query
      .or(`starts_at.lte."${nowIso}",starts_at.is.null`)
      .order("starts_at", { ascending: true, nullsFirst: false });
  } else {
    query = query.order("booking_date", { ascending: true });
  }

  if (options.cafeId) {
    query = query.eq("cafe_id", options.cafeId);
  }

  return query;
}

async function loadDueBookings(
  supabase: SupabaseClient,
  cafeId?: string | null
): Promise<DueBooking[]> {
  const selects: Array<{ columns: string; hasInstants: boolean }> = [
    {
      columns:
        "id, cafe_id, booking_date, start_time, duration, status, deleted_at, starts_at, ends_at, booking_items(title, duration, station_names)",
      hasInstants: true,
    },
    {
      columns:
        "id, cafe_id, booking_date, start_time, duration, status, deleted_at, starts_at, ends_at, booking_items(title, station_names)",
      hasInstants: true,
    },
    {
      columns:
        "id, cafe_id, booking_date, start_time, duration, status, deleted_at, booking_items(title, station_names)",
      hasInstants: false,
    },
    {
      columns:
        "id, cafe_id, booking_date, start_time, duration, status, deleted_at, booking_items(title)",
      hasInstants: false,
    },
  ];

  const pageSize = 100;
  const hardCap = cafeId ? 500 : 2000;
  const bookings: DueBooking[] = [];
  let selectIndex = 0;

  for (let from = 0; from < hardCap; from += pageSize) {
    const to = Math.min(from + pageSize - 1, hardCap - 1);
    let result = await selectDueBookings(supabase, selects[selectIndex].columns, {
      cafeId,
      from,
      to,
      hasInstants: selects[selectIndex].hasInstants,
    });

    while (result.error && selectIndex < selects.length - 1) {
      selectIndex += 1;
      result = await selectDueBookings(supabase, selects[selectIndex].columns, {
        cafeId,
        from,
        to,
        hasInstants: selects[selectIndex].hasInstants,
      });
    }

    if (result.error) {
      throw new Error(result.error.message);
    }

    const chunk = (result.data ?? []) as DueBooking[];
    bookings.push(...chunk);
    if (chunk.length < pageSize) break;
  }

  return bookings;
}

/**
 * Unlocks PCs whose paid start time has arrived, without waiting for staff.
 *
 * Pass cafeId from a station heartbeat so one café cannot drive another
 * café's locks. Housekeeping may omit it and walk every café's due rows.
 */
export async function syncDueStationSessions(
  supabase: SupabaseClient,
  cafeId?: string | null
): Promise<{ unlocked: number; completed: number; skipped: number; failed: number }> {
  const bookings = await loadDueBookings(supabase, cafeId);
  if (bookings.length === 0) {
    return { unlocked: 0, completed: 0, skipped: 0, failed: 0 };
  }

  const sessionIds = bookings.map((booking) => booking.id);
  let liveQuery = supabase
    .from("station_status")
    .select("cafe_id, station_name, session_id, status")
    .in("session_id", sessionIds);

  if (cafeId) {
    liveQuery = liveQuery.eq("cafe_id", cafeId);
  }

  const { data: liveStations } = await liveQuery;
  const live = (liveStations ?? []) as LiveStationRow[];

  let unlocked = 0;
  let completed = 0;
  let skipped = 0;
  let failed = 0;

  for (const booking of bookings) {
    const assignedStations = (booking.booking_items || []).flatMap((item) =>
      getAssignedStations(item)
    );
    const durationMinutes = sessionDurationMinutesForBooking({
      duration: booking.duration,
      booking_items: booking.booking_items,
    });

    const decision = decideStationSession({
      sessionId: booking.id,
      status: booking.status,
      deletedAt: booking.deleted_at,
      bookingDate: booking.booking_date,
      startTime: booking.start_time,
      durationMinutes,
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
    });

    if (decision.action === "unlock") {
      if (
        allAssignedStationsUnlocked(
          assignedStations,
          live,
          booking.id,
          cafeId || booking.cafe_id
        )
      ) {
        skipped += 1;
        continue;
      }

      const result = await syncStationsForBooking(supabase, booking.id);
      if (result === "sent") unlocked += 1;
      else if (result === "failed") failed += 1;
      else skipped += 1;
      continue;
    }

    if (decision.action === "lock" && decision.reason === "ended") {
      await completeEndedBookings(supabase, [booking.id]);
      completed += 1;
      continue;
    }

    skipped += 1;
  }

  return { unlocked, completed, skipped, failed };
}
