import { NextRequest, NextResponse } from "next/server";
import {
  requireOwnerCafeAccess,
  requireOwnerContext,
} from "@/lib/ownerAuth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;

    const { ownerId, supabase } = auth.context;
    const { searchParams } = new URL(request.url);
    const cafeId = searchParams.get("cafeId");

    if (!cafeId) {
      return NextResponse.json({ error: "cafeId is required" }, { status: 400 });
    }

    const accessResponse = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
    if (accessResponse) return accessResponse;

    const { data, error } = await supabase
      .from("console_pricing")
      .select("*")
      .eq("cafe_id", cafeId)
      .order("console_type", { ascending: true })
      .order("quantity", { ascending: true })
      .order("duration_minutes", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ pricing: data || [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch console pricing";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;

    const { ownerId, supabase } = auth.context;
    const { cafeId, consoleType, quantity, duration, price } = await request.json();

    if (!cafeId || !consoleType || !quantity || !duration || price === undefined) {
      return NextResponse.json(
        { error: "cafeId, consoleType, quantity, duration, and price are required" },
        { status: 400 }
      );
    }

    const accessResponse = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
    if (accessResponse) return accessResponse;

    const { data: existing, error: existingError } = await supabase
      .from("console_pricing")
      .select("id")
      .eq("cafe_id", cafeId)
      .eq("console_type", consoleType)
      .eq("quantity", quantity)
      .eq("duration_minutes", duration)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    const payload = {
      cafe_id: cafeId,
      console_type: consoleType,
      quantity,
      duration_minutes: duration,
      price,
    };

    const query = existing?.id
      ? supabase.from("console_pricing").update({ price }).eq("id", existing.id)
      : supabase.from("console_pricing").insert(payload);

    const { error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to save console pricing";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
