"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react"

export type AuthUser = {
  id: string
  name: string
  displayName?: string
  username?: string
  email: string
  initials: string
  color: string
  role: string
  avatarUrl?: string
  bio?: string
  firstName?: string
  lastName?: string
  showConnections?: boolean
  showGroups?: boolean
  preferences?: {
    views?: Partial<Record<"folders" | "chapters" | "tasks" | "sources", "list" | "grid">>
    sorts?: Partial<Record<string, { key: string; dir: "asc" | "desc" }>>
  }
  activeGroupId?: string | null
  createdAt?: string
}

type AuthState =
  | { status: "loading" }
  | { status: "authenticated"; user: AuthUser }
  | { status: "unauthenticated" }

type AuthContextValue = {
  authState: AuthState
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  signUp: (firstName: string, lastName: string, email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  signOut: () => Promise<void>
  /** Re-fetch the session user (e.g. after an avatar change) and refresh state + cache. */
  refreshUser: () => Promise<void>
  currentUser: AuthUser | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

const STORAGE_KEY = "et-alicite-user"

export { STORAGE_KEY as AUTH_STORAGE_KEY }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({ status: "loading" })

  // Verify session on mount with backend
  useEffect(() => {
    let isMounted = true

    // Optimistically check cached user to prevent flickers
    try {
      const cached = localStorage.getItem(STORAGE_KEY)
      if (cached) {
        const parsed: AuthUser = JSON.parse(cached)
        if (isMounted) {
          setAuthState({ status: "authenticated", user: parsed })
        }
      }
    } catch {
      // Ignore cache parse error
    }

    // Always revalidate against the real backend session
    async function checkSession() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" })
        if (!isMounted) return

        if (res.ok) {
          const data = await res.json()
          if (data.ok && data.user) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data.user))
            setAuthState({ status: "authenticated", user: data.user })
            return
          }
        }
        // Not authenticated
        localStorage.removeItem(STORAGE_KEY)
        setAuthState({ status: "unauthenticated" })
      } catch {
        if (!isMounted) return
        // If network request failed but we had a cached user, keep it or fallback
        const cached = localStorage.getItem(STORAGE_KEY)
        if (!cached) {
          setAuthState({ status: "unauthenticated" })
        }
      }
    }

    checkSession()

    return () => {
      isMounted = false
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data.ok) {
        return {
          ok: false,
          error: data.error || "Wrong email/password.",
        }
      }

      const user: AuthUser = data.user
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
      setAuthState({ status: "authenticated", user })
      return { ok: true }
    } catch (err) {
      console.error("Sign in failed:", err)
      return {
        ok: false,
        error: "Network error occurred. Please check your connection and try again.",
      }
    }
  }, [])

  const signUp = useCallback(async (firstName: string, lastName: string, email: string, password: string) => {
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email, password }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data.ok) {
        return {
          ok: false,
          error: data.error || "Unable to create account. Please try again.",
        }
      }

      const user: AuthUser = data.user
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
      setAuthState({ status: "authenticated", user })
      return { ok: true }
    } catch (err) {
      console.error("Sign up failed:", err)
      return {
        ok: false,
        error: "Network error occurred. Please check your connection and try again.",
      }
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/signout", { method: "POST" })
    } catch {
      // Continue even if network request fails
    } finally {
      localStorage.removeItem(STORAGE_KEY)
      setAuthState({ status: "unauthenticated" })
    }
  }, [])

  const currentUser = authState.status === "authenticated" ? authState.user : null

  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok && data.user) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data.user))
        setAuthState({ status: "authenticated", user: data.user })
      }
    } catch {
      // Keep existing state on network failure.
    }
  }, [])

  return (
    <AuthContext.Provider value={{ authState, signIn, signUp, signOut, refreshUser, currentUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>")
  return ctx
}
