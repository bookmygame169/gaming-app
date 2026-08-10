import { NextRequest, NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

/**
 * Image uploads for the admin panel, proxied through this origin.
 *
 * The owner dashboard already stopped talking to Supabase Storage from the
 * browser; the admin panel still did, so onboarding a café or adding gallery
 * photos failed on the same blocked ISP. Admins work from the café too.
 *
 * Unlike the owner route this does not scope to one café — a platform admin
 * manages all of them, and covers are uploaded while creating a café that has
 * no id yet. The file checks and the server-chosen path are the same, because
 * those were never about which café it was.
 */

const BUCKET = "cafe_images";

/** Below Vercel's ~4.5MB request cap, so the limit is reported rather than hit. */
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
 * Built here, never from the uploaded filename, which is text the uploader
 * controls.
 *
 * Covers keep the "covers/" prefix the existing ones use, so a café's photos do
 * not end up split across two conventions for no reason.
 */
function buildPath(purpose: string, cafeId: string, extension: string): string {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (purpose === "cover") return `covers/${unique}.${extension}`;
  if (cafeId) return `gallery/${cafeId}/${unique}.${extension}`;
  return `gallery/unassigned/${unique}.${extension}`;
}

export async function POST(request: NextRequest) {
  try {
    const { context, response } = await requireAdminContext(request);
    if (response) return response;

    const supabase = context.supabase;

    const form = await request.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: "Expected a file upload." }, { status: 400 });
    }

    const file = form.get("file");
    const purpose = String(form.get("purpose") || "gallery");
    // Only used to group gallery files; a café being created has no id yet.
    const cafeId = String(form.get("cafeId") || "").replace(/[^a-zA-Z0-9-]/g, "");

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

    if (file.size === 0) {
      return NextResponse.json({ error: "That file is empty." }, { status: 400 });
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

    const path = buildPath(purpose, cafeId, extension);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, cacheControl: "3600", upsert: false });

    if (uploadError) {
      console.error("Admin image upload failed:", uploadError.message);
      return NextResponse.json({ error: "Could not upload that image." }, { status: 500 });
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET).getPublicUrl(path);

    return NextResponse.json({ success: true, url: publicUrl, path });
  } catch (err) {
    console.error("Unexpected error uploading admin image:", err);
    return NextResponse.json({ error: "Could not upload that image." }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/uploads — remove a stored image.
 *
 * body: { path } or { url }
 */
export async function DELETE(request: NextRequest) {
  try {
    const { context, response } = await requireAdminContext(request);
    if (response) return response;

    const supabase = context.supabase;
    const { path, url } = await request.json().catch(() => ({}));

    let storagePath = typeof path === "string" && path ? path : "";
    if (!storagePath && typeof url === "string" && url) {
      const marker = `/${BUCKET}/`;
      const index = url.indexOf(marker);
      if (index !== -1) storagePath = decodeURIComponent(url.slice(index + marker.length));
    }

    if (!storagePath) {
      return NextResponse.json({ error: "Nothing to delete." }, { status: 400 });
    }

    // An admin may delete anything in this bucket, so there is no folder to
    // scope to — but a traversal segment still has no legitimate use, and
    // refusing it keeps the path to exactly the bucket it names.
    if (storagePath.includes("..")) {
      return NextResponse.json({ error: "Invalid image path." }, { status: 400 });
    }

    const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);

    if (error) {
      console.error("Admin image delete failed:", error.message);
      return NextResponse.json({ error: "Could not delete that image." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Unexpected error deleting admin image:", err);
    return NextResponse.json({ error: "Could not delete that image." }, { status: 500 });
  }
}
