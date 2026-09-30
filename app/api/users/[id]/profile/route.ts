import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/server/auth"
import {
  findUserById,
  getAcceptedConnections,
  getUserGroups,
  toPublicUser,
} from "@/lib/server/auth-db"

export const dynamic = "force-dynamic"

/**
 * Full public-profile payload. Section visibility is enforced HERE,
 * server-side: a section the owner set to Private is OMITTED entirely for
 * other viewers (indistinguishable from not existing). The owner always
 * receives their own lists. Visibility flags themselves never leave the
 * server except via the owner's own /api/auth/me record.
 */
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
    const target = await findUserById(id)
    if (!target) {
      return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 })
    }
    const isOwner = user.id === id
    const showConnections = target.showConnections !== false || isOwner
    const showGroups = target.showGroups !== false || isOwner
    return NextResponse.json({
      ok: true,
      user: toPublicUser(target),
      isOwner,
      connections: showConnections ? await getAcceptedConnections(id) : undefined,
      groups: showGroups ? await getUserGroups(id) : undefined,
    })
  } catch (error) {
    console.error("Profile payload error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to load profile." },
      { status: 500 }
    )
  }
}
