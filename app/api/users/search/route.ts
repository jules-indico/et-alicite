import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/server/auth"
import { searchUsers } from "@/lib/server/auth-db"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const query = searchParams.get("q") ?? ""

    const users = await searchUsers(query, user.id)
    return NextResponse.json({ ok: true, users })
  } catch (error) {
    console.error("Search users error:", error)
    return NextResponse.json({ ok: false, error: "Failed to search users." }, { status: 500 })
  }
}
