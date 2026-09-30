import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/server/auth"
import { getOrGenerateInviteToken, setInviteEnabled } from "@/lib/server/auth-db"

export const dynamic = "force-dynamic"

/** Leader-only: get (generating once) this group's invite token + link. */
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
    const result = await getOrGenerateInviteToken(user.id, id)
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status || 400 }
      )
    }
    return NextResponse.json({ ok: true, invite: result.invite })
  } catch (error) {
    console.error("Get invite token error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to get invite link." },
      { status: 500 }
    )
  }
}

/** Leader-only: toggle inviteEnabled ({ enabled: boolean }). */
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
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json(
        { ok: false, error: "Request body must include { enabled: boolean }." },
        { status: 400 }
      )
    }
    const result = await setInviteEnabled(user.id, id, body.enabled)
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status || 400 }
      )
    }
    return NextResponse.json({ ok: true, enabled: result.enabled })
  } catch (error) {
    console.error("Toggle invite error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to update invite link." },
      { status: 500 }
    )
  }
}
