import { cookies } from "next/headers"
import { getSessionUser, type SafeUser } from "./auth-db"

export const SESSION_COOKIE_NAME = "et_alicite_session"

/**
 * Reuses the existing cookie session verification to retrieve the current authenticated SafeUser.
 */
export async function getAuthUser(): Promise<SafeUser | null> {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)
    if (!sessionCookie?.value) {
      return null
    }
    return getSessionUser(sessionCookie.value)
  } catch (error) {
    console.error("getAuthUser error:", error)
    return null
  }
}
