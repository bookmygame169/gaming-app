import { NextRequest, NextResponse } from "next/server";
import { requireOwnerCafeAccess, requireOwnerContext } from "@/lib/ownerAuth";
import {
  DEFAULT_LOYALTY_SETTINGS,
  phoneKey,
  pointsToRupees,
  getLoyaltySettings,
  type LoyaltySettings,
} from "@/lib/loyalty";

export const dynamic = "force-dynamic";

type LedgerRow = {
  id: string;
  customer_phone: string;
  points: number;
  reason: string;
  note: string | null;
  created_at: string;
};

function missingTableResponse(message: string) {
  // The owner sees this before they have run the migration, so it names the
  // file instead of showing a raw Postgres error.
  const looksMissing = message.includes("loyalty_") && message.toLowerCase().includes("does not exist");

  return NextResponse.json(
    {
      error: looksMissing
        ? "Loyalty tables are not set up yet. Run migration 20260807000001_add_loyalty_program.sql in Supabase."
        : message,
    },
    { status: 500 }
  );
}

/**
 * GET /api/owner/loyalty?cafeId=...
 *
 * Settings, the members with a balance, and recent activity for one café.
 */
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

  const settings = await getLoyaltySettings(supabase, cafeId);

  const { data, error } = await supabase
    .from("loyalty_ledger")
    .select("id, customer_phone, points, reason, note, created_at")
    .eq("cafe_id", cafeId)
    .order("created_at", { ascending: false })
    .limit(2000);

  if (error) {
    return missingTableResponse(error.message);
  }

  const rows = (data ?? []) as LedgerRow[];

  // Balances are summed here rather than in SQL: the ledger for a single café
  // is small, and this keeps the migration free of views to maintain.
  const byPhone = new Map<
    string,
    { phone: string; balance: number; earned: number; redeemed: number; lastActivity: string }
  >();

  for (const row of rows) {
    const entry = byPhone.get(row.customer_phone) ?? {
      phone: row.customer_phone,
      balance: 0,
      earned: 0,
      redeemed: 0,
      lastActivity: row.created_at,
    };

    const points = Number(row.points) || 0;
    entry.balance += points;
    if (points >= 0) entry.earned += points;
    else entry.redeemed += -points;

    // Rows arrive newest first, so the first one seen is the latest.
    if (row.created_at > entry.lastActivity) entry.lastActivity = row.created_at;

    byPhone.set(row.customer_phone, entry);
  }

  const members = [...byPhone.values()]
    .map((entry) => ({
      ...entry,
      worthRupees: pointsToRupees(entry.balance, settings),
    }))
    .sort((a, b) => b.balance - a.balance);

  // Outstanding points are a real liability — what the café owes in free play
  // if everyone redeemed today — so it is shown rather than left to be worked
  // out from the list.
  const outstandingPoints = members.reduce((sum, member) => sum + Math.max(0, member.balance), 0);

  // Names come from bookings; the ledger stores only the phone.
  const phones = members.slice(0, 100).map((member) => member.phone);
  const namesByPhone = new Map<string, string>();

  if (phones.length > 0) {
    const { data: bookingRows } = await supabase
      .from("bookings")
      .select("customer_name, customer_phone")
      .eq("cafe_id", cafeId)
      .not("customer_name", "is", null)
      .order("created_at", { ascending: false })
      .limit(2000);

    for (const booking of bookingRows ?? []) {
      const key = phoneKey(booking.customer_phone as string | null);
      if (key && !namesByPhone.has(key) && booking.customer_name) {
        namesByPhone.set(key, booking.customer_name as string);
      }
    }
  }

  return NextResponse.json({
    settings,
    outstandingPoints,
    outstandingRupees: pointsToRupees(outstandingPoints, settings),
    memberCount: members.filter((member) => member.balance > 0).length,
    members: members.slice(0, 100).map((member) => ({
      ...member,
      name: namesByPhone.get(member.phone) ?? null,
    })),
    recent: rows.slice(0, 30).map((row) => ({
      id: row.id,
      phone: row.customer_phone,
      points: row.points,
      reason: row.reason,
      note: row.note,
      createdAt: row.created_at,
    })),
  });
}

/**
 * PUT /api/owner/loyalty — save the café's scheme.
 */
export async function PUT(request: NextRequest) {
  const auth = await requireOwnerContext(request);
  if (auth.response) return auth.response;

  const { ownerId, supabase } = auth.context;
  const body = await request.json().catch(() => ({}));
  const cafeId = body.cafeId;

  if (!cafeId) {
    return NextResponse.json({ error: "cafeId is required" }, { status: 400 });
  }

  const accessError = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
  if (accessError) return accessError;

  // Clamped rather than rejected: a slip in the form should not lose the whole
  // save, and the upper bounds stop a typo like "500 points per ₹100" from
  // quietly creating a huge liability.
  const settings: LoyaltySettings = {
    enabled: Boolean(body.enabled),
    pointsPerHundred: Math.min(100, Math.max(0, Math.round(Number(body.pointsPerHundred) || 0))),
    rupeesPerPoint: Math.min(100, Math.max(0, Number(body.rupeesPerPoint) || 0)),
    minRedeemPoints: Math.min(100000, Math.max(0, Math.round(Number(body.minRedeemPoints) || 0))),
  };

  const { error } = await supabase.from("loyalty_settings").upsert(
    {
      cafe_id: cafeId,
      enabled: settings.enabled,
      points_per_hundred: settings.pointsPerHundred,
      rupees_per_point: settings.rupeesPerPoint,
      min_redeem_points: settings.minRedeemPoints,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "cafe_id" }
  );

  if (error) {
    return missingTableResponse(error.message);
  }

  return NextResponse.json({ success: true, settings });
}

/**
 * POST /api/owner/loyalty — redeem points, or adjust a balance by hand.
 *
 * body: { cafeId, phone, points, reason: 'redeemed' | 'manual' | 'bonus', note? }
 *
 * `points` is always given as a positive number; a redemption is stored
 * negative. Asking an owner to type a minus sign at the counter is how balances
 * get moved the wrong way.
 */
export async function POST(request: NextRequest) {
  const auth = await requireOwnerContext(request);
  if (auth.response) return auth.response;

  const { ownerId, supabase } = auth.context;
  const body = await request.json().catch(() => ({}));
  const { cafeId, phone, note } = body;

  if (!cafeId) {
    return NextResponse.json({ error: "cafeId is required" }, { status: 400 });
  }

  const accessError = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
  if (accessError) return accessError;

  const key = phoneKey(phone);
  if (!key) {
    return NextResponse.json({ error: "Enter a valid 10-digit phone number" }, { status: 400 });
  }

  const reason = ["redeemed", "manual", "bonus"].includes(body.reason) ? body.reason : "manual";
  const amount = Math.round(Number(body.points) || 0);

  if (amount <= 0) {
    return NextResponse.json({ error: "Enter how many points" }, { status: 400 });
  }

  const settings = await getLoyaltySettings(supabase, cafeId);

  // Read the balance before spending it. Without this an owner could hand out
  // free play against points the customer does not have.
  if (reason === "redeemed") {
    const { data: balanceRows, error: balanceError } = await supabase
      .from("loyalty_ledger")
      .select("points")
      .eq("cafe_id", cafeId)
      .eq("customer_phone", key);

    if (balanceError) {
      return missingTableResponse(balanceError.message);
    }

    const balance = (balanceRows ?? []).reduce((sum, row) => sum + (Number(row.points) || 0), 0);

    if (amount > balance) {
      return NextResponse.json(
        { error: `That customer only has ${balance} points.` },
        { status: 400 }
      );
    }

    const minRedeem = settings.minRedeemPoints || DEFAULT_LOYALTY_SETTINGS.minRedeemPoints;
    if (amount < minRedeem) {
      return NextResponse.json(
        { error: `Points can only be used ${minRedeem} at a time or more.` },
        { status: 400 }
      );
    }
  }

  const signedPoints = reason === "redeemed" ? -amount : amount;

  const { error } = await supabase.from("loyalty_ledger").insert({
    cafe_id: cafeId,
    customer_phone: key,
    points: signedPoints,
    reason,
    note: typeof note === "string" && note.trim() ? note.trim().slice(0, 200) : null,
  });

  if (error) {
    return missingTableResponse(error.message);
  }

  return NextResponse.json({
    success: true,
    points: signedPoints,
    rupeesOff: reason === "redeemed" ? pointsToRupees(amount, settings) : 0,
  });
}
