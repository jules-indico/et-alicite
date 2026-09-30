"use client"

/**
 * Client avatar pipeline: validate → (crop if non-square) → canvas
 * resize/compress → upload → save. Every avatar is normalized to a small
 * 256×256 JPEG before upload, so stored files stay in the tens of KB
 * regardless of the 2 MB server backstop.
 */

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024
export const AVATAR_ACCEPT = [".png", ".jpg", ".jpeg", ".webp"]
export const AVATAR_OUTPUT_SIZE = 256

export function validateAvatarFile(file: File): string | null {
  const ext = `.${(file.name.split(".").pop() ?? "").toLowerCase()}`
  if (!AVATAR_ACCEPT.includes(ext)) {
    return "Please choose a PNG, JPG, or WebP image."
  }
  if (file.size <= 0) return "That file is empty."
  if (file.size > AVATAR_MAX_BYTES) {
    return "Image exceeds the 2 MB limit. Please choose a smaller file."
  }
  return null
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Could not read that image."))
    img.src = src
  })
}

export type CropPixels = { x: number; y: number; width: number; height: number }

/** True when the image is already (near-)square — no crop step needed. */
export async function isSquareImage(src: string): Promise<boolean> {
  const img = await loadImage(src)
  return Math.abs(img.naturalWidth - img.naturalHeight) / Math.max(img.naturalWidth, img.naturalHeight) < 0.02
}

/**
 * Render a square crop of `src` to a 256×256 JPEG blob. `pixels` comes
 * from the cropper (natural-image coordinates); omit it to use the full
 * image (already-square uploads).
 */
export async function renderAvatarBlob(src: string, pixels?: CropPixels): Promise<Blob> {
  const img = await loadImage(src)
  const sx = pixels?.x ?? 0
  const sy = pixels?.y ?? 0
  const sw = pixels?.width ?? img.naturalWidth
  const sh = pixels?.height ?? img.naturalHeight
  const canvas = document.createElement("canvas")
  canvas.width = AVATAR_OUTPUT_SIZE
  canvas.height = AVATAR_OUTPUT_SIZE
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas is not available in this browser.")
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85)
  )
  if (!blob) throw new Error("Could not process that image.")
  return blob
}

const AVATAR_EVENT = "et-alicite:avatar-updated"

/** Notify mounted surfaces to re-fetch user data after an avatar change. */
export function notifyAvatarUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AVATAR_EVENT))
  }
}

/** Re-run `cb` whenever any avatar change is announced. */
export function onAvatarUpdated(cb: () => void): () => void {
  const handler = () => cb()
  window.addEventListener(AVATAR_EVENT, handler)
  return () => window.removeEventListener(AVATAR_EVENT, handler)
}
