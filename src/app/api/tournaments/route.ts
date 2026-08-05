// src/app/api/tournaments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { requireAdminContext } from "@/lib/adminAuth";

export const dynamic = 'force-dynamic';

// GET /api/tournaments - Get all tournaments
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    let query = supabase
      .from("tournaments")
      .select("*")
      .order("tournament_date", { ascending: true });

    if (status) {
      query = query.eq("status", status);
    }

    const { data: tournaments, error } = await query;

    if (error) {
      console.error("Error fetching tournaments:", error);
      return NextResponse.json(
        { error: "Failed to fetch tournaments" },
        { status: 500 }
      );
    }

    return NextResponse.json({ tournaments }, { status: 200 });
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/tournaments - Create a new tournament (admin only)
export async function POST(request: NextRequest) {
  try {
    const { response: authResponse } = await requireAdminContext(request);
    if (authResponse) return authResponse;

    const body = await request.json();
    const {
      name,
      game,
      icon,
      status,
      tournament_date,
      tournament_time,
      prize_amount,
      prize_currency,
      max_participants,
      location,
      cafe_id,
      description,
      rules,
      color,
      registration_fee,
      registration_deadline,
    } = body;

    if (!name || !game || !tournament_date || !tournament_time) {
      return NextResponse.json(
        { error: "Missing required fields: name, game, tournament_date, tournament_time" },
        { status: 400 }
      );
    }

    const { data: tournament, error } = await supabase
      .from("tournaments")
      .insert([
        {
          name,
          game,
          icon,
          status: status || "upcoming",
          tournament_date,
          tournament_time,
          prize_amount,
          prize_currency: prize_currency || "₹",
          max_participants,
          current_participants: 0,
          location,
          cafe_id,
          description,
          rules,
          color,
          registration_fee: registration_fee || 0,
          registration_deadline,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Error creating tournament:", error);
      return NextResponse.json(
        { error: "Failed to create tournament" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { tournament, message: "Tournament created successfully" },
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
