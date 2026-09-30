import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/server/auth"
import { getNotifications, syncDeadlineNotifications } from "@/lib/server/auth-db"

export const dynamic = "force-dynamic"

// Own notifications, newest first. Deadline events are derived from live
// task data on read (see syncDeadlineNotifications).
export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }
    await syncDeadlineNotifications(user.id)
    return NextResponse.json({ ok: true, notifications: await getNotifications(user.id) })
  } catch (error) {
    console.error("List notifications error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to list notifications." },
      { status: 500 }
    )
  }
}
