import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/server/auth"

export const dynamic = "force-dynamic"

const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"])
// 2 MB backstop: the client always canvas-resizes to 256×256 JPEG first
// (tens of KB typical), so legitimate uploads never approach this cap.
const MAX_BYTES = 2 * 1024 * 1024

/**
 * Avatar metadata registration. Bytes travel client-direct to Vercel Blob
 * (see /api/blob-upload); this endpoint only validates the completed
 * upload and returns the serving URL (/api/avatars/[name] proxies Blob
 * bytes, so avatar URLs keep their existing shape).
 * Accepts JSON { storedName, size } (PNG/JPG/WebP).
 */
export async function POST(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { storedName, size, name } = body as {
      storedName?: unknown
      size?: unknown
      name?: unknown
    }

    if (
      typeof storedName !== "string" ||
      !/^avatar_[A-Za-z0-9]+\.(png|jpe?g|webp)$/.test(storedName)
    ) {
      return NextResponse.json({ ok: false, error: "Invalid file reference." }, { status: 400 })
    }
    if (typeof size !== "number" || !(size > 0)) {
      return NextResponse.json({ ok: false, error: "File is empty." }, { status: 400 })
    }
    if (size > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Image exceeds the 2 MB limit." },
        { status: 400 }
      )
    }

    return NextResponse.json({
      ok: true,
      file: {
        name: typeof name === "string" ? name : storedName,
        size,
        url: `/api/avatars/${storedName}`,
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
