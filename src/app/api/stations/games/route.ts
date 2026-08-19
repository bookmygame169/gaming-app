import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_CAFE_PC_GAMES, mapGameRowToAgentJson } from "@/lib/cafePcGames";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type GameRow = {
  name: string;
  exe_path: string;
  arguments: string | null;
  process_name: string | null;
  icon_path: string | null;
  working_directory: string | null;
  sort_order: number;
};

/**
 * GET /api/stations/games?cafeId=...
 *
 * Called by the PC lock agent on startup. Authenticated with the same heartbeat
 * token — no owner session on the gaming PC.
 */
export async function GET(request: NextRequest) {
  try {
    const expectedToken = process.env.STATION_HEARTBEAT_TOKEN?.trim();
    if (!expectedToken) {
      return NextResponse.json({ error: "Server not configured" }, { status: 503 });
    }

    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";

    if (token !== expectedToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cafeId = request.nextUrl.searchParams.get("cafeId") || "";
    if (!cafeId) {
      return NextResponse.json({ error: "cafeId is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // The exit password travels with the games because the agent already makes
    // this call at startup and caches what comes back — so a station keeps
    // working offline, and there is no second round trip to get wrong.
    //
    // Read separately and never fatally: a café with no password set, or a
    // database without the column, must still get its games.
    let exitPasswordHash: string | null = null;
    try {
      const { data: cafe, error: cafeError } = await supabase
        .from("cafes")
        .select("station_exit_password_hash")
        .eq("id", cafeId)
        .maybeSingle();

      if (!cafeError) {
        exitPasswordHash = (cafe?.station_exit_password_hash as string | null) ?? null;
      }
    } catch {
      // Leaves the station on whatever password it already had.
    }

    const { data, error } = await supabase
      .from("cafe_pc_games")
      .select(
        "name, exe_path, arguments, process_name, icon_path, working_directory, sort_order"
      )
      .eq("cafe_id", cafeId)
      .eq("active", true)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("cafe_pc_games read failed:", error.message);
      // Table may not exist yet — still return defaults so kiosks show real games.
      return NextResponse.json({
        games: DEFAULT_CAFE_PC_GAMES.map(mapGameRowToAgentJson),
        exitPasswordHash,
      });
    }

    const rows = (data ?? []) as GameRow[];
    const games =
      rows.length > 0
        ? rows.map(mapGameRowToAgentJson)
        : DEFAULT_CAFE_PC_GAMES.map(mapGameRowToAgentJson);

    return NextResponse.json({ games, exitPasswordHash });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load games";
    console.error("Station games error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
