import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/server/auth"
import { getGroupSources, createGroupSource } from "@/lib/server/auth-db"

export const dynamic = "force-dynamic"

// Group-scoped: every source belongs to a groupId; all members of the group
// see the same library. `createdBy` is attribution only, never access control.
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
    const result = await getGroupSources(user.id, groupId)
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status || 400 }
      )
    }
    return NextResponse.json({ ok: true, sources: result.sources })
  } catch (error) {
    console.error("List sources error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to list sources." },
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
    const result = await createGroupSource(user.id, groupId, body)
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status || 400 }
      )
    }
    return NextResponse.json({ ok: true, source: result.source })
  } catch (error) {
    console.error("Create source error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to create source." },
      { status: 500 }
    )
  }
}
