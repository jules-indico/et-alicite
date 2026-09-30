"use client"

import { useCallback, useEffect, useState } from "react"
import { useAuth, AUTH_STORAGE_KEY } from "@/lib/auth-context"
import type { ViewMode, ViewSectionKey, SectionSort, SortDirection, SortScope } from "@/lib/research-data"

/**
 * Per-section list/grid choice persisted to the signed-in user's account
 * (backend storage, so it follows the user across devices and survives
 * logouts — unlike localStorage alone). Each section remembers its own
 * choice independently; scope is per-user, not per-group.
 *
 * No-flash loading: the initial state reads the cached session user
 * synchronously, so returning visits paint the saved view on first render.
 * A later server revalidation that disagrees syncs the state.
 */
export function useSectionView(
  section: ViewSectionKey,
  fallback: ViewMode
): [ViewMode, (mode: ViewMode) => void] {
  const { currentUser, refreshUser } = useAuth()

  function readCached(): ViewMode | null {
    try {
      if (typeof window === "undefined") return null
      const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
      if (!raw) return null
      const mode = (JSON.parse(raw) as { preferences?: { views?: Partial<Record<ViewSectionKey, ViewMode>> } })
        ?.preferences?.views?.[section]
      return mode === "list" || mode === "grid" ? mode : null
    } catch {
      return null
    }
  }

  const [mode, setModeState] = useState<ViewMode>(() => readCached() ?? fallback)

  // Converge with the account record once it loads (covers first login on
  // a new device, where the cache has no preferences yet).
  useEffect(() => {
    const saved = currentUser?.preferences?.views?.[section]
    if ((saved === "list" || saved === "grid") && saved !== mode) {
      setModeState(saved)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.preferences?.views?.[section]])

  const setMode = useCallback(
    (next: ViewMode) => {
      setModeState(next)
      // Fire-and-forget save; refresh pulls the server truth into state.
      void (async () => {
        try {
          const res = await fetch("/api/auth/me", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ preferences: { views: { [section]: next } } }),
          })
          if (!res.ok) return
          try {
            const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
            if (raw) {
              const cached = JSON.parse(raw)
              cached.preferences = {
                ...(cached.preferences ?? {}),
                views: { ...(cached.preferences?.views ?? {}), [section]: next },
              }
              window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(cached))
            }
          } catch {
            // Cache merge is best-effort; the server record is authoritative.
          }
          await refreshUser()
        } catch {
          // Offline save failure keeps the optimistic UI; next load falls
          // back to the last saved value.
        }
      })()
    },
    [section, refreshUser]
  )

  return [mode, setMode]
}

/**
 * Per-section list sort (column + direction) persisted to the signed-in
 * user's account with the same backend storage, cache-first no-flash
 * loading, and per-section independence as useSectionView. Only keys in
 * `validKeys` are accepted from the cache or server; anything else falls
 * back — a stored sort for a section whose UI changed can never break it.
 */
export function useSectionSort(
  section: SortScope,
  fallback: SectionSort,
  validKeys: readonly string[]
): [SectionSort, (sort: SectionSort) => void] {
  const { currentUser, refreshUser } = useAuth()

  function sanitize(value: unknown): SectionSort | null {
    if (!value || typeof value !== "object") return null
    const { key, dir } = value as { key?: unknown; dir?: unknown }
    if (typeof key !== "string" || !validKeys.includes(key)) return null
    const direction: SortDirection = dir === "asc" || dir === "desc" ? dir : fallback.dir
    return { key, dir: direction }
  }

  function readCached(): SectionSort | null {
    try {
      if (typeof window === "undefined") return null
      const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
      if (!raw) return null
      return sanitize(
        (JSON.parse(raw) as { preferences?: { sorts?: Partial<Record<SortScope, SectionSort>> } })
          ?.preferences?.sorts?.[section]
      )
    } catch {
      return null
    }
  }

  const [sort, setSortState] = useState<SectionSort>(() => readCached() ?? fallback)

  // Converge with the account record once it loads (covers first login on
  // a new device, where the cache has no preferences yet).
  useEffect(() => {
    const saved = sanitize(currentUser?.preferences?.sorts?.[section])
    if (saved && (saved.key !== sort.key || saved.dir !== sort.dir)) {
      setSortState(saved)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.preferences?.sorts?.[section]])

  const setSort = useCallback(
    (next: SectionSort) => {
      if (!validKeys.includes(next.key)) return
      const clean: SectionSort = {
        key: next.key,
        dir: next.dir === "asc" || next.dir === "desc" ? next.dir : fallback.dir,
      }
      setSortState(clean)
      // Fire-and-forget save; refresh pulls the server truth into state.
      void (async () => {
        try {
          const res = await fetch("/api/auth/me", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ preferences: { sorts: { [section]: clean } } }),
          })
          if (!res.ok) return
          try {
            const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
            if (raw) {
              const cached = JSON.parse(raw)
              cached.preferences = {
                ...(cached.preferences ?? {}),
                sorts: { ...(cached.preferences?.sorts ?? {}), [section]: clean },
              }
              window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(cached))
            }
          } catch {
            // Cache merge is best-effort; the server record is authoritative.
          }
          await refreshUser()
        } catch {
          // Offline save failure keeps the optimistic UI; next load falls
          // back to the last saved value.
        }
      })()
    },
    [section, fallback.dir, refreshUser, validKeys]
  )

  return [sort, setSort]
}
