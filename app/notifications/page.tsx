"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AppShell } from "@/components/app-shell"
import { PageIntro } from "@/components/page-intro"
import { useAuth } from "@/lib/auth-context"
import { timeAgo } from "@/lib/use-group-research"
import { notificationHref, notifyNotificationsUpdated, type DbNotification } from "@/lib/notifications"
import { cn } from "@/lib/utils"
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCheck,
  ListChecks,
  Mail,
  UserCheck,
  UserMinus,
  UserPlus,
} from "lucide-react"

const KIND_ICON: Record<DbNotification["kind"], typeof Bell> = {
  added_to_group: UserPlus,
  removed_from_group: UserMinus,
  connection_accepted: UserCheck,
  connection_request: Mail,
  task_assigned: ListChecks,
  deadline_approaching: CalendarClock,
  deadline_passed: AlertTriangle,
}

export default function NotificationsPage() {
  const router = useRouter()
  const { currentUser } = useAuth()
  const [notifications, setNotifications] = useState<DbNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [markingAll, setMarkingAll] = useState(false)
  const [pendingByActor, setPendingByActor] = useState<Map<string, string>>(new Map())
  const [respondingId, setRespondingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [notifRes, connRes] = await Promise.all([
        fetch("/api/notifications", { cache: "no-store" }),
        fetch("/api/connections", { cache: "no-store" }),
      ])
      const data = await notifRes.json().catch(() => ({}))
      if (notifRes.ok && data.ok) setNotifications(data.notifications ?? [])
      const connData = await connRes.json().catch(() => ({}))
      if (connRes.ok && connData.ok) {
        // Incoming pending requests, keyed by requester, for inline respond.
        setPendingByActor(
          new Map(
            (connData.connections ?? [])
              .filter(
                (c: { status: string; requesterId: string; recipientId: string; id: string }) =>
                  c.status === "pending" && c.recipientId === currentUser?.id
              )
              .map((c: { requesterId: string; id: string }) => [c.requesterId, c.id] as [string, string])
          )
        )
      }
    } catch {
      // List simply stays as-is on failure.
    } finally {
      setLoading(false)
    }
  }, [currentUser?.id])

  useEffect(() => {
    load()
  }, [load])

  const unread = notifications.filter((n) => !n.readAt).length

  async function markAllRead() {
    if (markingAll || unread === 0) return
    setMarkingAll(true)
    try {
      const res = await fetch("/api/notifications/mark-all", { method: "POST" })
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() }))
        )
        notifyNotificationsUpdated()
      }
    } finally {
      setMarkingAll(false)
    }
  }

  async function respondToRequest(n: DbNotification, action: "accept" | "decline") {
    const connectionId = (n.actorId && pendingByActor.get(n.actorId)) || null
    if (!connectionId || respondingId) return
    setRespondingId(n.id)
    try {
      const res = await fetch(`/api/connections/${connectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      if (res.ok) {
        await load()
        notifyNotificationsUpdated()
      }
    } finally {
      setRespondingId(null)
    }
  }

  async function openNotification(n: DbNotification) {    const href = notificationHref(n)
    if (!n.readAt) {
      try {
        const res = await fetch(`/api/notifications/${n.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ read: true }),
        })
        if (res.ok) {
          setNotifications((prev) =>
            prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x))
          )
          notifyNotificationsUpdated()
        }
      } catch {
        // Navigation still proceeds; the badge refreshes on next load.
      }
    }
    if (href) router.push(href)
  }

  const contextLine = (n: DbNotification): string | null => {
    const parts: string[] = []
    if (n.actorName) parts.push(n.actorName)
    if (n.groupName) parts.push(n.groupName)
    if (n.taskTitle && n.taskTitle !== n.body) parts.push(n.taskTitle)
    return parts.length > 0 ? parts.join(" · ") : null
  }

  return (
    <AppShell>
      <PageIntro
        icon={Bell}
        eyebrow="Inbox"
        title="Notifications"
        description="Group invites, collaboration updates, task assignments, and deadlines."
        action={
          <button
            type="button"
            onClick={markAllRead}
            disabled={markingAll || unread === 0}
            className="flex items-center gap-2 rounded-xl border border-border bg-secondary/80 px-4 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCheck className="size-4" aria-hidden="true" />
            {markingAll ? "Marking…" : `Mark all as read${unread > 0 ? ` (${unread})` : ""}`}
          </button>
        }
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading notifications…</p>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 py-14 text-center">
          <Bell className="size-7 text-muted-foreground/40" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">You&apos;re all caught up</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Group invites, collaboration updates, assignments, and deadlines will appear here.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {notifications.map((n) => {
            const Icon = KIND_ICON[n.kind] ?? Bell
            const context = contextLine(n)
            const href = notificationHref(n)
            const requestConnId = n.kind === "connection_request" && n.actorId
              ? (pendingByActor.get(n.actorId) ?? null)
              : null
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => openNotification(n)}
                  disabled={!href}
                  title={href ? "Open" : undefined}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-all",
                    href && "hover:shadow-md hover:ring-1 hover:ring-brand/20",
                    !href && "cursor-default",
                    !n.readAt && "border-brand/30 bg-brand/[0.04]"
                  )}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-brand">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">{n.title}</span>
                      {!n.readAt && (
                        <span className="size-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />
                      )}
                    </span>
                    <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">
                      {n.body}
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.68rem] text-muted-foreground/80">
                      <span>{timeAgo(n.createdAt) ?? new Date(n.createdAt).toLocaleString()}</span>
                      {context && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{context}</span>
                        </>
                      )}
                    </span>
                    {requestConnId && (
                      <span className="mt-2 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => respondToRequest(n, "accept")}
                          disabled={respondingId === n.id}
                          className="rounded-lg bg-brand px-3 py-1 text-xs font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => respondToRequest(n, "decline")}
                          disabled={respondingId === n.id}
                          className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                        >
                          Decline
                        </button>
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        <Link href="/home" className="font-medium text-brand hover:underline">
          ← Back to Home
        </Link>
      </p>
    </AppShell>
  )
}
