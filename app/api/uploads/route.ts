import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/server/auth"
import { putBlob } from "@/lib/server/blob"
import path from "path"
import crypto from "crypto"

export const dynamic = "force-dynamic"

const ALLOWED_EXT = new Set([".pdf", ".docx", ".txt"])
// 4.5 MB cap (Vercel Hobby request-body limit) — enforced here and
// pre-checked in the upload UIs.
const MAX_BYTES = Math.floor(4.5 * 1024 * 1024)

/**
 * Real file persistence for chapter attachments. Previously only
 * {name, size} metadata was kept and the bytes were discarded in the
 * browser. Accepts multipart uploads (.pdf/.docx/.txt, 4.5 MB cap),
 * stores bytes in Vercel Blob, and returns a retrievable URL.
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
        { ok: false, error: "File exceeds the 4.5 MB limit." },
        { status: 400 }
      )
    }

    const originalName = upload.name || "file"
    const ext = path.extname(originalName).toLowerCase()
    if (!ALLOWED_EXT.has(ext)) {
      return NextResponse.json(
        { ok: false, error: "Only .pdf, .docx, and .txt files are supported." },
        { status: 400 }
      )
    }

    const storedName = `${Date.now()}_${crypto.randomBytes(8).toString("hex")}${ext}`
    const buffer = Buffer.from(await upload.arrayBuffer())
    const contentType =
      ext === ".pdf" ? "application/pdf" : ext === ".txt" ? "text/plain" : "application/octet-stream"
    const blob = await putBlob(`attachments/${storedName}`, buffer, contentType)

    return NextResponse.json({
      ok: true,
      file: {
        name: originalName,
        size: upload.size,
        url: `/api/files/${storedName}`,
        storedName,
        blobUrl: blob.url,
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
