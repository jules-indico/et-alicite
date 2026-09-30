"use client"

import { upload } from "@vercel/blob/client"

export type BlobUploadKind = "avatar" | "attachment" | "research"

function randomHex(bytes = 8): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("")
}

function extOf(name: string): string {
  const dot = name.lastIndexOf(".")
  return dot > 0 ? name.slice(dot).toLowerCase() : ""
}

/**
 * Upload bytes client-direct to Vercel Blob (the store is private, so the
 * browser must send bytes itself). The /api/blob-upload token route
 * re-validates auth, filename shape, type, size, quota, and access before
 * any token is issued. Returns the storedName to send to the metadata
 * endpoints (/api/avatars, /api/uploads, /api/folders/[id]/files).
 */
export async function uploadToBlob(
  kind: BlobUploadKind,
  file: File,
  extra?: { groupId?: string; folderId?: string }
): Promise<{ storedName: string; size: number; mimeType: string }> {
  const ts = Date.now()
  const rand = randomHex()
  const ext = extOf(file.name)
  const storedName =
    kind === "avatar"
      ? `avatar_${ts}${rand}${ext}`
      : kind === "attachment"
        ? `${ts}_${rand}${ext}`
        : `research_${ts}${rand}${ext}`
  const mimeType = file.type || "application/octet-stream"
  const result = await upload(storedName, file, {
    access: "private",
    handleUploadUrl: "/api/blob-upload",
    clientPayload: JSON.stringify({
      kind,
      size: file.size,
      mimeType,
      groupId: extra?.groupId,
      folderId: extra?.folderId,
    }),
  })
  return { storedName: result.pathname, size: file.size, mimeType }
}
