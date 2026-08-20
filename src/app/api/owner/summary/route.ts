import { NextRequest, NextResponse } from "next/server";
import { requireOwnerCafeAccess, requireOwnerContext } from "@/lib/ownerAuth";
import { pointsToRupees, getLoyaltySettings } from "@/lib/loyalty";
import { summarise } from "@/lib/reviews";
import { getIndiaDateString } from "@/lib/bookingFilters";

export const dynamic = "force-dynamic";

/**
 * GET /api/owner/summary?cafeId=...
 *
 * The one-line state of every feature that has its own tab, so the dashboard
 * can tell an owner what needs doing without them opening five tabs to find
 * out. Loyalty, reviews, payments and tournaments were each built as an island;
 * an owner who never clicks Reviews never learns a customer is waiting on a
 * reply.
 *
 * Every section fails soft and returns zeros. A café that has not run a
 * migration yet, or has a feature switched off, should see a quiet dashboard —
 * not a broken one.
 */

type Section<T> = T & { available: boolean };

function unavailable<T>(zeroes: T): Section<T> {
  return { ...zeroes, available: false };
}

export async function GET(request: NextRequest) {
  const auth = await requireOwnerContext(request);
  if (auth.response) return auth.response;

  const { ownerId, supabase } = auth.context;
  const cafeId = request.nextUrl.searchParams.get("cafeId");

  if (!cafeId) {
    return NextResponse.json({ error: "cafeId is required" }, { status: 400 });
  }

  const accessError = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
  if (accessError) return accessError;

  // Run together: this is on the dashboard's critical path, and one slow
  // section should not delay the rest.
  const [loyalty, reviews, payments, tournaments, playRequests] = await Promise.all([
    loadLoyalty(),
    loadReviews(),
    loadPayments(),
    loadTournaments(),
    loadPlayRequests(),
  ]);

  return NextResponse.json({ loyalty, reviews, payments, tournaments, playRequests });

  // ------------------------------------------------------- lock-screen requests

  /**
   * Customers sitting at a locked PC waiting to be let on.
   *
   * The most time-critical thing on this summary by some distance. Every other
   * section counts something an owner can get to this afternoon; this one
   * counts people who are in the room, at a machine, doing nothing.
   */
  async function loadPlayRequests() {
    const zero = { waiting: 0, waitingAmount: 0, oldestWaitingAt: null as string | null };

    try {
      const { data, error } = await supabase
        .from("station_play_requests")
        .select("amount, created_at")
        .eq("cafe_id", cafeId)
        .eq("status", "pending")
        .order("created_at", { ascending: true });

      // The table arrives in a migration run by hand, so code can be live
      // before it exists. A quiet section beats a broken dashboard.
      if (error) return unavailable(zero);

      const rows = data ?? [];

      return {
        available: true,
        waiting: rows.length,
        waitingAmount: rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
        oldestWaitingAt: (rows[0]?.created_at as string | undefined) ?? null,
      };
    } catch {
      return unavailable(zero);
    }
  }

  // ------------------------------------------------------------------ loyalty

  async function loadLoyalty() {
    const zero = { enabled: false, outstandingPoints: 0, outstandingRupees: 0, members: 0 };

    try {
      const settings = await getLoyaltySettings(supabase, cafeId!);

      const { data, error } = await supabase
        .from("loyalty_ledger")
        .select("customer_phone, points")
        .eq("cafe_id", cafeId);

      if (error) return unavailable(zero);

      const balances = new Map<string, number>();
      for (const row of data ?? []) {
        balances.set(
          row.customer_phone,
          (balances.get(row.customer_phone) ?? 0) + (Number(row.points) || 0)
        );
      }

      const outstandingPoints = [...balances.values()].reduce(
        (sum, balance) => sum + Math.max(0, balance),
        0
      );

      return {
        available: true,
        enabled: settings.enabled,
        outstandingPoints,
        // What the café owes in free play if everyone redeemed today. The
        // number an owner actually needs to see.
        outstandingRupees: pointsToRupees(outstandingPoints, settings),
        members: [...balances.values()].filter((balance) => balance > 0).length,
      };
    } catch {
      return unavailable(zero);
    }
  }

  // ------------------------------------------------------------------ reviews

  async function loadReviews() {
    const zero = { average: 0, count: 0, needsReply: 0, latestUnanswered: null as string | null };

    try {
      const { data, error } = await supabase
        .from("cafe_reviews")
        .select("rating, owner_reply, is_hidden, comment, created_at")
        .eq("cafe_id", cafeId)
        .order("created_at", { ascending: false });

      if (error) return unavailable(zero);

      const rows = data ?? [];
      const visible = rows.filter((row) => !row.is_hidden);
      const unanswered = visible.filter((row) => !row.owner_reply);
      const summary = summarise(visible.map((row) => Number(row.rating)));

      return {
        available: true,
        average: summary.average,
        count: summary.count,
        needsReply: unanswered.length,
        // A snippet so the dashboard can show what is waiting rather than only
        // that something is.
        latestUnanswered: unanswered[0]?.comment?.slice(0, 90) ?? null,
      };
    } catch {
      return unavailable(zero);
    }
  }

  // ----------------------------------------------------------------- payments

  async function loadPayments() {
    const zero = { waiting: 0, waitingAmount: 0, upiConfigured: false };

    try {
      const { data: cafe } = await supabase
        .from("cafes")
        .select("upi_id")
        .eq("id", cafeId)
        .maybeSingle();

      const upiConfigured = Boolean((cafe as { upi_id?: string | null } | null)?.upi_id);

      const { data, error } = await supabase
        .from("booking_payment_claims")
        .select("amount")
        .eq("cafe_id", cafeId)
        .eq("status", "claimed");

      if (error) return { ...zero, upiConfigured, available: false };

      const rows = data ?? [];

      return {
        available: true,
        upiConfigured,
        waiting: rows.length,
        waitingAmount: rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
      };
    } catch {
      return unavailable(zero);
    }
  }

  // -------------------------------------------------------------- tournaments

  async function loadTournaments() {
    const zero = { upcoming: 0, nextName: null as string | null, nextDate: null as string | null };

    try {
      const { data, error } = await supabase
        .from("tournaments")
        .select("name, tournament_date, status")
        .eq("cafe_id", cafeId)
        .in("status", ["upcoming", "ongoing"])
        .gte("tournament_date", getIndiaDateString())
        .order("tournament_date", { ascending: true })
        .limit(10);

      if (error) return unavailable(zero);

      const rows = data ?? [];

      return {
        available: true,
        upcoming: rows.length,
        nextName: rows[0]?.name ?? null,
        nextDate: rows[0]?.tournament_date ?? null,
      };
    } catch {
      return unavailable(zero);
    }
  }
}
