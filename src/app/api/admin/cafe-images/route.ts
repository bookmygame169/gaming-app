import { NextRequest, NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

/**
 * The cafe_images rows behind the admin gallery.
 *
 * Uploading a photo is two writes — the file, then the row that points at it —
 * and both were going straight to Supabase from the browser. Moving only the
 * file would have left the gallery half-broken on the cafés' ISP: the picture
 * would upload and then fail to appear.
 */

/** GET /api/admin/cafe-images?cafeId=… */
export async function GET(request: NextRequest) {
  const { context, response } = await requireAdminContext(request);
  if (response) return response;

  const cafeId = request.nextUrl.searchParams.get("cafeId");
  if (!cafeId) {
    return NextResponse.json({ error: "cafeId is required" }, { status: 400 });
  }

  const { data, error } = await context.supabase
    .from("cafe_images")
    .select("id, image_url, cafe_id")
    .eq("cafe_id", cafeId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ images: data ?? [] });
}

/** POST /api/admin/cafe-images — record an uploaded image against a café. */
export async function POST(request: NextRequest) {
  const { context, response } = await requireAdminContext(request);
  if (response) return response;

  const { cafeId, imageUrl } = await request.json().catch(() => ({}));

  if (!cafeId || typeof imageUrl !== "string" || !imageUrl) {
    return NextResponse.json({ error: "cafeId and imageUrl are required" }, { status: 400 });
  }

  const { data, error } = await context.supabase
    .from("cafe_images")
    .insert({ cafe_id: cafeId, image_url: imageUrl })
    .select("id, image_url, cafe_id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ image: data });
}

/** DELETE /api/admin/cafe-images — body: { id } */
export async function DELETE(request: NextRequest) {
  const { context, response } = await requireAdminContext(request);
  if (response) return response;

  const { id } = await request.json().catch(() => ({}));
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await context.supabase.from("cafe_images").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
