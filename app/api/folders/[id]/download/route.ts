import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/server/auth"
import {
  getGroupFolders,
  getFolderFiles,
  isGroupMember,
} from "@/lib/server/auth-db"
import JSZip from "jszip"
import { fetchBlobBytes } from "@/lib/server/blob"

export const dynamic = "force-dynamic"

function sanitizeFilename(name: string): string {
  const base = (name || "folder").trim().replace(/[\\/:*?"<>|]/g, "_").slice(0, 80)
  return base || "folder"
}

/**
 * Download a folder as .zip. Membership + folder access enforced like the
 * other endpoints (outsiders and excluded viewers get the same 404 as a
 * missing folder). The zip contains ONLY files the requester can access
 * under the existing folder-AND-file rules. Zero accessible files is a
 * 400 ("No files to download"), never an empty zip.
 */
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
    const { searchParams } = new URL(request.url)
    const groupId = searchParams.get("groupId")?.trim()
    if (!groupId) {
      return NextResponse.json({ ok: false, error: "groupId is required." }, { status: 400 })
    }
    if (!(await isGroupMember(user.id, groupId))) {
      return NextResponse.json({ ok: false, error: "Folder not found in this group." }, { status: 404 })
    }

    const folders = await getGroupFolders(user.id, groupId)
    const folder = folders.ok
      ? folders.folders.find((f) => f.id === id) ?? null
      : null
    if (!folder) {
      // Absent for outsiders, excluded viewers, and genuinely missing ids alike.
      return NextResponse.json({ ok: false, error: "Folder not found in this group." }, { status: 404 })
    }

    const listed = await getFolderFiles(user.id, groupId, id)
    const files = listed.ok ? listed.files : []
    if (files.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No files to download." },
        { status: 400 }
      )
    }

    const zip = new JSZip()
    const seen = new Set<string>()
    for (const file of files) {
      if (!file.blobUrl) continue
      let bytes: Buffer
      try {
        bytes = await fetchBlobBytes(file.blobUrl)
      } catch {
        continue
      }
      // De-duplicate display names inside the archive.
      let entryName = file.name || "file"
      let n = 1
      while (seen.has(entryName)) {
        n += 1
        const dot = file.name.lastIndexOf(".")
        entryName =
          dot > 0
            ? `${file.name.slice(0, dot)} (${n})${file.name.slice(dot)}`
            : `${file.name} (${n})`
      }
      seen.add(entryName)
      zip.file(entryName, bytes)
    }

    const names = Object.keys(zip.files)
    if (names.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No files to download." },
        { status: 400 }
      )
    }

    const buffer = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    })
    const zipName = `${sanitizeFilename(folder.name)}.zip`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = buffer as any
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipName.replace(/"/g, "")}"`,
        "X-Content-Type-Options": "nosniff",
        "Content-Length": String(buffer.length),
      },
    })
  } catch (error) {
    console.error("Download folder error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to download folder." },
      { status: 500 }
    )
  }
}
