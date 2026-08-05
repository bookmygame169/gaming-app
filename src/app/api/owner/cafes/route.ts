import { NextRequest, NextResponse } from "next/server";
import {
  requireOwnerCafeAccess,
  requireOwnerContext,
} from "@/lib/ownerAuth";

export const dynamic = 'force-dynamic';

// Fields an owner is allowed to change about their own cafe. Anything else
// in the request body (e.g. owner_id, is_active, is_featured) is dropped
// rather than passed straight to the DB update.
const ALLOWED_CAFE_UPDATE_FIELDS = new Set([
  "name",
  "address",
  "description",
  "phone",
  "email",
  "hourly_price",
  "price_starts_from",
  "google_maps_url",
  "instagram_url",
  "cover_url",
  "ps5_count",
  "ps4_count",
  "xbox_count",
  "pc_count",
  "pool_count",
  "arcade_count",
  "snooker_count",
  "steering_wheel_count",
  "racing_sim_count",
  "vr_count",
  "opening_hours",
  "peak_hours",
  "popular_games",
  "offers",
  "monitor_details",
  "processor_details",
  "gpu_details",
  "ram_details",
  "accessories_details",
  "show_tech_specs",
]);

function pickAllowedCafeUpdates(updates: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates || {})) {
    if (ALLOWED_CAFE_UPDATE_FIELDS.has(key)) {
      result[key] = value;
    }
  }
  return result;
}

// GET /api/owner/cafes?cafeId=... — fetch cafe by id
export async function GET(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) {
      return auth.response;
    }

    const { ownerId, supabase } = auth.context;
    const { searchParams } = new URL(request.url);
    const cafeId = searchParams.get('cafeId');

    if (!cafeId) {
      return NextResponse.json({ error: "cafeId is required" }, { status: 400 });
    }

    const accessResponse = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
    if (accessResponse) {
      return accessResponse;
    }

    const { data, error } = await supabase
      .from("cafes")
      .select("*")
      .eq("id", cafeId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ cafe: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch cafe" }, { status: 500 });
  }
}

// PUT /api/owner/cafes — update cafe fields
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) {
      return auth.response;
    }

    const { ownerId, supabase } = auth.context;
    const { cafeId, updates } = await request.json();

    if (!cafeId) {
      return NextResponse.json({ error: "cafeId is required" }, { status: 400 });
    }

    const accessResponse = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
    if (accessResponse) {
      return accessResponse;
    }

    const allowedUpdates = pickAllowedCafeUpdates(updates || {});
    if (Object.keys(allowedUpdates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    // Ownership already verified above — use only cafeId so the update
    // isn't silently skipped by an owner_id type/value mismatch
    const { error } = await supabase
      .from("cafes")
      .update(allowedUpdates)
      .eq("id", cafeId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to update cafe" }, { status: 500 });
  }
}
