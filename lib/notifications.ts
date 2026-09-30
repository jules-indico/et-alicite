"use client"

import type { DbNotification, NotificationKind } from "@/lib/server/auth-db"

/**
 * Client helpers for notifications. Read state refreshes go through a
 * window event (same pattern as avatar updates) so the nav badge updates
 * without a page reload.
 */

export type { DbNotification, NotificationKind }

const NOTIFICATIONS_EVENT = "et-alicite:notifications-updated"

export function notifyNotificationsUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(NOTIFICATIONS_EVENT))
  }
}

export function onNotificationsUpdated(cb: () => void): () => void {
  const handler = () => cb()
  window.addEventListener(NOTIFICATIONS_EVENT, handler)
  return () => window.removeEventListener(NOTIFICATIONS_EVENT, handler)
}

/** Where clicking a notification lands. Null = nowhere meaningful. */
export function notificationHref(n: Pick<DbNotification, "kind" | "taskId" | "actorId">): string | null {
  switch (n.kind) {
    case "task_assigned":
    case "deadline_approaching":
    case "deadline_passed":
      return n.taskId ? `/tasks/${n.taskId}` : null
    case "connection_accepted":
      return n.actorId ? `/users/${n.actorId}` : null
    case "connection_request":
      return n.actorId ? `/users/${n.actorId}` : "/team"
    case "added_to_group":
    case "removed_from_group":
      return "/home"
    default:
      return null
  }
}
