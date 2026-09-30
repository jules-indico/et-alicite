import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { registerUser, createSession } from "@/lib/server/auth-db"

export const dynamic = "force-dynamic"

const SESSION_COOKIE_NAME = "et_alicite_session"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { firstName, lastName, email, password } = body

    if (!firstName || typeof firstName !== "string" || !firstName.trim()) {
      return NextResponse.json(
        { ok: false, error: "Please enter your first name." },
        { status: 400 }
      )
    }

    if (!lastName || typeof lastName !== "string" || !lastName.trim()) {
      return NextResponse.json(
        { ok: false, error: "Please enter your last name." },
        { status: 400 }
      )
    }

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { ok: false, error: "Please enter a valid email address." },
        { status: 400 }
      )
    }

    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { ok: false, error: "Please enter a password." },
        { status: 400 }
      )
    }

    const regResult = await registerUser(firstName, lastName, email, password)
    if (!regResult.ok) {
      return NextResponse.json(
        { ok: false, error: regResult.error },
        { status: 400 }
      )
    }

    const session = await createSession(regResult.user.id)
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
      user: regResult.user,
    })
  } catch (error) {
    console.error("Signup error:", error)
    return NextResponse.json(
      { ok: false, error: "An unexpected error occurred during signup." },
      { status: 500 }
    )
  }
}
