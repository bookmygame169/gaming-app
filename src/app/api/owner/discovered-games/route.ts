import { NextRequest, NextResponse } from "next/server";
import { requireOwnerCafeAccess, requireOwnerContext } from "@/lib/ownerAuth";

export const dynamic = "force-dynamic";

/**
 * GET /api/owner/discovered-games?cafeId=
 *
 * What the café's PCs have found installed and nobody has judged yet.
 *
 * Grouped by game rather than listed per machine: four PCs with the same Steam
 * library would otherwise be four identical rows and one decision made four
 * times. The stations are carried along so the owner can see a game is only on
 * one machine, which is usually a reason to think twice.
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

  const { data, error } = await supabase
    .from("station_discovered_games")
    .select("id, station_name, name, exe_path, arguments, process_name, source, last_seen_at")
    .eq("cafe_id", cafeId)
    .is("decided_at", null)
    .order("last_seen_at", { ascending: false })
    .limit(400);

  if (error) {
    // The table ships in a migration run by hand, so code can be live before
    // it exists. A quiet panel beats a broken tab.
    if (error.message.includes("station_discovered_games")) {
      return NextResponse.json({ games: [], migrationMissing: true });
    }

    console.error("Could not load discovered games:", error.message);
    return NextResponse.json({ error: "Could not load those." }, { status: 500 });
  }

  // Already on the menu? Then it is not a suggestion, whatever the scanner
  // thinks - the owner has answered this one by adding it.
  const { data: existing } = await supabase
    .from("cafe_pc_games")
    .select("name, exe_path")
    .eq("cafe_id", cafeId);

  const alreadyAdded = new Set(
    (existing || []).map((row) => String(row.exe_path || "").trim().toLowerCase())
  );

  // The same game can sit on the menu under a different path - Counter-Strike
  // added as steam.exe, then found again as cs2.exe. Neither path is wrong, so
  // this does not hide the row; it warns, because adding it would put a second
  // Counter-Strike tile on the lock screen and only the owner knows which path
  // they meant to keep.
  const namesOnMenu = new Set(
    (existing || []).map((row) => String(row.name || "").trim().toLowerCase())
  );

  type Grouped = {
    ids: string[];
    name: string;
    exePath: string;
    arguments: string | null;
    processName: string | null;
    source: string;
    stations: string[];
    lastSeenAt: string;
    sameNameOnMenu: boolean;
  };

  const byPath = new Map<string, Grouped>();

  for (const row of data || []) {
    const key = String(row.exe_path || "").trim().toLowerCase();
    if (!key || alreadyAdded.has(key)) continue;

    const found = byPath.get(key);

    if (found) {
      found.ids.push(row.id as string);
      if (!found.stations.includes(row.station_name as string)) {
        found.stations.push(row.station_name as string);
      }
      continue;
    }

    byPath.set(key, {
      ids: [row.id as string],
      name: row.name as string,
      exePath: row.exe_path as string,
      arguments: (row.arguments as string) ?? null,
      processName: (row.process_name as string) ?? null,
      source: row.source as string,
      stations: [row.station_name as string],
      lastSeenAt: row.last_seen_at as string,
      sameNameOnMenu: namesOnMenu.has(String(row.name || "").trim().toLowerCase()),
    });
  }

  return NextResponse.json({ games: [...byPath.values()] });
}

/**
 * POST /api/owner/discovered-games
 *
 * The owner answering one. Body: { cafeId, ids[], action, name?, processName? }
 *
 * "add" copies it into cafe_pc_games, which is the list every PC actually
 * builds its menu from; "ignore" only marks it answered. Either way the row
 * stops coming back, which is the point of recording a decision rather than
 * simply deleting what was refused.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;

    const { ownerId, supabase } = auth.context;
    const body = await request.json().catch(() => ({}));

    const cafeId = String(body?.cafeId || "");
    const ids = Array.isArray(body?.ids) ? body.ids.map(String).slice(0, 50) : [];
    const action = body?.action === "add" ? "add" : "ignore";

    if (!cafeId || ids.length === 0) {
      return NextResponse.json({ error: "cafeId and ids are required" }, { status: 400 });
    }

    const accessError = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
    if (accessError) return accessError;

    // Read back rather than trusting the body for anything that ends up on a
    // menu: the path a PC reported is the one that gets launched.
    const { data: rows, error: loadError } = await supabase
      .from("station_discovered_games")
      .select("id, name, exe_path, arguments, process_name")
      .eq("cafe_id", cafeId)
      .in("id", ids);

    if (loadError || !rows || rows.length === 0) {
      return NextResponse.json({ error: "Those are no longer listed." }, { status: 404 });
    }

    if (action === "add") {
      const first = rows[0];

      // The owner may have corrected the name and process while looking at it;
      // the path is never theirs to edit here.
      const name = typeof body?.name === "string" && body.name.trim()
        ? body.name.trim().slice(0, 120)
        : String(first.name);

      const processName = typeof body?.processName === "string" && body.processName.trim()
        ? body.processName.trim().slice(0, 120)
        : (first.process_name as string | null);

      const { data: last } = await supabase
        .from("cafe_pc_games")
        .select("sort_order")
        .eq("cafe_id", cafeId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { error: insertError } = await supabase.from("cafe_pc_games").insert({
        cafe_id: cafeId,
        name,
        exe_path: first.exe_path,
        arguments: first.arguments,
        process_name: processName,
        sort_order: (Number(last?.sort_order) || 0) + 1,
      });

      if (insertError) {
        console.error("Could not add a discovered game:", insertError.message);
        return NextResponse.json({ error: "Could not add that game." }, { status: 500 });
      }
    }

    const { error: markError } = await supabase
      .from("station_discovered_games")
      .update({ decided_at: new Date().toISOString(), decision: action === "add" ? "added" : "ignored" })
      .eq("cafe_id", cafeId)
      .in("id", ids);

    if (markError) {
      console.error("Could not record the decision:", markError.message);
    }

    return NextResponse.json({ success: true, action });
  } catch (err) {
    console.error("Unexpected error answering a discovered game:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
