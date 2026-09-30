import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getSessionUser, setUserAvatar, setUserProfile, setUserPreferences } from "@/lib/server/auth-db"
import { getAuthUser } from "@/lib/server/auth"

export const dynamic = "force-dynamic"

const SESSION_COOKIE_NAME = "et_alicite_session"

export async function GET() {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)

    if (!sessionCookie || !sessionCookie.value) {
      return NextResponse.json({ ok: false, user: null }, { status: 401 })
    }

    const user = await getSessionUser(sessionCookie.value)
    if (!user) {
      // Token expired or invalid, remove stale cookie
      cookieStore.delete(SESSION_COOKIE_NAME)
      return NextResponse.json({ ok: false, user: null }, { status: 401 })
    }

    return NextResponse.json({ ok: true, user })
  } catch (error) {
    console.error("Auth check error:", error)
    return NextResponse.json({ ok: false, user: null }, { status: 500 })
  }
}

/**
 * Update the caller's own avatar and/or public-profile fields. Accepts
 * { avatarUrl } — either a URL previously returned by POST /api/avatars,
 * or "" / null to remove — plus { bio } (200 chars max, "" clears) and
 * { showConnections, showGroups } booleans.
 */
export async function PATCH(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }
    const body = await request.json().catch(() => ({}))
    let merged = user
    if ("avatarUrl" in body) {
      const raw = typeof body.avatarUrl === "string" ? body.avatarUrl.trim() : null
      const result = await setUserAvatar(user.id, raw ? raw : null)
      if (!result.ok) {
        return NextResponse.json(
          { ok: false, error: result.error },
          { status: result.status || 400 }
        )
      }
      merged = result.user
    }
    if (body.preferences && typeof body.preferences === "object") {
      const result = await setUserPreferences(user.id, {
        views: (body.preferences as { views?: unknown }).views as Partial<Record<string, string>> | undefined,
        sorts: (body.preferences as { sorts?: unknown }).sorts as Partial<Record<string, unknown>> | undefined,
      })
      if (!result.ok) {
        return NextResponse.json(
          { ok: false, error: result.error },
          { status: result.status || 400 }
        )
      }
      merged = result.user
    }
    if ("bio" in body || "showConnections" in body || "showGroups" in body || "displayName" in body || "firstName" in body || "lastName" in body || "username" in body || "role" in body) {
      const result = await setUserProfile(user.id, {
        bio: "bio" in body ? (body.bio as string | null) : undefined,
        showConnections:
          typeof body.showConnections === "boolean" ? body.showConnections : undefined,
        showGroups: typeof body.showGroups === "boolean" ? body.showGroups : undefined,
        displayName: "displayName" in body ? (body.displayName as string) : undefined,
        firstName: "firstName" in body ? (body.firstName as string) : undefined,
        lastName: "lastName" in body ? (body.lastName as string) : undefined,
        username: "username" in body ? (body.username as string) : undefined,
        role: "role" in body ? (body.role as string) : undefined,
      })
      if (!result.ok) {
        return NextResponse.json(
          { ok: false, error: result.error },
          { status: result.status || 400 }
        )
      }
      merged = result.user
    }
    return NextResponse.json({ ok: true, user: merged })
  } catch (error) {
    console.error("Profile update error:", error)
    return NextResponse.json(
      { ok: false, error: "Failed to update profile." },
      { status: 500 }
    )
  }
}
