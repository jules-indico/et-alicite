import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/server/auth"
import {
  getActiveGroupForUser,
  setActiveGroupForUser,
} from "@/lib/server/auth-db"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const result = await getActiveGroupForUser(user.id)
    return NextResponse.json({
      ok: true,
      activeGroupId: result.activeGroupId,
      activeGroup: result.activeGroup,
    })
  } catch (error) {
    console.error("Get active group error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to get active group." },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { groupId } = body

    const targetGroupId = typeof groupId === "string" ? groupId.trim() : null

    const result = await setActiveGroupForUser(user.id, targetGroupId)
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status || 400 }
      )
    }

    return NextResponse.json({
      ok: true,
      activeGroupId: result.activeGroupId,
      activeGroup: result.activeGroup,
    })
  } catch (error) {
    console.error("Set active group error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to set active group." },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  return PUT(request)
}
