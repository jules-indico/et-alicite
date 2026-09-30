import { del, head } from "@vercel/blob"

/**
 * Vercel Blob storage for all uploaded bytes (avatars, attachments,
 * research files). The store is private, so:
 * - uploads go client-direct via `upload()` + the /api/blob-upload token
 *   route (which validates auth, type, size, quota, and access first);
 * - reads go through the existing /api/... serving routes, which enforce
 *   the usual membership checks and then stream bytes from a signed URL.
 *
 * Pathnames stay unguessable (`avatar_` / `<timestamp>_<hex>` /
 * `research_` + timestamp + random hex); clients keep using the existing
 * /api/files|avatars|research-files URL shapes, which now proxy Blob
 * bytes instead of local disk.
 */

/** Best-effort delete by pathname that never throws (cleanup paths must not fail writes). */
export async function deleteBlob(pathname: string): Promise<void> {
  try {
    await del(pathname)
  } catch {
    // Ignore cleanup failures.
  }
}

/** Fetch stored bytes for proxied serving / zip / text extraction. */
export async function fetchBlobBytes(pathname: string): Promise<Buffer> {
  const meta = await head(pathname)
  const url = meta.downloadUrl
  if (!url) {
    throw new Error("Blob has no download URL.")
  }
  // Private store: reads need the token even server-side.
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN ?? ""}` },
  })
  if (!res.ok) {
    throw new Error(`Blob fetch failed (${res.status}).`)
  }
  return Buffer.from(await res.arrayBuffer())
}
