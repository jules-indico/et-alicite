import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/server/auth"
import { getAssignedTasks } from "@/lib/server/auth-db"

export const dynamic = "force-dynamic"

// Account-level view: every task assigned to the caller across ALL groups
// they belong to (each row carries its groupName). Membership is enforced
// per group inside getAssignedTasks — the same access rule as the
// group-scoped endpoints, so outsiders' tasks can never leak in.
export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }
    return NextResponse.json({ ok: true, tasks: await getAssignedTasks(user.id) })
  } catch (error) {
    console.error("List assigned tasks error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to list assigned tasks." },
      { status: 500 }
    )
  }
}
