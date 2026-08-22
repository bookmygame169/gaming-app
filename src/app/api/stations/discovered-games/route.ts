import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  readStationIdentity,
  requireKnownStation,
  requireStationToken,
} from "@/lib/stationAgentAuth";

export const dynamic = "force-dynamic";

/** More than any café has, and small enough that one bad scan cannot flood the table. */
const MAX_PER_REPORT = 200;

type Reported = {
  name?: unknown;
  exePath?: unknown;
  arguments?: unknown;
  processName?: unknown;
  source?: unknown;
};

const SOURCES = new Set(["steam", "xbox", "epic", "registry", "store", "desktop", "other"]);

function clean(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 || trimmed.length > max ? null : trimmed;
}

/**
 * POST /api/stations/discovered-games
 *
 * A station saying what it can see installed on itself.
 *
 * These are suggestions and nothing more. Nothing here reaches a lock screen:
 * the menu is still built from cafe_pc_games, and a row only gets there when an
 * owner has looked at it and said yes.
 *
 * That separation is the whole design. The agent's scanners were switched off
 * because their output went straight to the customer's screen and brought File
 * Explorer, the NVIDIA panel and adware with it. The scanning was never the
 * problem - publishing it unread was. Reporting to a queue lets a machine find
 * a game like Forza, installed through Xbox with no shortcut anywhere, without
 * anybody having to type a path by hand.
 */
export async function POST(request: NextRequest) {
  try {
    const unauthorized = requireStationToken(request);
    if (unauthorized) return unauthorized;

    const body = await request.json().catch(() => ({}));
    const identity = readStationIdentity(body);
    if (!identity) {
      return NextResponse.json({ error: "cafeId and stationName are required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const unknown = await requireKnownStation(supabase, identity);
    if (unknown) return unknown;

    const reported = Array.isArray(body?.games) ? (body.games as Reported[]) : [];

    const rows = reported
      .slice(0, MAX_PER_REPORT)
      .map((game) => {
        const name = clean(game.name, 120);
        const exePath = clean(game.exePath, 500);
        if (!name || !exePath) return null;

        const source = clean(game.source, 20)?.toLowerCase() ?? "other";

        return {
          cafe_id: identity.cafeId,
          station_name: identity.stationName,
          name,
          exe_path: exePath,
          // Empty rather than null: it is half the key that tells two Game
          // Pass titles apart, and a null would make every one of them look
          // like a different row on every scan.
          arguments: clean(game.arguments, 300) ?? "",
          process_name: clean(game.processName, 120),
          source: SOURCES.has(source) ? source : "other",
          last_seen_at: new Date().toISOString(),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (rows.length === 0) {
      return NextResponse.json({ accepted: 0 });
    }

    // Upsert on the station's own launch, so a scan that runs every few hours
    // refreshes last_seen_at rather than piling up copies - and so a row the
    // owner already ignored keeps its decision instead of returning to the
    // queue every time.
    //
    // The arguments are part of that key because Store and Game Pass titles all
    // launch through explorer.exe and are told apart only by the shell:AppsFolder
    // id they carry. Without it, one PC reporting two of them put two identical
    // keys in a single upsert, which Postgres refuses outright - so the whole
    // report failed, not just the duplicate.
    const { error } = await supabase
      .from("station_discovered_games")
      .upsert(rows, {
        onConflict: "cafe_id,station_name,exe_path,arguments",
        ignoreDuplicates: false,
      });

    if (error) {
      if (error.message.includes("station_discovered_games")) {
        return NextResponse.json({
          accepted: 0,
          migrationMissing: true,
        });
      }

      console.error("Could not record discovered games:", error.message);
      return NextResponse.json({ error: "Could not record those" }, { status: 500 });
    }

    console.log(`${identity.stationName} reported ${rows.length} installed game(s).`);
    return NextResponse.json({ accepted: rows.length });
  } catch (err) {
    console.error("Unexpected error recording discovered games:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
