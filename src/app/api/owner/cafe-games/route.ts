import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_CAFE_PC_GAMES } from "@/lib/cafePcGames";
import { requireOwnerCafeAccess, requireOwnerContext } from "@/lib/ownerAuth";

export const dynamic = "force-dynamic";

type GameInput = {
  name?: string;
  exe_path?: string;
  arguments?: string | null;
  process_name?: string | null;
  icon_path?: string | null;
  working_directory?: string | null;
  sort_order?: number;
};

async function seedDefaultsIfEmpty(supabase: SupabaseClient, cafeId: string) {
  const { count, error: countError } = await supabase
    .from("cafe_pc_games")
    .select("id", { count: "exact", head: true })
    .eq("cafe_id", cafeId);

  if (countError) {
    throw new Error(countError.message);
  }

  if ((count ?? 0) > 0) {
    return;
  }

  const rows = DEFAULT_CAFE_PC_GAMES.map((game) => ({
    cafe_id: cafeId,
    name: game.name,
    exe_path: game.exe_path,
    arguments: game.arguments ?? null,
    process_name: game.process_name ?? null,
    icon_path: game.icon_path ?? null,
    working_directory: game.working_directory ?? null,
    sort_order: game.sort_order,
    active: true,
  }));

  const { error } = await supabase.from("cafe_pc_games").insert(rows);
  if (error) {
    throw new Error(error.message);
  }
}

/**
 * GET /api/owner/cafe-games?cafeId=...
 */
export async function GET(request: NextRequest) {
  const auth = await requireOwnerContext(request);
  if (auth.response) return auth.response;

  const { ownerId, supabase } = auth.context;
  const cafeId = request.nextUrl.searchParams.get("cafeId") || "";

  if (!cafeId) {
    return NextResponse.json({ error: "cafeId is required" }, { status: 400 });
  }

  const accessError = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
  if (accessError) return accessError;

  try {
    await seedDefaultsIfEmpty(supabase, cafeId);

    const { data, error } = await supabase
      .from("cafe_pc_games")
      .select(
        "id, name, exe_path, arguments, process_name, icon_path, working_directory, sort_order, active"
      )
      .eq("cafe_id", cafeId)
      .order("sort_order", { ascending: true });

    if (error) {
      return NextResponse.json(
        {
          error:
            "Could not load games. Run migration 20260815000000_create_cafe_pc_games.sql.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ games: data ?? [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load games";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/owner/cafe-games
 * Body: { cafeId, games: GameInput[] }
 */
export async function PUT(request: NextRequest) {
  const auth = await requireOwnerContext(request);
  if (auth.response) return auth.response;

  const { ownerId, supabase } = auth.context;
  const body = await request.json().catch(() => ({}));
  const cafeId = String(body?.cafeId || "");
  const games = Array.isArray(body?.games) ? (body.games as GameInput[]) : [];

  if (!cafeId) {
    return NextResponse.json({ error: "cafeId is required" }, { status: 400 });
  }

  const accessError = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
  if (accessError) return accessError;

  const cleaned = games
    .map((game, index) => ({
      cafe_id: cafeId,
      name: String(game.name || "").trim(),
      exe_path: String(game.exe_path || "").trim(),
      arguments: game.arguments ? String(game.arguments) : null,
      process_name: game.process_name ? String(game.process_name).trim() : null,
      icon_path: game.icon_path ? String(game.icon_path).trim() : null,
      working_directory: game.working_directory ? String(game.working_directory).trim() : null,
      sort_order: Number.isFinite(game.sort_order) ? Number(game.sort_order) : index + 1,
      active: true,
    }))
    .filter((game) => game.name && game.exe_path);

  if (cleaned.length === 0) {
    return NextResponse.json({ error: "Add at least one game with a name and exe path." }, { status: 400 });
  }

  const { error: deleteError } = await supabase.from("cafe_pc_games").delete().eq("cafe_id", cafeId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const { error: insertError } = await supabase.from("cafe_pc_games").insert(cleaned);
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, count: cleaned.length });
}
