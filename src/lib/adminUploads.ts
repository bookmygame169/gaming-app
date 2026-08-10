/**
 * Admin-panel image helpers.
 *
 * Same reason as the owner ones: the file used to go straight to Supabase
 * Storage from the browser, which the cafés' ISP blocks, so onboarding a café
 * failed on the network it was being onboarded from.
 */

export type UploadedImage = { url: string; path: string };

export async function uploadAdminImage(
  file: File,
  purpose: "cover" | "gallery",
  cafeId?: string
): Promise<UploadedImage> {
  const form = new FormData();
  form.append("file", file);
  form.append("purpose", purpose);
  if (cafeId) form.append("cafeId", cafeId);

  const res = await fetch("/api/admin/uploads", {
    method: "POST",
    credentials: "include",
    // No Content-Type: the browser must set the multipart boundary itself.
    body: form,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not upload that image");

  return { url: data.url as string, path: data.path as string };
}

/**
 * Removes a stored file. Never throws — tidying up should not be able to fail
 * the action that triggered it.
 */
export async function deleteAdminImage(url: string | null | undefined): Promise<void> {
  if (!url) return;

  try {
    await fetch("/api/admin/uploads", {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
  } catch {
    // An orphaned file costs a little storage; a failed save costs the work.
  }
}

/** Records an uploaded image against a café. */
export async function addAdminCafeImage(
  cafeId: string,
  imageUrl: string
): Promise<{ id: string; image_url: string }> {
  const res = await fetch("/api/admin/cafe-images", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cafeId, imageUrl }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not save that image");

  return data.image;
}

/** Removes the café-image row. The stored file is deleted separately. */
export async function removeAdminCafeImage(id: string): Promise<void> {
  const res = await fetch("/api/admin/cafe-images", {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Could not remove that image");
  }
}
