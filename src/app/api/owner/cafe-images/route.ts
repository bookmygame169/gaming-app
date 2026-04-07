import { NextRequest, NextResponse } from "next/server";
import {
  getOwnedCafeIdForRecord,
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
      .from("cafe_images")
      .select("id, image_url, cafe_id")
      .eq("cafe_id", cafeId)
      .order("id", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ images: data || [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch cafe images";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;

    const { ownerId, supabase } = auth.context;
    const { cafeId, imageUrl } = await request.json();

    if (!cafeId || !imageUrl) {
      return NextResponse.json({ error: "cafeId and imageUrl are required" }, { status: 400 });
    }

    const accessResponse = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
    if (accessResponse) return accessResponse;

    const { data, error } = await supabase
      .from("cafe_images")
      .insert({ cafe_id: cafeId, image_url: imageUrl })
      .select("id, image_url, cafe_id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ image: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to add cafe image";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;

    const { ownerId, supabase } = auth.context;
    const { imageId } = await request.json();

    if (!imageId) {
      return NextResponse.json({ error: "imageId is required" }, { status: 400 });
    }

    const ownedCafeId = await getOwnedCafeIdForRecord(
      supabase,
      "cafe_images",
      imageId,
      ownerId
    );

    if (!ownedCafeId) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    const { error } = await supabase
      .from("cafe_images")
      .delete()
      .eq("id", imageId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete cafe image";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
