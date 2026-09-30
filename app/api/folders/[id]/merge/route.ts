import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/server/auth"
import { mergeGroupFolders } from "@/lib/server/auth-db"

export const dynamic = "force-dynamic"

// Merge one folder into another: move all files (renaming incoming ones on
// collision), then delete the source folder. Atomic — a single store write,
// no bytes move on disk. Requires edit rights on both folders.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const groupId = typeof body.groupId === "string" ? body.groupId.trim() : ""
    if (!groupId) {
      return NextResponse.json({ ok: false, error: "groupId is required." }, { status: 400 })
    }
    const targetId = typeof body.targetFolderId === "string" ? body.targetFolderId.trim() : ""
    if (!targetId) {
      return NextResponse.json({ ok: false, error: "targetFolderId is required." }, { status: 400 })
    }
    const result = await mergeGroupFolders(user.id, groupId, id, targetId)
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status || 400 }
      )
    }
    return NextResponse.json({ ok: true, moved: result.moved })
  } catch (error) {
    console.error("Merge folders error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to merge folders." },
      { status: 500 }
    )
  }
}
