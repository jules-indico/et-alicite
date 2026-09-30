import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/server/auth"
import { renameGroupFolder, deleteGroupFolder } from "@/lib/server/auth-db"

export const dynamic = "force-dynamic"

function extractGroupId(searchParams: URLSearchParams, body: any): string {
  const fromQuery = searchParams.get("groupId")?.trim()
  if (fromQuery) return fromQuery
  return typeof body.groupId === "string" ? body.groupId.trim() : ""
}

export async function PATCH(
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
    const groupId = extractGroupId(new URL(request.url).searchParams, body)
    if (!groupId) {
      return NextResponse.json({ ok: false, error: "groupId is required." }, { status: 400 })
    }
    const { groupId: _ignored, ...patch } = body
    const result = await renameGroupFolder(user.id, groupId, id, patch)
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status || 400 }
      )
    }
    return NextResponse.json({ ok: true, folder: result.folder })
  } catch (error) {
    console.error("Rename folder error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to rename folder." },
      { status: 500 }
    )
  }
}

export async function DELETE(
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
    const groupId = extractGroupId(new URL(request.url).searchParams, body)
    if (!groupId) {
      return NextResponse.json({ ok: false, error: "groupId is required." }, { status: 400 })
    }
    const result = await deleteGroupFolder(user.id, groupId, id)
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status || 400 }
      )
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Delete folder error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to delete folder." },
      { status: 500 }
    )
  }
}
