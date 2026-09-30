import { NextResponse } from "next/server"
import { getAllSafeUsers, toPublicUser } from "@/lib/server/auth-db"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const users = (await getAllSafeUsers()).map(toPublicUser)
    return NextResponse.json({ ok: true, users })
  } catch (error) {
    console.error("List users error:", error)
    return NextResponse.json({ ok: false, users: [] }, { status: 500 })
  }
}

