import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/server/auth"
import {
  getResearchGroupById,
  deleteResearchGroup,
  updateResearchGroup,
  enrichGroup,
} from "@/lib/server/auth-db"

export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const group = await getResearchGroupById(id)
    if (!group) {
      return NextResponse.json({ ok: false, error: "Research group not found." }, { status: 404 })
    }

    const isMember = group.members.some((m) => m.userId === user.id)
    if (!isMember) {
      return NextResponse.json(
        { ok: false, error: "You are not a member of this research group." },
        { status: 403 }
      )
    }

    return NextResponse.json({ ok: true, group: await enrichGroup(group, user.id) })
  } catch (error) {
    console.error("Get research group error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to get research group." },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Group ID is required." },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const result = await updateResearchGroup(user.id, id, {
      name: typeof body.name === "string" ? body.name : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      researchTitle: typeof body.researchTitle === "string" ? body.researchTitle : undefined,
      addMemberIds: Array.isArray(body.addMemberIds) ? body.addMemberIds : undefined,
      removeMemberIds: Array.isArray(body.removeMemberIds) ? body.removeMemberIds : undefined,
    })
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status || 400 }
      )
    }

    return NextResponse.json({
      ok: true,
      message: "Research group updated successfully.",
      group: result.group,
    })
  } catch (error) {
    console.error("Update research group error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to update research group." },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Group ID is required." },
        { status: 400 }
      )
    }

    const result = await deleteResearchGroup(id, user.id)
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
