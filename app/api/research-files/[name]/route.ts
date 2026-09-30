import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/server/auth"
import { canServeResearchFile } from "@/lib/server/auth-db"
import { fetchBlobBytes } from "@/lib/server/blob"
import path from "path"

export const dynamic = "force-dynamic"

const INLINE_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
}

/**
 * Serves research-folder files. Membership-gated exactly like chapter
 * attachments (non-members get 404, never 403). Only safe types (PDF,
 * images, plain text) open inline; EVERYTHING else is a forced download
 * with nosniff so uploaded HTML/SVG/scripts can never execute in the app.
 * Every file also has a download URL: the same URL with ?download=1.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const { name } = await params
    if (!name || !/^[A-Za-z0-9._-]+$/.test(name) || name.includes("..")) {
      return NextResponse.json({ ok: false, error: "File not found." }, { status: 404 })
    }

    // Membership + folder/file access, all hidden as 404 (an excluded
    // file reads exactly like a non-existent one).
    const record = await canServeResearchFile(user.id, name)
    if (!record.ok) {
      return NextResponse.json({ ok: false, error: "File not found." }, { status: 404 })
    }

    const ext = path.extname(name).toLowerCase()
    let buffer: Buffer
    try {
      buffer = await fetchBlobBytes(name)
    } catch {
      return NextResponse.json({ ok: false, error: "File not found." }, { status: 404 })
    }
    const safeName = record.name.replace(/"/g, "")
    const { searchParams } = new URL(request.url)
    const inlineType = INLINE_TYPES[ext]
    const forcedDownload = searchParams.get("download") === "1" || !inlineType
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = new Uint8Array(buffer) as any
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": inlineType ?? "application/octet-stream",
        "Content-Disposition": `${forcedDownload ? "attachment" : "inline"}; filename="${safeName}"`,
        "X-Content-Type-Options": "nosniff",
        "Content-Length": String(buffer.length),
      },
    })
  } catch (error) {
    console.error("Serve research file error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to serve file." },
      { status: 500 }
    )
  }
}
