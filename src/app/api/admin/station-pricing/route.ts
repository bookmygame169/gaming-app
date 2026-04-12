import { NextRequest, NextResponse } from "next/server";
import { requireAdminContext, getSupabaseAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

// GET /api/admin/station-pricing?cafeId=...
export async function GET(request: NextRequest) {
  const { context, response } = await requireAdminContext(request);
  if (response || !context) return response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cafeId = request.nextUrl.searchParams.get("cafeId");
  if (!cafeId) return NextResponse.json({ error: "cafeId required" }, { status: 400 });

  const supabase = context.supabase;
  const { data, error } = await supabase
    .from("station_pricing")
    .select("*")
    .eq("cafe_id", cafeId)
    .order("station_number", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pricing: data || [] });
}

// POST /api/admin/station-pricing — upsert pricing for all stations of a type
// Body: { cafeId, stationType, count, half_hour_rate, hourly_rate,
//         single_player_half_hour_rate?, single_player_rate?,
//         multi_player_half_hour_rate?, multi_player_rate?,
//         controller_1_half_hour?, controller_1_full_hour?,
//         controller_2_half_hour?, controller_2_full_hour? ... }
export async function POST(request: NextRequest) {
  const { context, response } = await requireAdminContext(request);
  if (response || !context) return response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { cafeId, stationType, count, ...rates } = body;

  if (!cafeId || !stationType || count == null) {
    return NextResponse.json({ error: "cafeId, stationType, count required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Map display type to station name prefix (matches owner dashboard convention)
  const prefixMap: Record<string, string> = {
    PS5: "ps5", PS4: "ps4", Xbox: "xbox", PC: "pc", VR: "vr",
    Pool: "pool", Snooker: "snooker", Arcade: "arcade",
    "Steering Wheel": "steering", "Racing Sim": "racing_sim",
  };
  const prefix = prefixMap[stationType] || stationType.toLowerCase().replace(/\s+/g, "_");

  const rows = [];
  for (let i = 1; i <= count; i++) {
    const stationName = `${prefix}-${String(i).padStart(2, "0")}`;
    rows.push({
      cafe_id: cafeId,
      station_name: stationName,
      station_type: stationType,
      station_number: i,
      is_active: true,
      ...rates,
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ success: true, updated: 0 });
  }

  const { error } = await supabase
    .from("station_pricing")
    .upsert(rows, { onConflict: "cafe_id,station_name" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, updated: rows.length });
}
