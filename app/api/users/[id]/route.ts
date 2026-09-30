import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/server/auth"
import { findUserById, toPublicUser } from "@/lib/server/auth-db"

export const dynamic = "force-dynamic"

// Public profile lookup: any signed-in user may view any account's PUBLIC
// fields only (toPublicUser strips email, password hash, and salt).
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
    return NextResponse.json({ ok: true, user: toPublicUser(target) })
  } catch (error) {
    console.error("Public profile lookup error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to load profile." },
      { status: 500 }
    )
  }
}
