import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/server/auth"
import {
  getUserResearchGroups,
  createResearchGroup,
} from "@/lib/server/auth-db"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const groups = await getUserResearchGroups(user.id)
    return NextResponse.json({ ok: true, groups })
  } catch (error) {
    console.error("List research groups error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to list research groups." },
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
    const { name, description, memberIds, researchTitle } = body

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { ok: false, error: "Group name is required." },
        { status: 400 }
      )
    }

    if (!researchTitle || typeof researchTitle !== "string" || !researchTitle.trim()) {
      return NextResponse.json(
        { ok: false, error: "Research title is required." },
        { status: 400 }
      )
    }

    const membersArray = Array.isArray(memberIds) ? memberIds : []

    const result = await createResearchGroup(user.id, name, description, membersArray, researchTitle)
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status || 400 }
      )
    }

    return NextResponse.json({ ok: true, group: result.group })
  } catch (error) {
    console.error("Create research group error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to create research group." },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    let groupId = searchParams.get("id") || searchParams.get("groupId")

    if (!groupId) {
      const body = await request.json().catch(() => ({}))
      groupId = body.groupId || body.id
    }

    if (!groupId || typeof groupId !== "string" || !groupId.trim()) {
      return NextResponse.json(
        { ok: false, error: "Group ID is required." },
        { status: 400 }
      )
    }

    const { deleteResearchGroup } = await import("@/lib/server/auth-db")
    const result = await deleteResearchGroup(groupId.trim(), user.id)
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status || 400 }
      )
    }

    return NextResponse.json({
      ok: true,
      message: "Research group deleted successfully.",
      deletedGroupId: result.deletedGroupId,
      activeGroupId: result.activeGroupId,
      activeGroup: result.activeGroup,
    })
  } catch (error) {
    console.error("Delete research group error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to delete research group." },
      { status: 500 }
    )
  }
}
