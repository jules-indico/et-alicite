import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/server/auth"
import {
  getFolderFiles,
  registerResearchFiles,
  getGroupFileUsage,
  RESEARCH_FILE_MAX_BYTES,
  RESEARCH_GROUP_QUOTA_BYTES,
  type ResearchFileMeta,
} from "@/lib/server/auth-db"

export const dynamic = "force-dynamic"

function extractGroupId(request: Request): string {
  const fromQuery = new URL(request.url).searchParams.get("groupId")?.trim()
  return fromQuery ?? ""
}

// Files inside one research folder. Uploads accept multiple files per
// request and ANY file type (unlike chapter attachments, which are limited
// to documents). Bytes go to Vercel Blob; only metadata touches Postgres.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }
    const { id } = await params
    const groupId = extractGroupId(request)
    if (!groupId) {
      return NextResponse.json({ ok: false, error: "groupId is required." }, { status: 400 })
    }
    const result = await getFolderFiles(user.id, groupId, id)
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status || 400 }
      )
    }
    return NextResponse.json({ ok: true, files: result.files })
  } catch (error) {
    console.error("List folder files error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to list files." },
      { status: 500 }
    )
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }
    const { id: folderId } = await params
    // Bytes travel client-direct to Vercel Blob (see /api/blob-upload);
    // this endpoint only validates the completed uploads' metadata and
    // registers the records. Accepts JSON { groupId, access, allowedIds,
    // files: [{ name, size, mimeType, storedName }] }.
    const body = await request.json().catch(() => ({}))
    const groupId =
      (typeof body.groupId === "string" && body.groupId.trim()) ||
      extractGroupId(request)
    if (!groupId) {
      return NextResponse.json({ ok: false, error: "groupId is required." }, { status: 400 })
    }

    const uploads = Array.isArray(body.files) ? body.files : []
    if (uploads.length === 0) {
      return NextResponse.json({ ok: false, error: "No files provided." }, { status: 400 })
    }

    // Validate everything (names, per-file cap + group quota) before
    // registering anything.
    let incomingBytes = 0
    for (const upload of uploads) {
      const originalName =
        typeof upload?.name === "string" && upload.name.trim() ? upload.name.trim() : "unnamed"
      if (typeof upload?.size !== "number" || !(upload.size > 0)) {
        return NextResponse.json(
          { ok: false, error: `File "${originalName}" is empty.` },
          { status: 400 }
        )
      }
      if (upload.size > RESEARCH_FILE_MAX_BYTES) {
        return NextResponse.json(
          { ok: false, error: `File "${originalName}" exceeds the 4.5 MB per-file limit.` },
          { status: 400 }
        )
      }
      if (
        typeof upload?.storedName !== "string" ||
        !/^research_[A-Za-z0-9]+(\.[A-Za-z0-9]+)?$/.test(upload.storedName)
      ) {
        return NextResponse.json(
          { ok: false, error: `File "${originalName}" has an invalid file reference.` },
          { status: 400 }
        )
      }
      incomingBytes += upload.size
    }
    if ((await getGroupFileUsage(groupId)) + incomingBytes > RESEARCH_GROUP_QUOTA_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Group storage quota exceeded (100 MB of research files)." },
        { status: 400 }
      )
    }

    const access = typeof body.access === "string" ? body.access : undefined
    const allowedIds = body.allowedIds

    const metas: ResearchFileMeta[] = uploads.map(
      (upload: { name: string; size: number; mimeType?: unknown; storedName: string }) => ({
        name:
          typeof upload.name === "string" && upload.name.trim()
            ? upload.name.trim()
            : "file",
        size: upload.size,
        mimeType:
          typeof upload.mimeType === "string" && upload.mimeType
            ? upload.mimeType
            : "application/octet-stream",
        storedName: upload.storedName,
      })
    )

    const result = await registerResearchFiles(user.id, groupId, folderId, metas, {
      access,
      allowedIds,
    })
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status || 400 }
      )
    }
    return NextResponse.json({ ok: true, files: result.files })
  } catch (error) {
    console.error("Upload folder files error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to upload files." },
      { status: 500 }
    )
  }
}
