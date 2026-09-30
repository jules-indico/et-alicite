import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyCredentials, createSession } from "@/lib/server/auth-db"

export const dynamic = "force-dynamic"

const SESSION_COOKIE_NAME = "et_alicite_session"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || typeof email !== "string" || !password || typeof password !== "string") {
      return NextResponse.json(
        { ok: false, error: "Wrong email/password." },
        { status: 400 }
      )
    }

    const authResult = await verifyCredentials(email, password)
    console.log(`[Signin] Attempt for email="${email}", result=${authResult.ok ? "OK" : authResult.error}`)
    if (!authResult.ok) {
      return NextResponse.json(
        { ok: false, error: authResult.error },
        { status: 401 }
      )
    }

    const session = await createSession(authResult.user.id)
    const cookieStore = await cookies()
    cookieStore.set({
      name: SESSION_COOKIE_NAME,
      value: session.token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    })

    return NextResponse.json({
      ok: true,
      user: authResult.user,
    })
  } catch (error) {
    console.error("Signin error:", error)
    return NextResponse.json(
      { ok: false, error: "An unexpected error occurred during sign in." },
      { status: 500 }
    )
  }
}
