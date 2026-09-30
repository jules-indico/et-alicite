import { put, del } from "@vercel/blob"

/**
 * Vercel Blob storage for all uploaded bytes (avatars, attachments,
 * research files). Filenames stay unguessable (`avatar_` /
 * `research_` + timestamp + random hex); callers keep using the existing
 * /api/... URL shapes, which now proxy Blob bytes after their usual
 * membership checks.
 */

export function isBlobUrl(url: string): boolean {
  return /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//.test(url)
}

/** Store bytes under an exact pathname (no random suffix — names are already unique). */
export async function putBlob(
  pathname: string,
  body: Buffer | Uint8Array | Blob,
  contentType: string
): Promise<{ url: string; pathname: string }> {
  const blob = await put(pathname, body as Blob, {
    access: "public",
    contentType,
    addRandomSuffix: false,
  })
  return { url: blob.url, pathname: blob.pathname }
}

/** Best-effort delete that never throws (cleanup paths must not fail writes). */
export async function deleteBlob(urlOrPathname: string): Promise<void> {
  try {
    await del(urlOrPathname)
  } catch {
    // Ignore cleanup failures.
  }
}

/** Fetch stored bytes back for proxied serving / zip / text extraction. */
export async function fetchBlobBytes(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Blob fetch failed (${res.status}).`)
  }
  return Buffer.from(await res.arrayBuffer())
}
