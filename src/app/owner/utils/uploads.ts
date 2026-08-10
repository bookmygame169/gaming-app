/**
 * Sending café photos through this origin rather than straight to Supabase.
 *
 * The browser used to upload to Supabase Storage directly, which the cafés' ISP
 * blocks — so photo upload was the one owner action that failed on the very
 * network the dashboard is used from. These go to /api/owner/uploads, which
 * checks the café is the owner's, checks the file really is an image, and picks
 * the storage path itself.
 */

export type UploadedImage = { url: string; path: string };

export async function uploadCafeImage(
  cafeId: string,
  file: File,
  purpose: "profile" | "gallery"
): Promise<UploadedImage> {
  const form = new FormData();
  form.append("cafeId", cafeId);
  form.append("purpose", purpose);
  form.append("file", file);

  const res = await fetch("/api/owner/uploads", {
    method: "POST",
    credentials: "include",
    // No Content-Type header: the browser has to set the multipart boundary,
    // and naming it by hand produces a body the server cannot parse.
    body: form,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not upload that image");

  return { url: data.url as string, path: data.path as string };
}

/**
 * Removes a stored image. Takes the public URL, which is what callers hold once
 * a photo has been saved against a café.
 *
 * Never throws: deleting the old file is tidying up, and failing to tidy up
 * should not stop the photo being replaced.
 */
export async function deleteCafeImage(cafeId: string, url: string | null | undefined): Promise<void> {
  if (!url) return;

  try {
    await fetch("/api/owner/uploads", {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cafeId, url }),
    });
  } catch {
    // An orphaned file costs a little storage; a failed save costs the owner
    // their photo.
  }
}
