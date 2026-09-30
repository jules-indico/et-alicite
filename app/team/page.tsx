"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { PageIntro } from "@/components/page-intro"
import { Avatar } from "@/components/primitives"
import { useAuth } from "@/lib/auth-context"
import { fullNameOf } from "@/lib/names"
import { RemoveConnectionDialog } from "@/components/remove-connection-dialog"
import { RemoveMemberDialog } from "@/components/remove-member-dialog"
import { deleteConnectionRequest } from "@/lib/connections"
import type { PublicUser, EnrichedConnection } from "@/lib/server/auth-db"
import {
  useActiveGroupId,
  groupToMembers,
} from "@/lib/use-group-research"
import { Users, Search, X, UserPlus, UserMinus, Loader2, Check, UserCheck } from "lucide-react"

type Relation = "self" | "connected" | "pending_outgoing" | "pending_incoming" | "none"

function MemberCard({
  member,
  relation,
  canRemove,
  removing,
  onRemove,
  connecting,
  onConnect,
  onAccept,
  onRemoveConnection,
}: {
  member: { id: string; name: string; initials: string; color: string; username?: string; avatarUrl?: string }
  relation: Relation
  canRemove: boolean
  removing: boolean
  onRemove: () => void
  connecting: boolean
  onConnect: () => void
  onAccept: () => void
  onRemoveConnection?: () => void
}) {
  const router = useRouter()
  function openProfile(e: React.MouseEvent) {
    // Inner buttons/links keep their own actions; text selection never navigates.
    if ((e.target as HTMLElement).closest("button, a")) return
    if (typeof window !== "undefined" && window.getSelection()?.toString()) return
    router.push(`/users/${member.id}`)
  }
  return (
    <article
      onClick={openProfile}
      title={`View ${member.name}'s profile`}
      className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm cursor-pointer transition-all hover:shadow-md hover:ring-1 hover:ring-brand/20"
    >      <Link
        href={`/users/${member.id}`}
        title={`View ${member.name}'s profile`}
        aria-label={`View ${member.name}'s profile`}
        className="shrink-0 rounded-full transition-all hover:ring-2 hover:ring-brand/40"
      >
        <Avatar member={member} className="size-11 text-sm" />
      </Link>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold text-foreground">
          <Link href={`/users/${member.id}`} className="hover:text-brand hover:underline">
            {member.name}
          </Link>
          {relation === "self" && <span className="text-brand font-semibold"> (you)</span>}
        </h3>
        {member.username && (
          <p className="truncate text-xs text-muted-foreground">@{member.username}</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {relation === "self" ? (
            <span className="inline-flex rounded-full bg-secondary px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
              This account
            </span>
          ) : relation === "connected" ? (
            <>
              <span className="inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-[0.65rem] font-medium text-emerald-600 dark:text-emerald-400">
                Connected
              </span>
              {onRemoveConnection && (
                <button
                  type="button"
                  onClick={onRemoveConnection}
                  title={`Remove connection with ${member.name}`}
                  aria-label={`Remove connection with ${member.name}`}
                  className="inline-flex rounded-full px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground transition-colors hover:text-destructive hover:bg-destructive/10"
                >
                  Remove connection
                </button>
              )}
            </>
          ) : relation === "pending_outgoing" ? (
            <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
              Request sent
            </span>
          ) : relation === "pending_incoming" ? (
            <button
              type="button"
              onClick={onAccept}
              disabled={connecting}
              className="inline-flex rounded-full bg-brand/10 px-2 py-0.5 text-[0.65rem] font-semibold text-brand transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {connecting ? "Working…" : "Accept request"}
            </button>
          ) : (
            <>
              <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
                Not connected
              </span>
              <button
                type="button"
                onClick={onConnect}
                disabled={connecting}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/80 px-2 py-0.5 text-[0.65rem] font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
              >
                {connecting ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <UserPlus className="size-3" />
                )}
                Connect
              </button>
            </>
          )}
        </div>
      </div>
      {canRemove && relation !== "self" && (
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          title={`Remove ${member.name} from the group`}
          aria-label={`Remove ${member.name} from the group`}
          className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive hover:bg-destructive/10 disabled:opacity-50"
        >
          {removing ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <UserMinus className="size-3.5" />
          )}
          <span className="hidden sm:inline">Remove</span>
        </button>
      )}
    </article>
  )
}

export default function TeamPage() {
  const { authState, currentUser } = useAuth()
  const router = useRouter()
  // Same group data source as the switcher, sidebar, assignee dropdown,
  // and tasks board — refreshed after every membership change.
  const { activeGroupId, activeGroup, loading: loadingGroup, refresh } = useActiveGroupId()
  const people = useMemo(() => groupToMembers(activeGroup), [activeGroup])
  // The viewer's own account always renders left-most; everyone else keeps
  // their existing order (stable sort).
  const orderedPeople = useMemo(() => {
    const selfId = currentUser?.id
    if (!selfId) return people
    return [...people].sort((a, b) =>
      a.id === selfId ? -1 : b.id === selfId ? 1 : 0
    )
  }, [people, currentUser?.id])
  const leaderId = activeGroup ? activeGroup.leader || activeGroup.ownerId : null
  const isLeader = !!currentUser?.id && !!leaderId && currentUser.id === leaderId

  // Leader's collaborators for search + connection badges.
  const [collaborators, setCollaborators] = useState<PublicUser[]>([])
  const [connections, setConnections] = useState<EnrichedConnection[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [mutating, setMutating] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [connectionToRemove, setConnectionToRemove] = useState<{ id: string; name: string } | null>(null)
  const [removeConnLoading, setRemoveConnLoading] = useState(false)
  const [removeConnError, setRemoveConnError] = useState<string | null>(null)
  const [memberToRemove, setMemberToRemove] = useState<{ id: string; name: string } | null>(null)
  const [removeMemberError, setRemoveMemberError] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  // Pending invite-link join requests (leader-only: never fetched otherwise).
  const [joinRequests, setJoinRequests] = useState<{ id: string; createdAt: string; user: PublicUser }[]>([])
  const [joinLoading, setJoinLoading] = useState(false)
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  async function reloadJoinRequests() {
    if (!isLeader || !activeGroupId) {
      setJoinRequests([])
      return
    }
    setJoinLoading(true)
    try {
      const res = await fetch(`/api/groups/${activeGroupId}/join-requests`, { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) {
        setJoinRequests(data.requests || [])
      }
    } catch {
      // Section simply stays empty; member list still renders.
    } finally {
      setJoinLoading(false)
    }
  }

  async function handleJoinRequest(requestId: string, action: "accept" | "decline", requesterName: string) {
    if (!activeGroupId || resolvingId) return
    setResolvingId(requestId)
    setMessage(null)
    try {
      const res = await fetch(`/api/groups/${activeGroupId}/join-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setMessage({ type: "error", text: data.error || "Failed to resolve the request." })
        return
      }
      await refresh()
      await reloadJoinRequests()
      setMessage({
        type: "success",
        text:
          action === "accept"
            ? `${requesterName} joined ${activeGroup?.name ?? "the group"}.`
            : `Declined ${requesterName}'s request.`,
      })
    } catch {
      setMessage({ type: "error", text: "Network error occurred. Please try again." })
    } finally {
      setResolvingId(null)
    }
  }

  useEffect(() => {
    if (authState.status === "unauthenticated") {
      router.replace("/login")
    }
  }, [authState.status, router])

  useEffect(() => {
    let cancelled = false
    async function loadCollaborators() {
      // Same source the Edit-group panel's Add-member picker uses, plus the
      // full connection list so pending states resolve like Find collaborators.
      if (cancelled) return
      const ok = await reloadConnections()
      // Surface load failures instead of silently showing everyone as
      // "Not connected" with dead actions.
      if (!ok && !cancelled) {
        setMessage({
          type: "error",
          text: "Couldn't load connection statuses. Check your connection, then reload the page.",
        })
      }
    }
    if (authState.status === "authenticated") loadCollaborators()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState.status])

  // Leader-only join-request list, reloaded with the active group.
  useEffect(() => {
    if (authState.status !== "authenticated") return
    void reloadJoinRequests()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState.status, isLeader, activeGroupId])

  async function reloadConnections(signal?: AbortSignal) {
    try {
      const res = await fetch("/api/connections", { cache: "no-store", signal })
      if (!res.ok) return false
      const data = await res.json()
      if (data.ok) {
        setCollaborators(data.acceptedUsers || [])
        setConnections(data.connections || [])
        return true
      }
      return false
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err
      // Search simply stays empty; member list still renders.
      return false
    }
  }

  // Relationship state mirroring Find collaborators: connected, outgoing
  // pending, incoming pending, or none.
  function getRelation(userId: string): Relation {
    if (userId === currentUser?.id) return "self"
    if (collaborators.some((u) => u.id === userId)) return "connected"
    const pendingConn = connections.find(
      (c) =>
        c.status === "pending" &&
        (c.requesterId === userId || c.recipientId === userId)
    )
    if (pendingConn) {
      return pendingConn.requesterId === currentUser?.id ? "pending_outgoing" : "pending_incoming"
    }
    return "none"
  }

  // Send connection request — exact same call as Find collaborators, with a
  // timeout so a stalled request can never leave the button spinning forever.
  async function handleConnect(recipientId: string) {
    setConnectingId(recipientId)
    setMessage(null)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 15000)
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId }),
        signal: ctrl.signal,
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) {
        setMessage({ type: "success", text: "Connection request sent!" })
        await reloadConnections(ctrl.signal)
      } else {
        setMessage({ type: "error", text: data.error || "Failed to send request." })
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        console.error("Connection request timed out for recipient:", recipientId)
        setMessage({ type: "error", text: "Request timed out. Please check your connection and try again." })
      } else {
        setMessage({ type: "error", text: "Network error occurred." })
      }
    } finally {
      clearTimeout(timer)
      setConnectingId(null)
    }
  }

  // Accept an incoming request — same call as Find collaborators' respond.
  async function handleAccept(connectionId: string) {
    setConnectingId(connectionId)
    setMessage(null)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 15000)
    try {
      const res = await fetch(`/api/connections/${connectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
        signal: ctrl.signal,
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) {
        setMessage({ type: "success", text: "Connection accepted!" })
        await reloadConnections(ctrl.signal)
      } else {
        setMessage({ type: "error", text: data.error || "Failed to respond." })
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        console.error("Accept connection timed out for:", connectionId)
        setMessage({ type: "error", text: "Request timed out. Please check your connection and try again." })
      } else {
        setMessage({ type: "error", text: "Network error occurred." })
      }
    } finally {
      clearTimeout(timer)
      setConnectingId(null)
    }
  }

  function pendingConnectionId(userId: string): string | null {
    return (
      connections.find(
        (c) =>
          c.status === "pending" &&
          (c.requesterId === userId || c.recipientId === userId)
      )?.id ?? null
    )
  }

  function acceptedConnectionId(userId: string): string | null {
    return (
      connections.find(
        (c) =>
          c.status === "accepted" &&
          (c.requesterId === userId || c.recipientId === userId)
      )?.id ?? null
    )
  }

  async function handleConfirmRemoveConnection() {
    if (!connectionToRemove) return
    setRemoveConnLoading(true)
    setRemoveConnError(null)
    // Same shared request as Find collaborators: connection row only.
    const result = await deleteConnectionRequest(connectionToRemove.id)
    setRemoveConnLoading(false)
    if (!result.ok) {
      setRemoveConnError(result.error)
      return
    }
    setConnectionToRemove(null)
    setRemoveConnError(null)
    setMessage({ type: "success", text: "Connection removed." })
    await reloadConnections()
  }

  if (authState.status !== "authenticated") return null

  const memberIds = new Set(people.map((m) => m.id))
  const q = searchQuery.trim().toLowerCase()
  // Leader-only search across own collaborators NOT already in the group.
  // Matches first name, last name, combined name, and username.
  const searchResults =
    q.length === 0
      ? []
      : collaborators.filter(
          (c) =>
            !memberIds.has(c.id) &&
            (fullNameOf(c).toLowerCase().includes(q) ||
              (c.firstName || "").toLowerCase().includes(q) ||
              (c.lastName || "").toLowerCase().includes(q) ||
              (c.username || "").toLowerCase().includes(q))
        )

  async function mutateMembers(
    body: { addMemberIds?: string[]; removeMemberIds?: string[] },
    successText: string
  ): Promise<boolean> {
    if (!activeGroupId) return false
    setMutating(true)
    setMessage(null)
    try {
      // Exact same endpoint + logic as the Edit research group panel.
      const res = await fetch(`/api/groups/${activeGroupId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setMessage({ type: "error", text: data.error || "Failed to update group members." })
        return false
      }
      await refresh()
      setMessage({ type: "success", text: successText })
      return true
    } catch {
      setMessage({ type: "error", text: "Network error occurred. Please try again." })
      return false
    } finally {
      setMutating(false)
    }
  }

  async function handleAdd(user: PublicUser) {
    const ok = await mutateMembers(
      { addMemberIds: [user.id] },
      `${(user && fullNameOf(user)) || "Member"} added to ${activeGroup?.name ?? "the group"}.`
    )
    if (ok) setSearchQuery("")
  }

  async function handleConfirmRemoveMember() {
    if (!memberToRemove || memberToRemove.id === currentUser?.id) return
    setRemovingId(memberToRemove.id)
    try {
      const ok = await mutateMembers(
        { removeMemberIds: [memberToRemove.id] },
        `${memberToRemove.name} removed from ${activeGroup?.name ?? "the group"}. Their past work stays in group history.`
      )
      if (ok) {
        setMemberToRemove(null)
        setRemoveMemberError(null)
      } else {
        setRemoveMemberError("Failed to remove member. Please try again.")
      }
    } finally {
      setRemovingId(null)
    }
  }

  // Display names for user IDs (usernames only exist on enriched records).
  const usernameById = new Map<string, string>()
  for (const m of activeGroup?.members ?? []) {
    if (m.user?.username) usernameById.set(m.userId, m.user.username)
  }
  for (const c of collaborators) {
    if (!usernameById.has(c.id) && c.username) usernameById.set(c.id, c.username)
  }

  return (
    <AppShell>
      <PageIntro
        icon={Users}
        eyebrow={activeGroup?.name ?? "Research group"}
        title="Team"
        description="View and manage who belongs to your active research group."
      />

      {message && (
        <div
          role="status"
          className={
            message.type === "success"
              ? "rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-3 text-xs font-medium text-emerald-600 dark:text-emerald-400"
              : "rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-xs font-medium text-destructive"
          }
        >
          {message.text}
        </div>
      )}

      {loadingGroup ? (
        <p className="text-sm text-muted-foreground">Loading team…</p>
      ) : !activeGroup ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 py-14 text-center">
          <Users className="size-8 text-muted-foreground/40" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">No active research group</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Join or create a research group to view and manage its members here.
          </p>
        </div>
      ) : (
        <>
          {/* Leader-only collaborator search — hidden entirely otherwise */}
          {isLeader && (
            <section aria-labelledby="team-search-heading">
              <h2 id="team-search-heading" className="mb-2 text-sm font-semibold text-foreground">
                Add members from your collaborators
              </h2>
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Type a username or name"
                  aria-label="Search collaborators to add"
                  className="w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>

              {q.length > 0 && (
                <div className="mt-2 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                  {searchResults.length === 0 ? (
                    <p className="px-4 py-5 text-center text-xs text-muted-foreground">
                      No collaborators match — or everyone matching is already in this group.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border/60">
                      {searchResults.map((c) => {
                        const cName = fullNameOf(c) || "Member"
                        return (
                        <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                          <Link
                            href={`/users/${c.id}`}
                            title={`View ${cName}'s profile`}
                            aria-label={`View ${cName}'s profile`}
                            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg"
                          >
                            <Avatar
                              member={{
                                id: c.id,
                                name: cName,
                                initials: c.initials || "?",
                                color: c.color || "bg-muted",
                              }}
                              className="size-8 shrink-0 text-xs"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-foreground hover:text-brand hover:underline">
                                {cName}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">@{c.username}</p>
                            </div>
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleAdd(c)}
                            disabled={mutating}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-secondary/80 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
                          >
                            {mutating ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <UserPlus className="size-3.5" />
                            )}
                            Add
                          </button>
                        </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Leader-only invite-link join requests — hidden entirely otherwise */}
          {isLeader && (joinLoading || joinRequests.length > 0) && (
            <section aria-labelledby="join-requests-heading">
              <h2 id="join-requests-heading" className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <UserCheck className="size-4 text-muted-foreground" aria-hidden="true" />
                Join requests
                {joinRequests.length > 0 && (
                  <span className="flex size-5 items-center justify-center rounded-full bg-brand/15 text-[0.7rem] font-semibold text-brand">
                    {joinRequests.length}
                  </span>
                )}
              </h2>
              {joinLoading ? (
                <p className="text-xs text-muted-foreground">Loading requests…</p>
              ) : (
                <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {joinRequests.map((req) => {
                    const reqName = fullNameOf(req.user) || "Member"
                    const busy = resolvingId === req.id
                    return (
                      <li
                        key={req.id}
                        className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm"
                      >
                        <Avatar
                          member={{
                            id: req.user.id,
                            name: reqName,
                            initials: req.user.initials || "?",
                            color: req.user.color || "bg-muted",
                            avatarUrl: req.user.avatarUrl,
                          }}
                          className="size-10 shrink-0 text-sm"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{reqName}</p>
                          <p className="truncate text-xs text-muted-foreground">@{req.user.username}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleJoinRequest(req.id, "accept", reqName)}
                            disabled={resolvingId !== null}
                            title={`Accept ${reqName}`}
                            aria-label={`Accept ${reqName}`}
                            className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-r from-brand to-lavender text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                          >
                            {busy ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Check className="size-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleJoinRequest(req.id, "decline", reqName)}
                            disabled={resolvingId !== null}
                            title={`Decline ${reqName}`}
                            aria-label={`Decline ${reqName}`}
                            className="flex size-8 items-center justify-center rounded-lg border border-border bg-secondary/80 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                          >
                            <X className="size-4" />
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {orderedPeople.map((member) => {
              const relation = getRelation(member.id)
              const pendingId = relation === "pending_incoming" ? pendingConnectionId(member.id) : null
              // Guard against null: connectingId starts as null, and
              // `null === null` would wrongly disable every button.
              const busyId = relation === "pending_incoming" ? pendingId : member.id
              return (
                <MemberCard
                  key={member.id}
                  member={{
                    ...member,
                    username: usernameById.get(member.id),
                  }}
                  relation={relation}
                  canRemove={isLeader}
                  removing={removingId === member.id}
                  onRemove={() => {
                    setRemoveMemberError(null)
                    setMemberToRemove({ id: member.id, name: member.name })
                  }}
                  connecting={connectingId !== null && connectingId === busyId}
                  onConnect={() => handleConnect(member.id)}
                  onAccept={() => pendingId && handleAccept(pendingId)}
                  onRemoveConnection={() => {
                    const cid = acceptedConnectionId(member.id)
                    if (cid) setConnectionToRemove({ id: cid, name: member.name })
                  }}
                />
              )
            })}
          </div>
        </>
      )}

      {/* Remove Connection Confirmation Modal (shared with Find collaborators) */}
      <RemoveConnectionDialog
        open={Boolean(connectionToRemove)}
        memberName={connectionToRemove?.name ?? null}
        loading={removeConnLoading}
        error={removeConnError}
        onClose={() => {
          if (!removeConnLoading) {
            setConnectionToRemove(null)
            setRemoveConnError(null)
          }
        }}
        onConfirm={handleConfirmRemoveConnection}
      />

      {/* Remove Member Confirmation Modal (shared with Edit-group panel) */}
      <RemoveMemberDialog
        open={Boolean(memberToRemove)}
        memberName={memberToRemove?.name ?? null}
        groupName={activeGroup?.name ?? null}
        loading={removingId !== null}
        error={removeMemberError}
        onClose={() => {
          if (removingId === null) {
            setMemberToRemove(null)
            setRemoveMemberError(null)
          }
        }}
        onConfirm={handleConfirmRemoveMember}
      />
    </AppShell>
  )
}
