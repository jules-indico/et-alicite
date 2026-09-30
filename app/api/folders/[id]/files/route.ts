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
import { putBlob, deleteBlob } from "@/lib/server/blob"
import path from "path"
import crypto from "crypto"

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
    const formData = await request.formData().catch(() => null)
    const groupId =
      (formData?.get("groupId") && String(formData.get("groupId")).trim()) ||
      extractGroupId(request)
    if (!groupId) {
      return NextResponse.json({ ok: false, error: "groupId is required." }, { status: 400 })
    }

    const uploads = (formData?.getAll("file") ?? []).filter(
      (f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f
    ) as unknown as File[]
    if (uploads.length === 0) {
      return NextResponse.json({ ok: false, error: "No files provided." }, { status: 400 })
    }

    // Validate everything (per-file cap + group quota) before writing bytes.
    let incomingBytes = 0
    for (const upload of uploads) {
      if (upload.size <= 0) {
        return NextResponse.json(
          { ok: false, error: `File "${upload.name || "unnamed"}" is empty.` },
          { status: 400 }
        )
      }
      if (upload.size > RESEARCH_FILE_MAX_BYTES) {
        return NextResponse.json(
          { ok: false, error: `File "${upload.name || "unnamed"}" exceeds the 4.5 MB per-file limit.` },
          { status: 400 }
        )
      }
      incomingBytes += upload.size
    }
    if (await getGroupFileUsage(groupId) + incomingBytes > RESEARCH_GROUP_QUOTA_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Group storage quota exceeded (100 MB of research files)." },
        { status: 400 }
      )
    }

    const accessRaw = formData?.get("access")
    const access = typeof accessRaw === "string" ? accessRaw : undefined
    const allowedRaw = formData?.get("allowedIds")
    let allowedIds: unknown
    if (typeof allowedRaw === "string" && allowedRaw.trim()) {
      try {
        allowedIds = JSON.parse(allowedRaw)
      } catch {
        allowedIds = undefined
      }
    } else if (formData) {
      const repeated = formData
        .getAll("allowedIds")
        .map((v) => String(v))
        .filter(Boolean)
      if (repeated.length > 0) allowedIds = repeated
    }

    const metas: ResearchFileMeta[] = []
    const written: string[] = []
    try {
      for (const upload of uploads) {
        const originalName = upload.name || "file"
        const ext = path.extname(originalName).toLowerCase()
        const storedName = `research_${Date.now()}_${crypto.randomBytes(8).toString("hex")}${ext}`
        const buffer = Buffer.from(await upload.arrayBuffer())
        const mimeType = upload.type || "application/octet-stream"
        const blob = await putBlob(`research/${storedName}`, buffer, mimeType)
        written.push(blob.url)
        metas.push({
          name: originalName,
          size: upload.size,
          mimeType,
          storedName,
          blobUrl: blob.url,
        })
      }
    } catch (error) {
      for (const url of written) {
        await deleteBlob(url)
      }
      throw error
    }

    const result = await registerResearchFiles(user.id, groupId, folderId, metas, {
      access,
      allowedIds,
    })
    if (!result.ok) {
      for (const url of written) {
        await deleteBlob(url)
      }
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
