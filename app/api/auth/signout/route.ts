import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { destroySession } from "@/lib/server/auth-db"

export const dynamic = "force-dynamic"

const SESSION_COOKIE_NAME = "et_alicite_session"

export async function POST() {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)

    if (sessionCookie && sessionCookie.value) {
      await destroySession(sessionCookie.value)
    }

    cookieStore.delete(SESSION_COOKIE_NAME)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Signout error:", error)
    return NextResponse.json({ ok: false, error: "Failed to sign out." }, { status: 500 })
  }
}
