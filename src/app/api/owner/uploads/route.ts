import { NextRequest, NextResponse } from "next/server";
import { requireOwnerCafeAccess, requireOwnerContext } from "@/lib/ownerAuth";

export const dynamic = "force-dynamic";

/**
 * Image uploads, proxied through this origin.
 *
 * The database writes for photos already went through /api/owner/*, but the
 * file itself was pushed straight at Supabase Storage from the browser — the
 * one write on the owner side that still talked to Supabase directly. On the
 * cafés' ISP that call is blocked, so uploading a cover or gallery photo failed
 * there while every other action worked, which is the most confusing kind of
 * broken.
 *
 * The bucket is public for reading, which is what makes a café's photos load on
 * the public site. Writing to it is not something a browser should be trusted
 * with regardless of the ISP: this route is where the file is checked and where
 * the storage path is decided.
 */

const BUCKET = "cafe_images";

/**
 * Vercel rejects a request body over about 4.5MB before this handler ever runs,
 * so the limit is set below that. A café photographing a room on a phone will
 * hit it, hence a message that says what to do rather than a generic failure.
 */
const MAX_BYTES = 4 * 1024 * 1024;

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

/**
 * Every path is built here from the café id and a timestamp, never from the
 * uploaded filename. A name is attacker-controlled text: "../other-cafe/x.png"
 * would otherwise write into another café's folder.
 */
function buildPath(cafeId: string, purpose: string, extension: string): string {
  const prefix = purpose === "gallery" ? "gallery" : "profile";
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${cafeId}/${prefix}-${unique}.${extension}`;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;

    const { ownerId, supabase } = auth.context;

    const form = await request.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: "Expected a file upload." }, { status: 400 });
    }

    const cafeId = String(form.get("cafeId") || "");
    const purpose = String(form.get("purpose") || "profile");
    const file = form.get("file");

    if (!cafeId) {
      return NextResponse.json({ error: "cafeId is required" }, { status: 400 });
    }

    const accessError = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
    if (accessError) return accessError;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file was attached." }, { status: 400 });
    }

    const extension = ALLOWED_TYPES[file.type];
    if (!extension) {
      return NextResponse.json(
        { error: "That file is not an image. Use a JPG, PNG or WebP." },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        {
          error: `That image is ${(file.size / 1024 / 1024).toFixed(1)}MB. Please use one under ${
            MAX_BYTES / 1024 / 1024
          }MB.`,
        },
        { status: 413 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "That file is empty." }, { status: 400 });
    }

    const path = buildPath(cafeId, purpose, extension);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      console.error("Image upload failed:", uploadError.message);
      return NextResponse.json({ error: "Could not upload that image." }, { status: 500 });
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET).getPublicUrl(path);

    return NextResponse.json({ success: true, url: publicUrl, path });
  } catch (err) {
    console.error("Unexpected error uploading image:", err);
    return NextResponse.json({ error: "Could not upload that image." }, { status: 500 });
  }
}

/**
 * DELETE /api/owner/uploads — remove a stored image.
 *
 * body: { cafeId, path } — path as returned by POST, or a full public URL.
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;

    const { ownerId, supabase } = auth.context;
    const { cafeId, path, url } = await request.json().catch(() => ({}));

    if (!cafeId) {
      return NextResponse.json({ error: "cafeId is required" }, { status: 400 });
    }

    const accessError = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
    if (accessError) return accessError;

    // Accepts either form, because callers hold the public URL rather than the
    // storage path once a photo has been saved.
    let storagePath = typeof path === "string" && path ? path : "";
    if (!storagePath && typeof url === "string" && url) {
      const marker = `/${BUCKET}/`;
      const index = url.indexOf(marker);
      if (index !== -1) storagePath = decodeURIComponent(url.slice(index + marker.length));
    }

    if (!storagePath) {
      return NextResponse.json({ error: "Nothing to delete." }, { status: 400 });
    }

    // The café's own folder and no further. Without this an owner could pass
    // "other-cafe/cover.png" and delete a competitor's photo.
    //
    // Photos uploaded before this route existed sit outside that folder — the
    // live cover is at "covers/…" — so replacing one leaves the old file behind
    // rather than deleting it. That is the deliberate trade: loosening the
    // check to reach those would reopen exactly the hole it closes, and an
    // orphaned file costs a few kilobytes.
    if (!storagePath.startsWith(`${cafeId}/`) || storagePath.includes("..")) {
      return NextResponse.json(
        {
          error:
            "That image is stored outside this café's folder, so it was left in place.",
          skipped: true,
        },
        { status: 200 }
      );
    }

    const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);

    if (error) {
      console.error("Image delete failed:", error.message);
      return NextResponse.json({ error: "Could not delete that image." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Unexpected error deleting image:", err);
    return NextResponse.json({ error: "Could not delete that image." }, { status: 500 });
  }
}
