import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/server/auth"
import { resolveInviteToken } from "@/lib/server/auth-db"

export const dynamic = "force-dynamic"

/**
 * Any signed-in user: validate the invite token and report already-member /
 * already-pending, otherwise create a pending join request. Never creates
 * a connection between the requester and the leader.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }
    const { token } = await params
    if (!token || typeof token !== "string" || !token.trim()) {
      return NextResponse.json(
        { ok: false, error: "This invite link is invalid." },
        { status: 404 }
      )
    }
    const result = await resolveInviteToken(user.id, token.trim())
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status || 400 }
      )
    }
    return NextResponse.json({ ok: true, ...result.resolution })
  } catch (error) {
    console.error("Resolve invite token error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to resolve invite link." },
      { status: 500 }
    )
  }
}
