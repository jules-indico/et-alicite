"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  Search,
  UserPlus,
  Users,
  Check,
  Clock,
  X,
  UserCheck,
  FolderPlus,
  Loader2,
  AlertCircle,
  Sparkles,
  ChevronRight,
  Shield,
  Trash2,
  Pencil,
} from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { Avatar } from "@/components/primitives"
import { CreateGroupModal } from "@/components/create-group-modal"
import { DeleteGroupModal } from "@/components/delete-group-modal"
import { RemoveConnectionDialog } from "@/components/remove-connection-dialog"
import { deleteConnectionRequest } from "@/lib/connections"
import { fullNameOf } from "@/lib/names"
import { onAvatarUpdated } from "@/lib/avatar"
import { EditGroupModal } from "@/components/edit-group-modal"
import type { PublicUser, EnrichedConnection } from "@/lib/server/auth-db"

export function CollaboratorsSection() {
  const { currentUser } = useAuth()

  // Data states
  const [connections, setConnections] = useState<EnrichedConnection[]>([])
  const [acceptedUsers, setAcceptedUsers] = useState<PublicUser[]>([])
  const [groups, setGroups] = useState<any[]>([])
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [loadingInitial, setLoadingInitial] = useState(true)

  // Search states
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<PublicUser[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  // Action loading indicators: key -> boolean
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  // Modal states
  const [createGroupOpen, setCreateGroupOpen] = useState(false)
  const [groupToDelete, setGroupToDelete] = useState<any | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [groupToEdit, setGroupToEdit] = useState<any | null>(null)

  // Load all user connections and groups
  const loadNetworkData = useCallback(async () => {
    try {
      const [connRes, groupsRes, activeRes] = await Promise.all([
        fetch("/api/connections", { cache: "no-store" }),
        fetch("/api/groups", { cache: "no-store" }),
        fetch("/api/groups/active", { cache: "no-store" }),
      ])

      if (connRes.ok) {
        const data = await connRes.json()
        if (data.ok) {
          setConnections(data.connections || [])
          setAcceptedUsers(data.acceptedUsers || [])
        }
      }

      if (groupsRes.ok) {
        const gData = await groupsRes.json()
        if (gData.ok) {
          setGroups(gData.groups || [])
        }
      }

      if (activeRes.ok) {
        const aData = await activeRes.json()
        if (aData.ok) {
          setActiveGroupId(aData.activeGroupId ?? null)
        }
      }
    } catch (err) {
      console.error("Failed to load network data:", err)
    } finally {
      setLoadingInitial(false)
    }
  }, [])

  useEffect(() => {
    loadNetworkData()
    // Avatar changes resolve live through toPublicUser — refresh so every
    // collaborator avatar here updates without a reload.
    return onAvatarUpdated(loadNetworkData)
  }, [loadNetworkData])

  // Handle live search with debouncing
  useEffect(() => {
    const q = searchQuery.trim()
    if (!q) {
      setSearchResults([])
      setIsSearching(false)
      setHasSearched(false)
      return
    }

    setIsSearching(true)
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`)
        if (res.ok) {
          const data = await res.json()
          if (data.ok) {
            setSearchResults(data.users || [])
            setHasSearched(true)
          }
        }
      } catch (err) {
        console.error("Search error:", err)
      } finally {
        setIsSearching(false)
      }
    }, 280)

    return () => clearTimeout(timeout)
  }, [searchQuery])

  // Helper to determine relationship state with a user
  function getRelationWithUser(userId: string) {
    if (acceptedUsers.some((u) => u.id === userId)) {
      const conn = connections.find(
        (c) =>
          c.status === "accepted" &&
          (c.requesterId === userId || c.recipientId === userId)
      )
      return { status: "connected", connectionId: conn?.id }
    }

    const pendingConn = connections.find(
      (c) =>
        c.status === "pending" &&
        (c.requesterId === userId || c.recipientId === userId)
    )

    if (pendingConn) {
      if (pendingConn.requesterId === currentUser?.id) {
        return { status: "pending_outgoing", connectionId: pendingConn.id }
      }
      return { status: "pending_incoming", connectionId: pendingConn.id }
    }

    return { status: "none", connectionId: undefined }
  }

  // Send connection request
  async function handleConnect(recipientId: string) {
    setActionLoading((prev) => ({ ...prev, [recipientId]: true }))
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId }),
      })

      const data = await res.json()
      if (res.ok && data.ok) {
        setStatusMessage({ type: "success", text: "Connection request sent!" })
        await loadNetworkData()
      } else {
        setStatusMessage({ type: "error", text: data.error || "Failed to send request." })
      }
    } catch {
      setStatusMessage({ type: "error", text: "Network error occurred." })
    } finally {
      setActionLoading((prev) => ({ ...prev, [recipientId]: false }))
      setTimeout(() => setStatusMessage(null), 4000)
    }
  }

  // Accept or decline connection request
  async function handleRespond(connectionId: string, action: "accept" | "decline") {
    setActionLoading((prev) => ({ ...prev, [connectionId]: true }))
    try {
      const res = await fetch(`/api/connections/${connectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })

      const data = await res.json()
      if (res.ok && data.ok) {
        setStatusMessage({
          type: "success",
          text: action === "accept" ? "Connection accepted!" : "Connection declined.",
        })
        await loadNetworkData()
      } else {
        setStatusMessage({ type: "error", text: data.error || "Failed to respond." })
      }
    } catch {
      setStatusMessage({ type: "error", text: "Network error occurred." })
    } finally {
      setActionLoading((prev) => ({ ...prev, [connectionId]: false }))
      setTimeout(() => setStatusMessage(null), 4000)
    }
  }

  // Remove connection (shared dialog + shared request: connection row only,
  // group memberships and content are untouched).
  const [connectionToRemove, setConnectionToRemove] = useState<{ id: string; name: string } | null>(null)
  const [removeConnLoading, setRemoveConnLoading] = useState(false)
  const [removeConnError, setRemoveConnError] = useState<string | null>(null)

  async function handleConfirmRemoveConnection() {
    if (!connectionToRemove) return
    setRemoveConnLoading(true)
    setRemoveConnError(null)
    const result = await deleteConnectionRequest(connectionToRemove.id)
    setRemoveConnLoading(false)
    if (!result.ok) {
      setRemoveConnError(result.error)
      return
    }
    setConnectionToRemove(null)
    setStatusMessage({ type: "success", text: "Connection removed." })
    setTimeout(() => setStatusMessage(null), 4000)
    await loadNetworkData()
  }

  // Switch active group
  async function handleSetActiveGroup(groupId: string) {
    setActionLoading((prev) => ({ ...prev, [`group_${groupId}`]: true }))
    try {
      const res = await fetch("/api/groups/active", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId }),
      })

      const data = await res.json()
      if (res.ok && data.ok) {
        setActiveGroupId(groupId)
        setStatusMessage({ type: "success", text: `Active workspace group updated.` })
      }
    } catch {
      setStatusMessage({ type: "error", text: "Failed to switch active group." })
    } finally {
      setActionLoading((prev) => ({ ...prev, [`group_${groupId}`]: false }))
      setTimeout(() => setStatusMessage(null), 4000)
    }
  }

  // Delete research group (leader only)
  async function handleConfirmDeleteGroup() {
    if (!groupToDelete) return
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/groups/${groupToDelete.id}`, {
        method: "DELETE",
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setDeleteError(data.error || "Failed to delete research group.")
        return
      }

      setStatusMessage({ type: "success", text: `Research group "${groupToDelete.name}" deleted.` })
      setGroupToDelete(null)
      await loadNetworkData()
    } catch {
      setDeleteError("Network error occurred. Please try again.")
    } finally {
      setDeleteLoading(false)
      setTimeout(() => setStatusMessage(null), 4000)
    }
  }

  // Pending incoming requests
  const incomingRequests = connections.filter(
    (c) => c.status === "pending" && !c.isOutgoing
  )

  return (
    <div id="collaborators" className="space-y-6">
      {/* Toast Alert */}
      {statusMessage && (
        <div
          className={`flex items-center gap-2 rounded-xl p-3 text-xs font-medium animate-in fade-in slide-in-from-top-1 ${
            statusMessage.type === "success"
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
              : "bg-destructive/10 text-destructive border border-destructive/20"
          }`}
        >
          {statusMessage.type === "success" ? (
            <Check className="size-4 shrink-0" />
          ) : (
            <AlertCircle className="size-4 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* ── 1. FIND COLLABORATORS (SEARCH) ─────────────────────────────────── */}
      <section
        className="rounded-2xl border border-border bg-card p-6 shadow-sm"
        aria-labelledby="find-collaborators-heading"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 id="find-collaborators-heading" className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
              <UserPlus className="size-4 text-brand" />
              Find collaborators
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Search by username or display name to connect with other researchers.
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Type a username or name"
            className="w-full rounded-xl border border-border bg-background pl-10 pr-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Search Results Display */}
        {searchQuery.trim() !== "" && (
          <div className="mt-4 border-t border-border/70 pt-4">
            {isSearching ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-brand" />
                <span>Searching researchers...</span>
              </div>
            ) : searchResults.length === 0 && hasSearched ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No researchers found matching &ldquo;{searchQuery}&rdquo;.
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {searchResults.map((user) => {
                  const relation = getRelationWithUser(user.id)
                  const isLoading = !!actionLoading[user.id]

                  return (
                    <li key={user.id} className="flex items-center justify-between gap-3 py-3">
                      <Link
                        href={`/users/${user.id}`}
                        title={`View ${(fullNameOf(user) || "Member")}'s profile`}
                        aria-label={`View ${(fullNameOf(user) || "Member")}'s profile`}
                        className="flex items-center gap-3 min-w-0 rounded-lg"
                      >
                        <Avatar
                          member={{
                            id: user.id,
                            name: (fullNameOf(user) || "Member"),
                            initials: user.initials,
                            color: user.color,
                            avatarUrl: user.avatarUrl,
                          }}
                          className="size-9 shrink-0 text-xs"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground hover:text-brand hover:underline">
                            {(fullNameOf(user) || "Member")}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="truncate">@{user.username}</span>
                            <span>•</span>
                            <span className="truncate">{user.role}</span>
                          </div>
                        </div>
                      </Link>

                      {/* Action buttons based on connection state */}
                      <div className="shrink-0 flex items-center gap-2">
                        {relation.status === "connected" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <Check className="size-3" />
                            Connected
                          </span>
                        )}

                        {relation.status === "pending_outgoing" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                            <Clock className="size-3" />
                            Request sent
                          </span>
                        )}

                        {relation.status === "pending_incoming" && relation.connectionId && (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleRespond(relation.connectionId!, "accept")}
                              disabled={actionLoading[relation.connectionId!]}
                              className="rounded-lg bg-brand px-3 py-1 text-xs font-medium text-white hover:opacity-90 transition-opacity"
                            >
                              Accept
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRespond(relation.connectionId!, "decline")}
                              disabled={actionLoading[relation.connectionId!]}
                              className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary transition-colors"
                            >
                              Decline
                            </button>
                          </div>
                        )}

                        {relation.status === "none" && (
                          <button
                            type="button"
                            onClick={() => handleConnect(user.id)}
                            disabled={isLoading}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand to-lavender px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                          >
                            {isLoading ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <UserPlus className="size-3.5" />
                            )}
                            Connect
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* ── 2. CONNECTION REQUESTS (INCOMING) ─────────────────────────────── */}
      <section
        className="rounded-2xl border border-border bg-card p-6 shadow-sm"
        aria-labelledby="requests-heading"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-brand" />
            <h2 id="requests-heading" className="text-base font-semibold tracking-tight text-foreground">
              Connection requests
            </h2>
            {incomingRequests.length > 0 && (
              <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs font-semibold text-brand">
                {incomingRequests.length}
              </span>
            )}
          </div>
        </div>

        {incomingRequests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/10 p-6 text-center text-xs text-muted-foreground">
            No incoming connection requests right now.
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {incomingRequests.map((req) => {
              const u = req.otherUser
              const isSubmitting = !!actionLoading[req.id]

              return (
                <li key={req.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3">
                  <Link
                    href={`/users/${u.id}`}
                    title={`View ${(fullNameOf(u) || "Member")}'s profile`}
                    aria-label={`View ${(fullNameOf(u) || "Member")}'s profile`}
                    className="flex items-center gap-3 min-w-0 rounded-lg"
                  >
                    <Avatar
                      member={{
                        id: u.id,
                        name: (fullNameOf(u) || "Member"),
                        initials: u.initials,
                        color: u.color,
                        avatarUrl: u.avatarUrl,
                      }}
                      className="size-10 shrink-0 text-xs"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground hover:text-brand hover:underline">
                        {(fullNameOf(u) || "Member")}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        @{u.username} • {u.role}
                      </p>
                    </div>
                  </Link>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => handleRespond(req.id, "accept")}
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-1 rounded-xl bg-brand px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {isSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRespond(req.id, "decline")}
                      disabled={isSubmitting}
                      className="rounded-xl border border-border bg-secondary/80 px-3.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* ── 3. COLLABORATORS (ACCEPTED CONNECTIONS) ────────────────────────── */}
      <section
        className="rounded-2xl border border-border bg-card p-6 shadow-sm"
        aria-labelledby="collaborators-heading"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 id="collaborators-heading" className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
              <UserCheck className="size-4 text-brand" />
              Collaborators ({acceptedUsers.length})
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Researchers who have accepted your connection. You can add them to research groups.
            </p>
          </div>

          <button
            type="button"
            id="btn-create-group"
            onClick={() => setCreateGroupOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand to-lavender px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
          >
            <FolderPlus className="size-4" />
            Create research group
          </button>
        </div>

        {acceptedUsers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/10 p-8 text-center">
            <Users className="size-8 text-muted-foreground mx-auto mb-2 opacity-50" />
            <p className="text-sm font-semibold text-foreground">No collaborators yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              Find researchers in the search above and send a connection request to start collaborating.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {acceptedUsers.map((u) => {
              const conn = connections.find(
                (c) =>
                  c.status === "accepted" &&
                  (c.requesterId === u.id || c.recipientId === u.id)
              )

              return (
                <div
                  key={u.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-background/60 p-3 hover:border-brand/30 transition-colors"
                >
                  <Link
                    href={`/users/${u.id}`}
                    title={`View ${(fullNameOf(u) || "Member")}'s profile`}
                    aria-label={`View ${(fullNameOf(u) || "Member")}'s profile`}
                    className="flex items-center gap-2.5 min-w-0 rounded-lg"
                  >
                    <Avatar
                      member={{
                        id: u.id,
                        name: (fullNameOf(u) || "Member"),
                        initials: u.initials,
                        color: u.color,
                        avatarUrl: u.avatarUrl,
                      }}
                      className="size-9 shrink-0 text-xs"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate hover:text-brand hover:underline">{(fullNameOf(u) || "Member")}</p>
                      <p className="text-[0.68rem] text-muted-foreground truncate">@{u.username}</p>
                    </div>
                  </Link>

                  {conn && (
                    <button
                      type="button"
                      onClick={() =>
                        setConnectionToRemove({
                          id: conn.id,
                          name: (fullNameOf(u) || "this collaborator"),
                        })
                      }
                      title="Remove connection"
                      className="text-muted-foreground hover:text-destructive p-1 rounded-lg hover:bg-secondary transition-colors"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── 4. RESEARCH GROUPS OVERVIEW ────────────────────────────────────── */}
      <section
        className="rounded-2xl border border-border bg-card p-6 shadow-sm"
        aria-labelledby="groups-heading"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 id="groups-heading" className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
              <Users className="size-4 text-brand" />
              Your research groups ({groups.length})
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Groups you belong to. The active group determines the scoped Home workspace.
            </p>
          </div>
        </div>

        {groups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/10 p-6 text-center text-xs text-muted-foreground">
            You don't belong to any research groups yet. Click &ldquo;Create research group&rdquo; above to create your first group!
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => {
              const isActive = group.id === activeGroupId
              const isSwitching = !!actionLoading[`group_${group.id}`]

              return (
                <div
                  key={group.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-4 transition-all ${
                    isActive
                      ? "border-brand/40 bg-brand/5 ring-1 ring-brand/20"
                      : "border-border bg-background/50 hover:bg-secondary/40"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground truncate">{group.name}</h3>
                      {isActive && (
                        <span className="rounded-full bg-brand px-2 py-0.5 text-[0.65rem] font-semibold text-white">
                          Active Home Workspace
                        </span>
                      )}
                      {group.isOwner && (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
                          Owner
                        </span>
                      )}
                    </div>
                    {group.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{group.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex -space-x-1.5 overflow-hidden">
                        {group.members.slice(0, 5).map((m: any) => (
                          <span
                            key={m.userId}
                            title={fullNameOf(m.user) || "Member"}
                            className={`inline-flex size-6 items-center justify-center rounded-full text-[0.55rem] font-semibold text-white ring-2 ring-card ${m.user.color}`}
                          >
                            {m.user.initials}
                          </span>
                        ))}
                      </div>
                      <span className="text-[0.7rem] text-muted-foreground">
                        {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>

                    <div className="shrink-0 flex items-center gap-2 self-end sm:self-auto">
                      {!isActive ? (
                        <button
                          type="button"
                          onClick={() => handleSetActiveGroup(group.id)}
                          disabled={isSwitching}
                          className="inline-flex items-center gap-1 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                        >
                          {isSwitching && <Loader2 className="size-3 animate-spin" />}
                          Set as Active
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-brand">
                          <Check className="size-3.5" />
                          Selected
                        </span>
                      )}

                      {/* Visible only to the group's leader - completely hidden for non-leaders */}
                      {Boolean(currentUser?.id && (group.leader === currentUser.id || (!group.leader && group.ownerId === currentUser.id))) && (
                        <button
                          type="button"
                          onClick={() => setGroupToEdit(group)}
                          title={`Edit "${group.name}"`}
                          aria-label={`Edit "${group.name}"`}
                          className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:text-brand hover:bg-brand/10 transition-colors"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      )}
                      {/* Visible only to the group's leader - completely hidden for non-leaders */}
                      {Boolean(currentUser?.id && (group.leader === currentUser.id || (!group.leader && group.ownerId === currentUser.id))) && (
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null)
                            setGroupToDelete(group)
                          }}
                          title={`Delete "${group.name}"`}
                          aria-label={`Delete "${group.name}"`}
                          className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Delete Group Confirmation Modal */}
        <DeleteGroupModal
          open={Boolean(groupToDelete)}
          group={groupToDelete}
          loading={deleteLoading}
          error={deleteError}
          onClose={() => {
            if (!deleteLoading) {
              setGroupToDelete(null)
              setDeleteError(null)
            }
          }}
          onConfirm={handleConfirmDeleteGroup}
        />

        {/* Remove Connection Confirmation Modal (shared with Team page) */}
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

        {/* Edit Group Modal (leader only) */}
        <EditGroupModal
          open={Boolean(groupToEdit)}
          group={groupToEdit}
          currentUserId={currentUser?.id}
          onClose={() => setGroupToEdit(null)}
          onSaved={(updated) => {
            setGroupToEdit(null)
            setStatusMessage({ type: "success", text: `Research group "${updated.name}" updated.` })
            loadNetworkData()
          }}
        />

      {/* Create Group Modal */}
      <CreateGroupModal
        open={createGroupOpen}
        onClose={() => setCreateGroupOpen(false)}
        collaborators={acceptedUsers}
        onCreated={(newGroup) => {
          setGroups((prev) => [newGroup, ...prev])
          setActiveGroupId(newGroup.id)
          setStatusMessage({ type: "success", text: `Research group "${newGroup.name}" created and set as active!` })
          loadNetworkData()
        }}
      />
    </div>
  )
}
