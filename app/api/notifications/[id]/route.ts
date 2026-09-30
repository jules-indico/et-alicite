import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/server/auth"
import { markNotificationRead } from "@/lib/server/auth-db"

export const dynamic = "force-dynamic"

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
    const result = await markNotificationRead(user.id, id, body.read !== false)
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status || 400 }
      )
    }
    return NextResponse.json({ ok: true, notification: result.notification })
  } catch (error) {
    console.error("Update notification error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to update notification." },
      { status: 500 }
    )
  }
}
