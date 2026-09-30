import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/server/auth"
import { putBlob } from "@/lib/server/blob"
import path from "path"
import crypto from "crypto"

export const dynamic = "force-dynamic"

// Avatar validation stays independent of the document pipeline.
const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"])
// 2 MB backstop: the client always canvas-resizes to 256×256 JPEG first
// (tens of KB typical), so legitimate uploads never approach this cap.
const MAX_BYTES = 2 * 1024 * 1024

/**
 * Avatar image upload. Accepts common image formats (PNG/JPG/WebP, 2 MB
 * cap), stores bytes in Vercel Blob under an unguessable avatar_ name,
 * and returns the public Blob URL (avatars render on public profiles, so
 * no serving gate is needed — the URL itself is unguessable).
 */
export async function POST(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData().catch(() => null)
    const file = formData?.get("file")
    if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
      return NextResponse.json({ ok: false, error: "No file provided." }, { status: 400 })
    }

    const upload = file as unknown as File
    if (upload.size <= 0) {
      return NextResponse.json({ ok: false, error: "File is empty." }, { status: 400 })
    }
    if (upload.size > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Image exceeds the 2 MB limit." },
        { status: 400 }
      )
    }

    const ext = path.extname(upload.name || "").toLowerCase()
    if (!ALLOWED_EXT.has(ext)) {
      return NextResponse.json(
        { ok: false, error: "Only PNG, JPG, and WebP images are supported." },
        { status: 400 }
      )
    }
    const mime = upload.type.toLowerCase()
    if (mime && !["image/png", "image/jpeg", "image/webp"].includes(mime)) {
      return NextResponse.json(
        { ok: false, error: "Only PNG, JPG, and WebP images are supported." },
        { status: 400 }
      )
    }

    const normalizedExt = ext === ".jpeg" ? ".jpg" : ext
    const storedName = `avatar_${Date.now()}_${crypto.randomBytes(8).toString("hex")}${normalizedExt}`
    const buffer = Buffer.from(await upload.arrayBuffer())
    const contentType =
      normalizedExt === ".png"
        ? "image/png"
        : normalizedExt === ".webp"
          ? "image/webp"
          : "image/jpeg"
    const blob = await putBlob(`avatars/${storedName}`, buffer, contentType)

    return NextResponse.json({
      ok: true,
      file: {
        name: upload.name,
        size: upload.size,
        url: blob.url,
        storedName,
      },
    })
  } catch (error) {
    console.error("Avatar upload error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to upload image." },
      { status: 500 }
    )
  }
}
