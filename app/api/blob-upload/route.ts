import { NextResponse } from "next/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { getAuthUser } from "@/lib/server/auth"
import {
  getGroupFolders,
  getGroupFileUsage,
  RESEARCH_FILE_MAX_BYTES,
  RESEARCH_GROUP_QUOTA_BYTES,
} from "@/lib/server/auth-db"

export const dynamic = "force-dynamic"

const AVATAR_MAX_BYTES = 2 * 1024 * 1024
const ATTACH_EXT = new Set([".pdf", ".docx", ".txt"])
const AVATAR_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"])
const AVATAR_MIME = new Set(["image/png", "image/jpeg", "image/webp"])

type UploadKind = "avatar" | "attachment" | "research"

/**
 * Client-direct upload tokens (Vercel Blob store is private, so browsers
 * upload straight to Blob). Every constraint the old multipart routes
 * enforced is re-checked here before any token is issued: auth, filename
 * shape, content type, per-file cap, group quota, and folder access.
 * Actual record creation still happens in the metadata endpoints
 * (/api/avatars, /api/uploads, /api/folders/[id]/files).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const user = await getAuthUser()
        if (!user) throw new Error("Unauthorized")

        let payload: {
          kind?: UploadKind
          size?: number
          mimeType?: string
          groupId?: string
          folderId?: string
        }
        try {
          payload = JSON.parse(clientPayload || "{}")
        } catch {
          throw new Error("Invalid upload payload.")
        }

        const size = Number(payload.size) || 0
        if (size <= 0) throw new Error("File is empty.")

        if (payload.kind === "avatar") {
          if (!/^avatar_[A-Za-z0-9]+\.(png|jpe?g|webp)$/.test(pathname)) {
            throw new Error("Invalid avatar filename.")
          }
          if (size > AVATAR_MAX_BYTES) throw new Error("Image exceeds the 2 MB limit.")
          return {
            addRandomSuffix: false,
            allowedContentTypes: [...AVATAR_MIME],
            maximumSizeInBytes: AVATAR_MAX_BYTES,
          }
        }

        if (payload.kind === "attachment") {
          const ext = pathname.slice(pathname.lastIndexOf(".")).toLowerCase()
          if (!/^[0-9]+_[A-Za-z0-9]+\.(pdf|docx|txt)$/.test(pathname) || !ATTACH_EXT.has(ext)) {
            throw new Error("Only .pdf, .docx, and .txt files are supported.")
          }
          if (size > RESEARCH_FILE_MAX_BYTES) {
            throw new Error("File exceeds the 4.5 MB limit.")
          }
          return {
            addRandomSuffix: false,
            allowedContentTypes: [
              "application/pdf",
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              "text/plain",
            ],
            maximumSizeInBytes: RESEARCH_FILE_MAX_BYTES,
          }
        }

        if (payload.kind === "research") {
          const groupId = typeof payload.groupId === "string" ? payload.groupId.trim() : ""
          const folderId = typeof payload.folderId === "string" ? payload.folderId.trim() : ""
          if (!groupId || !folderId) throw new Error("groupId and folderId are required.")
          if (!/^research_[A-Za-z0-9]+(\.[A-Za-z0-9]+)?$/.test(pathname)) {
            throw new Error("Invalid research filename.")
          }
          if (size > RESEARCH_FILE_MAX_BYTES) {
            throw new Error("File exceeds the 4.5 MB per-file limit.")
          }
          const folders = await getGroupFolders(user.id, groupId)
          if (!folders.ok || !folders.folders.some((f) => f.id === folderId)) {
            throw new Error("Folder not found in this group.")
          }
          if ((await getGroupFileUsage(groupId)) + size > RESEARCH_GROUP_QUOTA_BYTES) {
            throw new Error("Group storage quota exceeded (100 MB of research files).")
          }
          return {
            addRandomSuffix: false,
            maximumSizeInBytes: RESEARCH_FILE_MAX_BYTES,
          }
        }

        throw new Error("Unknown upload kind.")
      },
      onUploadCompleted: async () => {},
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload rejected." },
      { status: 400 }
    )
  }
}
