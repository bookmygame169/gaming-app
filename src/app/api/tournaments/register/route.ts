// src/app/api/tournaments/register/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser } from "@/lib/userAuth";


export const dynamic = 'force-dynamic';

// POST /api/tournaments/register - Register for a tournament
export async function POST(request: NextRequest) {
  // Service role, not the browser client: this route calls a function
  // that runs as its owner and is deliberately not callable by anon.
  const supabase = getSupabaseAdmin();

  try {
    const { userId, response: authResponse } = await requireUser(request);
    if (authResponse) return authResponse;

    const body = await request.json();
    const {
      tournament_id,
      player_name,
      player_email,
      player_phone,
      team_name,
    } = body;
    const user_id = userId;

    if (!tournament_id || !player_name || !player_email) {
      return NextResponse.json(
        { error: "Missing required fields: tournament_id, player_name, player_email" },
        { status: 400 }
      );
    }

    // Check if tournament exists and is open for registration
    const { data: tournament, error: tournamentError } = await supabase
      .from("tournaments")
      .select("*")
      .eq("id", tournament_id)
      .single();

    if (tournamentError || !tournament) {
      return NextResponse.json(
        { error: "Tournament not found" },
        { status: 404 }
      );
    }

    if (tournament.status !== "upcoming" && tournament.status !== "ongoing") {
      return NextResponse.json(
        { error: "Tournament is not open for registration" },
        { status: 400 }
      );
    }

    // Check if registration deadline has passed
    if (tournament.registration_deadline) {
      const deadline = new Date(tournament.registration_deadline);
      if (deadline < new Date()) {
        return NextResponse.json(
          { error: "Registration deadline has passed" },
          { status: 400 }
        );
      }
    }

    // Fast-fail pre-check on the count we already fetched (may be stale
    // under concurrent registrations — the atomic RPC below is authoritative).
    if (
      tournament.max_participants &&
      tournament.current_participants >= tournament.max_participants
    ) {
      return NextResponse.json(
        { error: "Tournament is full" },
        { status: 400 }
      );
    }

    // Check if user is already registered
    const { data: existing, error: existingError } = await supabase
      .from("tournament_registrations")
      .select("*")
      .eq("tournament_id", tournament_id)
      .eq("user_id", user_id)
      .single();

    // PGRST116 is .single() reporting no rows, which is the normal "not
    // registered yet" answer. Anything else means the check itself failed, and
    // carrying on would register somebody who may already be registered.
    if (existingError && existingError.code !== "PGRST116") {
      return NextResponse.json(
        { error: "Could not check your existing registration. Please try again." },
        { status: 500 }
      );
    }

    if (existing) {
      return NextResponse.json(
        { error: "Already registered for this tournament" },
        { status: 400 }
      );
    }

    // Atomically claim a slot: increments current_participants only if still
    // under max_participants, so two concurrent registrations can't both read
    // the same stale count and both succeed past capacity.
    if (tournament.max_participants) {
      const { data: newCount, error: capacityError } = await supabase.rpc(
        "increment_tournament_participants",
        { p_tournament_id: tournament_id }
      );

      if (capacityError) {
        console.error("Error reserving tournament slot:", capacityError);
        return NextResponse.json(
          { error: "Failed to register for tournament" },
          { status: 500 }
        );
      }

      if (newCount === null) {
        return NextResponse.json(
          { error: "Tournament is full" },
          { status: 400 }
        );
      }
    }

    // Determine registration status (confirmed if no fee, pending if there's a fee)
    const registration_status =
      tournament.registration_fee > 0 ? "pending" : "confirmed";
    const payment_status = tournament.registration_fee > 0 ? "pending" : "paid";

    // Create registration
    const { data: registration, error: createError } = await supabase
      .from("tournament_registrations")
      .insert([
        {
          tournament_id,
          user_id,
          player_name,
          player_email,
          player_phone,
          team_name,
          registration_status,
          payment_status,
          payment_amount: tournament.registration_fee || 0,
          confirmed_at:
            registration_status === "confirmed" ? new Date().toISOString() : null,
        },
      ])
      .select()
      .single();

    if (createError) {
      // Registration row failed after we already claimed a slot — release it
      // so the count doesn't drift upward for a registration that never happened.
      if (tournament.max_participants) {
        const { error: undoError } = await supabase.rpc("increment_tournament_participants_undo", {
          p_tournament_id: tournament_id,
        });
        if (undoError) {
          console.error("Failed to release tournament slot after insert failure:", undoError);
        }
      }
      console.error("Error creating registration:", createError);
      return NextResponse.json(
        { error: "Failed to register for tournament" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        registration,
        message: "Successfully registered for tournament",
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/tournaments/register?user_id=xxx - Get user's tournament registrations
export async function GET(request: NextRequest) {
  // Service role, not the browser client: this route calls a function
  // that runs as its owner and is deliberately not callable by anon.
  const supabase = getSupabaseAdmin();

  try {
    const { userId, response: authResponse } = await requireUser(request);
    if (authResponse) return authResponse;

    const user_id = userId;

    const { data: registrations, error } = await supabase
      .from("tournament_registrations")
      .select(`
        *,
        tournament:tournaments(*)
      `)
      .eq("user_id", user_id)
      .order("registered_at", { ascending: false });

    if (error) {
      console.error("Error fetching registrations:", error);
      return NextResponse.json(
        { error: "Failed to fetch registrations" },
        { status: 500 }
      );
    }

    return NextResponse.json({ registrations }, { status: 200 });
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
