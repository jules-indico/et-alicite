import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/server/auth"
import { getGroupActivities, logGroupActivity } from "@/lib/server/auth-db"

export const dynamic = "force-dynamic"

// Group-scoped: the activity feed belongs to a groupId, so every member sees
// the same recent activity. Actor identity is stored per entry for display
// ("created by User A") — never for access control.
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
    const limit = searchParams.get("limit") !== null ? Number(searchParams.get("limit")) : undefined
    const offset = searchParams.get("offset") !== null ? Number(searchParams.get("offset")) : undefined
    if ((limit !== undefined && !Number.isFinite(limit)) || (offset !== undefined && !Number.isFinite(offset))) {
      return NextResponse.json({ ok: false, error: "limit and offset must be numbers." }, { status: 400 })
    }
    const result = await getGroupActivities(user.id, groupId, { limit, offset })
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status || 400 }
      )
    }
    return NextResponse.json({ ok: true, activities: result.activities, total: result.total })
  } catch (error) {
    console.error("List activities error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to list activities." },
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
    const result = await logGroupActivity(user.id, groupId, {
      action: body.action,
      target: body.target,
      memberName: body.memberName,
      memberInitials: body.memberInitials,
    })
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status || 400 }
      )
    }
    return NextResponse.json({ ok: true, activity: result.activity })
  } catch (error) {
    console.error("Log activity error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to log activity." },
      { status: 500 }
    )
  }
}
