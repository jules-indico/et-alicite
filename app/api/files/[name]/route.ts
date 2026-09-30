import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/server/auth"
import { findUploadedFile, isGroupMember } from "@/lib/server/auth-db"
import { fetchBlobBytes } from "@/lib/server/blob"
import path from "path"

export const dynamic = "force-dynamic"

const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

/**
 * Serves uploaded chapter attachments. Membership-gated: the requester must
 * belong to the group owning the chapter the file is attached to. PDFs and
 * text preview inline in a new tab; docx downloads (no inline preview).
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
    if (!name || !/^[A-Za-z0-9._-]+$/.test(name) || name.includes("..")) {
      return NextResponse.json({ ok: false, error: "Invalid file reference." }, { status: 400 })
    }

    const record = await findUploadedFile(name)
    if (!record || !(await isGroupMember(user.id, record.groupId))) {
      return NextResponse.json({ ok: false, error: "File not found." }, { status: 404 })
    }

    if (!record.blobUrl) {
      return NextResponse.json({ ok: false, error: "File not found." }, { status: 404 })
    }

    const ext = path.extname(name).toLowerCase()
    const buffer = await fetchBlobBytes(record.blobUrl)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = new Uint8Array(buffer) as any
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
        "Content-Disposition": `inline; filename="${record.name.replace(/"/g, "")}"`,
        "Content-Length": String(buffer.length),
      },
    })
  } catch (error) {
    console.error("Serve file error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to serve file." },
      { status: 500 }
    )
  }
}
