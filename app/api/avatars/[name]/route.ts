import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/server/auth"
import { fetchBlobBytes } from "@/lib/server/blob"
import path from "path"

export const dynamic = "force-dynamic"

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
}

/**
 * Serves avatar images from Vercel Blob. Auth required, but — unlike
 * chapter attachments — NOT group-gated: avatars appear on public
 * profiles and every shared surface, so any signed-in user may load
 * them. File names are unguessable (avatar_<timestamp>_<random hex>)
 * and strictly validated.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const { name } = await params
    if (!name || !/^avatar_[A-Za-z0-9._-]+\.(png|jpe?g|webp)$/.test(name) || name.includes("..")) {
      return NextResponse.json({ ok: false, error: "File not found." }, { status: 404 })
    }

    let buffer: Buffer
    try {
      buffer = await fetchBlobBytes(name)
    } catch {
      return NextResponse.json({ ok: false, error: "File not found." }, { status: 404 })
    }

    const ext = path.extname(name).toLowerCase()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = new Uint8Array(buffer) as any
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=86400, immutable",
        "Content-Length": String(buffer.length),
      },
    })
  } catch (error) {
    console.error("Serve avatar error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to serve file." },
      { status: 500 }
    )
  }
}
