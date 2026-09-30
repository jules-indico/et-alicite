"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type {
  Activity,
  Chapter,
  ChapterStatus,
  Member,
  Source,
  Task,
  TaskStatus,
} from "@/lib/research-data"
import { members as seedMembers, normalizeTaskStatus } from "@/lib/research-data"
import type { DbFolder } from "@/lib/server/auth-db"
import { onAvatarUpdated } from "@/lib/avatar"

/**
 * use-group-research.ts
 * Single shared data-access pattern for all group-scoped research features.
 *
 * The server is the source of truth: every list is fetched with the active
 * `groupId`, and every mutation sends the same `groupId`. All members of a
 * group therefore see identical chapters, tasks, sources, and activity.
 * `createdBy` exists on server records for attribution only and is never
 * used to filter what a member can see.
 */

export type ActorInfo = {
  name: string
  initials: string
}

async function getJson(url: string) {
  const res = await fetch(url, { cache: "no-store" })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Request failed (${res.status}).`)
  }
  return data
}

async function sendJson(url: string, method: string, body: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Request failed (${res.status}).`)
  }
  return data
}

function toChapter(raw: any): Chapter {
  return {
    id: raw.id,
    label: raw.label ?? "Chapter",
    title: raw.title,
    description: raw.description,
    status: (raw.status ?? "Not started") as ChapterStatus,
    progress: raw.progress ?? 0,
    sectionsComplete: raw.sectionsComplete ?? 0,
    sectionsTotal: raw.sectionsTotal ?? 0,
    sources: raw.sources ?? 0,
    assigned: Array.isArray(raw.assigned) ? raw.assigned : [],
    updated: raw.updated ?? "Just now",
    iconName: raw.iconName,
    colorTag: raw.colorTag,
    files: Array.isArray(raw.files) ? raw.files : undefined,
    attachmentUrl: raw.attachmentUrl,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  }
}

function toTask(raw: any): Task {
  return {
    id: raw.id,
    title: raw.title,
    chapter: raw.chapter ?? "General",
    chapterId: raw.chapterId,
    status: normalizeTaskStatus(raw.status),
    assignee: raw.assignee ?? "",
    dueDate: raw.dueDate,
    description: raw.description,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  }
}

function toSource(raw: any): Source {
  return {
    id: raw.id,
    title: raw.title,
    author: raw.author ?? "Unknown",
    year: Number(raw.year) || new Date().getFullYear(),
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    usedIn: Array.isArray(raw.usedIn) ? raw.usedIn : [],
    cited: Boolean(raw.cited),
    url: raw.url,
    chapterIds: Array.isArray(raw.chapterIds) ? raw.chapterIds : [],
    files: Array.isArray(raw.files) ? raw.files : undefined,
    attachmentUrl: raw.attachmentUrl,
    sourceType: raw.sourceType,
    apaCitation: raw.apaCitation,
    apaInputs: raw.apaInputs,
    summary: raw.summary,
    summaryInputs: raw.summaryInputs,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  }
}

function toActivity(raw: any): Activity {
  return {
    id: raw.id,
    memberId: raw.memberId ?? raw.createdBy ?? "unknown",
    memberName: raw.memberName,
    memberInitials: raw.memberInitials,
    action: raw.action,
    target: raw.target ?? "",
    time: raw.time ?? "just now",
    createdAt: raw.createdAt,
  }
}

const ACTIVITY_DEFAULT_LIMIT = 15

/**
 * Display cap shared by every Recent-activity strip (Home + Research page):
 * the latest entries shown inline, with "View all" leading to the full
 * history. Single source so both pages always match.
 */
export const RECENT_ACTIVITY_LIMIT = 12

export function useGroupResearch(
  groupId: string | null,
  options?: { activityLimit?: number }
) {
  const activityLimit = options?.activityLimit ?? ACTIVITY_DEFAULT_LIMIT
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [folders, setFolders] = useState<DbFolder[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [totalActivities, setTotalActivities] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef(0)

  const load = useCallback(async (gid: string) => {
    const requestId = ++requestRef.current
    setLoading(true)
    setError(null)
    try {
      const qs = `groupId=${encodeURIComponent(gid)}`
      const [cData, tData, sData, fData, aData] = await Promise.all([
        getJson(`/api/chapters?${qs}`),
        getJson(`/api/tasks?${qs}`),
        getJson(`/api/sources?${qs}`),
        getJson(`/api/folders?${qs}`),
        getJson(`/api/activities?${qs}&limit=${activityLimit}`),
      ])
      if (requestRef.current !== requestId) return
      setChapters((cData.chapters || []).map(toChapter))
      setTasks((tData.tasks || []).map(toTask))
      setSources((sData.sources || []).map(toSource))
      setFolders(fData.folders || [])
      setActivities((aData.activities || []).map(toActivity))
      setTotalActivities(typeof aData.total === "number" ? aData.total : (aData.activities || []).length)
    } catch (err) {
      if (requestRef.current !== requestId) return
      setError(err instanceof Error ? err.message : "Failed to load workspace data.")
    } finally {
      if (requestRef.current === requestId) setLoading(false)
    }
  }, [activityLimit])

  useEffect(() => {
    if (!groupId) {
      requestRef.current++
      setChapters([])
      setTasks([])
      setSources([])
      setFolders([])
      setActivities([])
      setTotalActivities(0)
      setLoading(false)
      setError(null)
      return
    }
    load(groupId)
  }, [groupId, load])

  const logActivity = useCallback(
    async (action: string, target: string, actor?: ActorInfo) => {
      if (!groupId) return
      try {
        const data = await sendJson("/api/activities", "POST", {
          groupId,
          action,
          target,
          memberName: actor?.name,
          memberInitials: actor?.initials,
        })
        if (data.activity) {
          setActivities((prev) => [toActivity(data.activity), ...prev].slice(0, 50))
        }
      } catch (err) {
        console.error("Failed to log activity:", err)
      }
    },
    [groupId]
  )

  const createChapter = useCallback(
    async (input: Omit<Chapter, "id">, actor?: ActorInfo) => {
      if (!groupId) throw new Error("No active group selected.")
      const data = await sendJson("/api/chapters", "POST", { ...input, groupId })
      const chapter = toChapter(data.chapter)
      setChapters((prev) => [...prev, chapter])
      await logActivity("created chapter", chapter.title, actor)
      return chapter
    },
    [groupId, logActivity]
  )

  const deleteChapter = useCallback(
    async (id: string) => {
      if (!groupId) return
      await sendJson(`/api/chapters/${id}?groupId=${encodeURIComponent(groupId)}`, "DELETE", {})
      setChapters((prev) => prev.filter((c) => c.id !== id))
    },
    [groupId]
  )

  const updateChapter = useCallback(
    async (id: string, patch: Partial<Omit<Chapter, "id">>) => {
      if (!groupId) return
      const data = await sendJson(
        `/api/chapters/${id}?groupId=${encodeURIComponent(groupId)}`,
        "PATCH",
        { ...patch, groupId }
      )
      const updated = toChapter(data.chapter)
      setChapters((prev) => prev.map((c) => (c.id === id ? updated : c)))
      return updated
    },
    [groupId]
  )

  const createTask = useCallback(
    async (input: Omit<Task, "id">, actor?: ActorInfo) => {
      if (!groupId) throw new Error("No active group selected.")
      const data = await sendJson("/api/tasks", "POST", { ...input, groupId })
      const task = toTask(data.task)
      setTasks((prev) => [...prev, task])
      await logActivity("created task", task.title, actor)
      return task
    },
    [groupId, logActivity]
  )

  const updateTask = useCallback(
    async (id: string, patch: Partial<Omit<Task, "id">>) => {
      if (!groupId) return
      const data = await sendJson(
        `/api/tasks/${id}?groupId=${encodeURIComponent(groupId)}`,
        "PATCH",
        { ...patch, groupId }
      )
      const updated = toTask(data.task)
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)))
      return updated
    },
    [groupId]
  )

  const deleteTask = useCallback(
    async (id: string) => {
      if (!groupId) return
      await sendJson(`/api/tasks/${id}?groupId=${encodeURIComponent(groupId)}`, "DELETE", {})
      setTasks((prev) => prev.filter((t) => t.id !== id))
    },
    [groupId]
  )

  const createSource = useCallback(
    async (input: Omit<Source, "id">, actor?: ActorInfo) => {
      if (!groupId) throw new Error("No active group selected.")
      const data = await sendJson("/api/sources", "POST", { ...input, groupId })
      const source = toSource(data.source)
      setSources((prev) => [...prev, source])
      await logActivity("added source", source.title, actor)
      return source
    },
    [groupId, logActivity]
  )

  const updateSource = useCallback(
    async (id: string, patch: Partial<Omit<Source, "id">>) => {
      if (!groupId) return
      const data = await sendJson(
        `/api/sources/${id}?groupId=${encodeURIComponent(groupId)}`,
        "PATCH",
        { ...patch, groupId }
      )
      const updated = toSource(data.source)
      setSources((prev) => prev.map((s) => (s.id === id ? updated : s)))
      return updated
    },
    [groupId]
  )

  const deleteSource = useCallback(
    async (id: string) => {
      if (!groupId) return
      await sendJson(`/api/sources/${id}?groupId=${encodeURIComponent(groupId)}`, "DELETE", {})
      setSources((prev) => prev.filter((s) => s.id !== id))
    },
    [groupId]
  )

  // Research folders. Activity entries ("created/renamed/deleted folder",
  // "uploaded/deleted file") are written server-side by the folder/file
  // endpoints, so — unlike chapters/tasks/sources — the client never logs
  // them here (logging twice would duplicate every entry).
  const createFolder = useCallback(
    async (input: { name: string; access?: "everyone" | "mine" | "selected"; allowedIds?: string[] }) => {
      if (!groupId) throw new Error("No active group selected.")
      const data = await sendJson("/api/folders", "POST", { ...input, groupId })
      const folder = data.folder as DbFolder
      setFolders((prev) => [...prev, folder])
      return folder
    },
    [groupId]
  )

  const renameFolder = useCallback(
    async (id: string, patch: { name: string; access?: "everyone" | "mine" | "selected"; allowedIds?: string[] }) => {
      if (!groupId) return
      const data = await sendJson(
        `/api/folders/${id}?groupId=${encodeURIComponent(groupId)}`,
        "PATCH",
        { ...patch, groupId }
      )
      const updated = data.folder as DbFolder
      setFolders((prev) => prev.map((f) => (f.id === id ? updated : f)))
      return updated
    },
    [groupId]
  )

  const deleteFolder = useCallback(
    async (id: string) => {
      if (!groupId) return
      await sendJson(`/api/folders/${id}?groupId=${encodeURIComponent(groupId)}`, "DELETE", {})
      setFolders((prev) => prev.filter((f) => f.id !== id))
    },
    [groupId]
  )

  return {
    chapters,
    tasks,
    sources,
    folders,
    activities,
    totalActivities,
    loading,
    error,
    reload: groupId ? () => load(groupId) : () => {},
    logActivity,
    createChapter,
    updateChapter,
    deleteChapter,
    createTask,
    updateTask,
    deleteTask,
    createSource,
    updateSource,
    deleteSource,
    createFolder,
    renameFolder,
    deleteFolder,
  }
}

/**
 * Computes the pooled progress across tasks and sources for a research
 * group. Chapters contribute ONLY through their attributed tasks — there is
 * no separate chapter completion count (chapter status was removed as a
 * progress factor to avoid double-counting).
 *
 * Formula:
 *   progress = (completed_tasks + cited_sources)
 *              / (total_tasks + total_sources) × 100
 *
 * Returns 0 when the denominator is 0 (brand-new group with no trackable work).
 */
export function calcGroupProgress(tasks: Task[], sources: Source[]): number {
  const completedTasks = tasks.filter((t) => t.status === "Completed").length
  const totalTasks = tasks.length

  const citedSources = sources.filter((s) => s.cited).length
  const totalSources = sources.length

  const denominator = totalTasks + totalSources
  if (denominator === 0) return 0

  const numerator = completedTasks + citedSources
  return Math.round((numerator / denominator) * 100)
}

/**
 * Task-derived chapter progress: completed vs total tasks attributed to the
 * chapter by chapterId. Returns percent: null when the chapter has zero
 * attributed tasks ("No tasks yet" — not 0% done, just nothing to measure).
 */
export function chapterTaskProgress(
  chapterId: string,
  tasks: Task[]
): { total: number; completed: number; percent: number | null } {
  const related = tasks.filter((t) => t.chapterId === chapterId)
  if (related.length === 0) return { total: 0, completed: 0, percent: null }
  const completed = related.filter((t) => t.status === "Completed").length
  return {
    total: related.length,
    completed,
    percent: Math.round((completed / related.length) * 100),
  }
}

/** Map an enriched active group (API shape) to workspace Member[] for avatars. */
export function groupToMembers(activeGroup: any): Member[] {
  if (!activeGroup?.members || activeGroup.members.length === 0) return []
  return activeGroup.members.map((m: any) => ({
    id: m.userId as string,
    name: m.user?.displayName || m.user?.name || "Member",
    initials: m.user?.initials || "M",
    color: m.user?.color || "bg-brand",
    avatarUrl: m.user?.avatarUrl || undefined,
    firstName: m.user?.firstName || undefined,
    lastName: m.user?.lastName || undefined,
  }))
}

/** Resolve a member id (assignee / activity actor) against group members. */
export function resolveMember(
  membersList: Member[],
  id: string,
  fallbackName?: string,
  fallbackInitials?: string
): Member {
  const found = membersList.find((m) => m.id === id)
  if (found) return found
  const name = fallbackName || "Member"
  return {
    id,
    name,
    initials: fallbackInitials || name.slice(0, 2).toUpperCase(),
    color: "bg-muted",
  }
}

/**
 * Resolve an assignee/actor id for DISPLAY in live (server-backed) views.
 *
 * Lookup order: current group roster → static seed directory (legacy ids) →
 * neutral placeholder. Unlike `memberById` (which falls back to the first
 * seed member, "Marian Bergado"), this NEVER attributes work to a real,
 * unrelated person when the id is unknown.
 */
export function displayMember(membersList: Member[], id: string): Member {
  const direct = membersList.find((m) => m.id === id)
  if (direct) return direct
  const seed = seedMembers.find((m) => m.id === id)
  if (seed) return seed
  return {
    id,
    name: "Unknown member",
    initials: "?",
    color: "bg-muted",
  }
}

/**
 * Whether a user leads a group (group.leader, falling back to ownerId —
 * same rule as group deletion and the task-management server check).
 */
export function isGroupLeader(
  activeGroup: { leader?: string; ownerId?: string } | null | undefined,
  userId?: string | null
): boolean {
  if (!activeGroup || !userId) return false
  const leaderId = activeGroup.leader || activeGroup.ownerId
  return !!leaderId && leaderId === userId
}

/**
 * Resolve an activity actor for DISPLAY, preferring the name snapshot stored
 * at log time (survives roster changes), then the live roster, then neutral.
 */
export function displayActivityActor(
  membersList: Member[],
  activity: { memberId: string; memberName?: string; memberInitials?: string }
): Member {
  const resolved = displayMember(membersList, activity.memberId)
  const roster = membersList.find((m) => m.id === activity.memberId)
  return {
    id: activity.memberId,
    name: activity.memberName ?? resolved.name,
    initials: activity.memberInitials ?? resolved.initials,
    color: roster?.color ?? resolved.color,
    avatarUrl: roster?.avatarUrl ?? resolved.avatarUrl,
  }
}

/**
 * Human-readable relative time ("just now", "5 minutes ago", "2 hours ago",
 * "Yesterday", "3 days ago", or a locale date for older stamps).
 * Returns null when there is nothing to base it on.
 */
export function timeAgo(iso?: string | null): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  const seconds = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days} days ago`
  return new Date(t).toLocaleDateString()
}

/**
 * Most recent activity across a group's feed and record edits (chapters,
 * tasks, sources by updatedAt/createdAt). Null when the group has no
 * trackable work yet.
 */
export function latestGroupUpdate(
  chapters: Pick<Chapter, "createdAt" | "updatedAt">[],
  tasks: Pick<Task, "createdAt" | "updatedAt">[],
  sources: Pick<Source, "createdAt" | "updatedAt">[],
  activities: Pick<Activity, "createdAt">[]
): string | null {
  const stamps: number[] = []
  const push = (iso?: string) => {
    if (!iso) return
    const t = Date.parse(iso)
    if (!Number.isNaN(t)) stamps.push(t)
  }
  for (const a of activities) push(a.createdAt)
  for (const c of chapters) push(c.updatedAt ?? c.createdAt)
  for (const t of tasks) push(t.updatedAt ?? t.createdAt)
  for (const s of sources) push(s.updatedAt ?? s.createdAt)
  if (stamps.length === 0) return null
  return new Date(Math.max(...stamps)).toISOString()
}

/**
 * Ticking clock for relative timestamps: re-renders the caller on an
 * interval so "5m ago" style labels stay correct while the page sits open.
 */
export function useNow(intervalMs = 30000): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

/**
 * Load the current user's active research group id. Pages that display
 * group-scoped data combine this with useGroupResearch(activeGroupId).
 */
export function useActiveGroupId() {
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [activeGroup, setActiveGroup] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/groups/active", { cache: "no-store" })
      if (res.ok) {
        const data = await res.json()
        if (data.ok && data.activeGroup) {
          setActiveGroup(data.activeGroup)
          setActiveGroupId(data.activeGroup.id)
          return
        }
      }
      setActiveGroup(null)
      setActiveGroupId(null)
    } catch {
      setActiveGroup(null)
      setActiveGroupId(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    // Avatar changes resolve live through enrichGroup — refresh the group so
    // every member avatar on this page updates without a reload.
    return onAvatarUpdated(load)
  }, [load])

  return { activeGroupId, activeGroup, loading, refresh: load }
}
