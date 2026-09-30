import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/server/auth"
import path from "path"

export const dynamic = "force-dynamic"

const ALLOWED_EXT = new Set([".pdf", ".docx", ".txt"])
// 4.5 MB cap (Vercel Hobby request-body limit) — mirrors the token route,
// which enforces the same cap before any bytes are accepted.
const MAX_BYTES = Math.floor(4.5 * 1024 * 1024)

/**
 * Chapter-attachment metadata registration. Bytes travel client-direct to
 * Vercel Blob (see /api/blob-upload); this endpoint only validates the
 * completed upload's metadata and returns the retrievable record.
 * Accepts JSON { name, size, mimeType, storedName } (.pdf/.docx/.txt).
 */
export async function POST(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { name, size, mimeType, storedName } = body as {
      name?: unknown
      size?: unknown
      mimeType?: unknown
      storedName?: unknown
    }

    const originalName = typeof name === "string" && name.trim() ? name.trim() : "file"
    const ext = path.extname(originalName).toLowerCase()
    if (!ALLOWED_EXT.has(ext)) {
      return NextResponse.json(
        { ok: false, error: "Only .pdf, .docx, and .txt files are supported." },
        { status: 400 }
      )
    }
    if (typeof size !== "number" || !(size > 0)) {
      return NextResponse.json({ ok: false, error: "File is empty." }, { status: 400 })
    }
    if (size > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: "File exceeds the 4.5 MB limit." },
        { status: 400 }
      )
    }
    if (
      typeof storedName !== "string" ||
      !/^[0-9]+_[A-Za-z0-9]+\.(pdf|docx|txt)$/.test(storedName)
    ) {
      return NextResponse.json({ ok: false, error: "Invalid file reference." }, { status: 400 })
    }
    void mimeType

    return NextResponse.json({
      ok: true,
      file: {
        name: originalName,
        size,
        url: `/api/files/${storedName}`,
        storedName,
      },
    })
  } catch (error) {
    console.error("Upload error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to upload file." },
      { status: 500 }
    )
  }
}
