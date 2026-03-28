import { NextRequest, NextResponse } from "next/server";
import {
  requireOwnerCafeAccess,
  requireOwnerContext,
} from "@/lib/ownerAuth";

export const dynamic = 'force-dynamic';

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

    // Ownership already verified above — use only cafeId so the update
    // isn't silently skipped by an owner_id type/value mismatch
    const { data: updated, error } = await supabase
      .from("cafes")
      .update(updates)
      .eq("id", cafeId)
      .select("id");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: "Cafe not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to update cafe" }, { status: 500 });
  }
}
