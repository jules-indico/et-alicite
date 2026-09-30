import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/server/auth"
import { markAllNotificationsRead } from "@/lib/server/auth-db"

export const dynamic = "force-dynamic"

export async function POST() {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }
    const result = await markAllNotificationsRead(user.id)
    return NextResponse.json({ ok: true, count: result.count })
  } catch (error) {
    console.error("Mark all notifications read error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to mark notifications as read." },
      { status: 500 }
    )
  }
}
