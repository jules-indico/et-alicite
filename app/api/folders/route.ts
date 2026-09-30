import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/server/auth"
import { getGroupFolders, createGroupFolder } from "@/lib/server/auth-db"

export const dynamic = "force-dynamic"

// Group-scoped research folders: every folder belongs to a groupId; all
// members of the group see the same list. `createdBy` is attribution only.
export async function GET(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }
    const { searchParams } = new URL(request.url)
    const groupId = searchParams.get("groupId")?.trim()
    if (!groupId) {
      return NextResponse.json({ ok: false, error: "groupId is required." }, { status: 400 })
    }
    const result = await getGroupFolders(user.id, groupId)
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status || 400 }
      )
    }
    return NextResponse.json({ ok: true, folders: result.folders })
  } catch (error) {
    console.error("List folders error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to list folders." },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }
    const body = await request.json().catch(() => ({}))
    const groupId = typeof body.groupId === "string" ? body.groupId.trim() : ""
    if (!groupId) {
      return NextResponse.json({ ok: false, error: "groupId is required." }, { status: 400 })
    }
    const result = await createGroupFolder(user.id, groupId, body)
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status || 400 }
      )
    }
    return NextResponse.json({ ok: true, folder: result.folder })
  } catch (error) {
    console.error("Create folder error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to create folder." },
      { status: 500 }
    )
  }
}
