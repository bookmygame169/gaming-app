import { NextRequest, NextResponse } from "next/server";
import {
  getOwnedCafeIdForRecord,
  requireOwnerCafeAccess,
  requireOwnerContext,
} from "@/lib/ownerAuth";

export const dynamic = "force-dynamic";

/**
 * Tournaments a café owner runs at their own venue.
 *
 * Separate from /api/tournaments, which is the public read plus a
 * platform-admin create. An owner needs to run events at their own café without
 * being a platform admin, and must not be able to touch another café's.
 */

const STATUSES = ["upcoming", "ongoing", "completed", "cancelled"] as const;

/** Fields an owner may set. Anything else in the body is dropped rather than passed to the database. */
const EDITABLE_FIELDS = [
  "name",
  "game",
  "description",
  "rules",
  "icon",
  "color",
  "status",
  "tournament_date",
  "tournament_time",
  "location",
  "prize_amount",
  "prize_currency",
  "registration_fee",
  "registration_deadline",
  "max_participants",
] as const;

function pickEditable(body: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) {
      result[field] = body[field];
    }
  }
  return result;
}

function validate(fields: Record<string, unknown>): string | null {
  if (fields.status !== undefined && !STATUSES.includes(String(fields.status) as typeof STATUSES[number])) {
    return `status must be one of: ${STATUSES.join(", ")}`;
  }

  for (const numeric of ["prize_amount", "registration_fee", "max_participants"]) {
    if (fields[numeric] === undefined || fields[numeric] === null) continue;

    const value = Number(fields[numeric]);
    if (!Number.isFinite(value) || value < 0) {
      return `${numeric} must be zero or more`;
    }
  }

  return null;
}

/** GET /api/owner/tournaments?cafeId=... — tournaments at this café. */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;

    const { ownerId, supabase } = auth.context;
    const cafeId = new URL(request.url).searchParams.get("cafeId") || "";

    if (!cafeId) {
      return NextResponse.json({ error: "cafeId is required" }, { status: 400 });
    }

    const accessResponse = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
    if (accessResponse) return accessResponse;

    const { data, error } = await supabase
      .from("tournaments")
      .select("*")
      .eq("cafe_id", cafeId)
      .order("tournament_date", { ascending: false });

    if (error) {
      console.error("Could not read tournaments:", error.message);
      return NextResponse.json(
        {
          error:
            "Could not load tournaments. If this is the first time, the tournaments " +
            "table may not exist yet — run migration 20260807000000_create_tournaments.sql.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ tournaments: data ?? [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load tournaments";
    console.error("Owner tournaments GET error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/owner/tournaments — create one at a café this owner owns. */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;

    const { ownerId, supabase } = auth.context;
    const body = await request.json();
    const cafeId = String(body?.cafeId || "");

    if (!cafeId) {
      return NextResponse.json({ error: "cafeId is required" }, { status: 400 });
    }

    const accessResponse = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
    if (accessResponse) return accessResponse;

    const fields = pickEditable(body);

    if (!fields.name || !fields.game || !fields.tournament_date || !fields.tournament_time) {
      return NextResponse.json(
        { error: "Name, game, date and time are required" },
        { status: 400 }
      );
    }

    const invalid = validate(fields);
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("tournaments")
      .insert({
        ...fields,
        cafe_id: cafeId,
        // Never taken from the request: it is maintained by the registration
        // RPC, and a caller setting it could open or close entry at will.
        current_participants: 0,
      })
      .select()
      .single();

    if (error) {
      console.error("Could not create tournament:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ tournament: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create tournament";
    console.error("Owner tournaments POST error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PUT /api/owner/tournaments — update one this owner's café runs. */
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;

    const { ownerId, supabase } = auth.context;
    const body = await request.json();
    const tournamentId = String(body?.tournamentId || "");

    if (!tournamentId) {
      return NextResponse.json({ error: "tournamentId is required" }, { status: 400 });
    }

    // Confirms the tournament belongs to a café this owner owns, rather than
    // trusting a cafeId sent alongside the id.
    const ownedCafeId = await getOwnedCafeIdForRecord(supabase, "tournaments", tournamentId, ownerId);
    if (!ownedCafeId) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    const fields = pickEditable(body);
    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const invalid = validate(fields);
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("tournaments")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", tournamentId)
      .select()
      .single();

    if (error) {
      console.error("Could not update tournament:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ tournament: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update tournament";
    console.error("Owner tournaments PUT error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/owner/tournaments?tournamentId=... */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;

    const { ownerId, supabase } = auth.context;
    const tournamentId = new URL(request.url).searchParams.get("tournamentId") || "";

    if (!tournamentId) {
      return NextResponse.json({ error: "tournamentId is required" }, { status: 400 });
    }

    const ownedCafeId = await getOwnedCafeIdForRecord(supabase, "tournaments", tournamentId, ownerId);
    if (!ownedCafeId) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    // Players who signed up would lose their entry with no notice, so a
    // tournament with registrations is cancelled rather than removed.
    const { count, error: countError } = await supabase
      .from("tournament_registrations")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", tournamentId);

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    if ((count ?? 0) > 0) {
      const { error: cancelError } = await supabase
        .from("tournaments")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", tournamentId);

      if (cancelError) {
        return NextResponse.json({ error: cancelError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, cancelled: true, registrations: count });
    }

    const { error } = await supabase.from("tournaments").delete().eq("id", tournamentId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, cancelled: false });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete tournament";
    console.error("Owner tournaments DELETE error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
