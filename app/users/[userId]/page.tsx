"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { Avatar } from "@/components/primitives"
import { RemoveConnectionDialog } from "@/components/remove-connection-dialog"
import { RowActionsMenu } from "@/components/row-actions-menu"
import { useAuth } from "@/lib/auth-context"
import { fullNameOf } from "@/lib/names"
import { deleteConnectionRequest } from "@/lib/connections"
import type { PublicUser, EnrichedConnection } from "@/lib/server/auth-db"
import {
  ArrowLeft,
  Calendar,
  Check,
  Clock,
  Folder,
  Loader2,
  Pencil,
  PenLine,
  UserPlus,
  Users,
} from "lucide-react"

type Relation = "self" | "connected" | "pending_outgoing" | "pending_incoming" | "none"

type ProfilePayload = {
  user: PublicUser
  isOwner: boolean
  connections?: PublicUser[]
  groups?: { id: string; name: string }[]
}

/**
 * Public profile: avatar, display name, username, bio, role, connection
 * status, connections, groups, joined date. Section visibility is enforced
 * server-side — a Private section is omitted entirely for non-owners.
 * Bio is editable inline here (owner only) via the same PATCH as Account.
 */
export default function PublicProfilePage() {
  const params = useParams()
  const rawId = params.userId
  const userId = Array.isArray(rawId) ? rawId[0] : (rawId as string)
  const { currentUser, refreshUser } = useAuth()

  const [payload, setPayload] = useState<ProfilePayload | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set())
  const [connections, setConnections] = useState<EnrichedConnection[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // Inline bio editing (owner only, no redirect — same PATCH as Account).
  const [editingBio, setEditingBio] = useState(false)
  const [bioDraft, setBioDraft] = useState("")
  const [bioSaving, setBioSaving] = useState(false)
  const [bioError, setBioError] = useState<string | null>(null)

  // Shared remove-connection dialog state (same flow as Team / Find collaborators).
  const [connectionToRemove, setConnectionToRemove] = useState<{
    id: string
    name: string
  } | null>(null)
  const [removeConnLoading, setRemoveConnLoading] = useState(false)
  const [removeConnError, setRemoveConnError] = useState<string | null>(null)

  const loadProfile = useCallback(async (silent = false) => {
    if (!silent) {
      setPayload(null)
      setNotFound(false)
    }
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(userId)}/profile`, {
        cache: "no-store",
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok && data.user) {
        setPayload({
          user: data.user,
          isOwner: !!data.isOwner,
          connections: data.connections,
          groups: data.groups,
        })
      } else {
        setNotFound(true)
      }
    } catch {
      setNotFound(true)
    }
  }, [userId])

  useEffect(() => {
    if (userId) loadProfile()
  }, [userId, loadProfile])

  const reloadConnections = useCallback(async () => {
    try {
      const res = await fetch("/api/connections")
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) {
        setAcceptedIds(new Set((data.acceptedUsers ?? []).map((u: PublicUser) => u.id)))
        setConnections(data.connections ?? [])
      }
    } catch {
      // Status simply stays "Not connected"; profile itself still renders.
    }
  }, [])

  useEffect(() => {
    reloadConnections()
  }, [reloadConnections, userId])

  const profile = payload?.user ?? null
  // Server is the source of truth for ownership; fall back to the id match.
  const isOwner = payload ? payload.isOwner : currentUser?.id === userId

  // Same status derivation as the Team page.
  const relation: Relation = (() => {
    if (!currentUser || currentUser.id === userId || isOwner) return "self"
    if (acceptedIds.has(userId)) return "connected"
    const row = connections.find(
      (c) => c.status === "pending" && (c.requesterId === userId || c.recipientId === userId)
    )
    if (!row) return "none"
    return row.requesterId === currentUser.id ? "pending_outgoing" : "pending_incoming"
  })()
  const incomingId =
    relation === "pending_incoming"
      ? (connections.find(
          (c) => c.status === "pending" && c.requesterId === userId
        )?.id ?? null)
      : null
  const acceptedId =
    relation === "connected"
      ? (connections.find(
          (c) =>
            c.status === "accepted" &&
            (c.requesterId === userId || c.recipientId === userId)
        )?.id ?? null)
      : null

  async function handleSaveBio() {
    if (!profile || bioSaving) return
    const trimmed = bioDraft.trim()
    if (trimmed.length > 200) {
      setBioError("Bio must be 200 characters or fewer.")
      return
    }
    setBioSaving(true)
    setBioError(null)
    try {
      // Same storage + endpoint as Account settings — no duplicate bio store.
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio: trimmed }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setBioError(data.error || "Failed to save bio. Please try again.")
        return
      }
      await refreshUser()
      await loadProfile(true)
      setEditingBio(false)
    } catch {
      setBioError("Failed to save bio. Please try again.")
    } finally {
      setBioSaving(false)
    }
  }

  async function handleConnect() {
    if (!profile || busy) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: profile.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setMessage(data.error || "Failed to send connection request.")
        return
      }
      await reloadConnections()
    } catch {
      setMessage("Failed to send connection request.")
    } finally {
      setBusy(false)
    }
  }

  async function handleAccept() {
    if (!incomingId || busy) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/connections/${incomingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setMessage(data.error || "Failed to accept connection request.")
        return
      }
      await reloadConnections()
    } catch {
      setMessage("Failed to accept connection request.")
    } finally {
      setBusy(false)
    }
  }

  async function handleConfirmRemoveConnection() {
    if (!connectionToRemove) return
    setRemoveConnLoading(true)
    setRemoveConnError(null)
    // Same shared request as Team / Find collaborators: connection row only.
    const result = await deleteConnectionRequest(connectionToRemove.id)
    setRemoveConnLoading(false)
    if (!result.ok) {
      setRemoveConnError(result.error)
      return
    }
    setConnectionToRemove(null)
    setRemoveConnError(null)
    await reloadConnections()
  }

  function openRemoveDialog() {
    if (!profile || !acceptedId) return
    setConnectionToRemove({
      id: acceptedId,
      name: (fullNameOf(profile) || "User"),
    })
  }

  function joinedLabel(iso: string): string {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ""
    return d.toLocaleDateString(undefined, { month: "long", year: "numeric" })
  }

  // Owner-only "private" labels come from the owner's own session record
  // (visibility flags never leave the server for other viewers).
  const connsPrivate = isOwner && (currentUser?.showConnections ?? true) === false
  const groupsPrivate = isOwner && (currentUser?.showGroups ?? true) === false

  return (
    <AppShell>
      <Link
        href="/home"
        className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to Home
      </Link>

      {!profile && !notFound ? (
        <p className="text-sm text-muted-foreground">Loading profile…</p>
      ) : !profile ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 py-14 text-center">
          <p className="text-sm font-medium text-foreground">User not found</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            This account doesn&apos;t exist or is no longer available.
          </p>
        </div>
      ) : (
        <>
          {/* Top: avatar + identity — PageIntro chrome (gradient wash, eyebrow
              pill) so the page opens like every other et-alicite page. */}
          <section
            aria-labelledby="profile-heading"
            className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8"
          >
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl" aria-hidden="true">
              <div className="absolute -right-16 -top-24 size-72 rounded-full bg-gradient-to-br from-brand/25 to-lavender/25 blur-3xl" />
            </div>
            <span className="relative inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
              <Users className="size-3.5" aria-hidden="true" />
              Public profile
            </span>
            <div className="relative mt-4 flex items-start gap-4 sm:gap-5">
            <Avatar
              member={{
                id: profile.id,
                name: (fullNameOf(profile) || "User"),
                initials: profile.initials,
                color: profile.color,
                avatarUrl: profile.avatarUrl,
              }}
              className="size-24 shrink-0 text-2xl shadow-md sm:size-28 sm:text-3xl"
            />
            <div className="min-w-0 flex-1 pt-1">
              <h1
                id="profile-heading"
                className="truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl"
              >
                {(fullNameOf(profile) || "User")}
              </h1>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                @{profile.username}
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex rounded-full bg-secondary px-2.5 py-0.5 text-[0.68rem] font-medium text-muted-foreground">
                  {profile.role}
                </span>
                {joinedLabel(profile.createdAt) && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="size-3" aria-hidden="true" />
                    Joined {joinedLabel(profile.createdAt)}
                  </span>
                )}
              </p>
              {editingBio && isOwner ? (
                <div className="mt-3">
                  <div className="flex items-center justify-between">
                    <label htmlFor="inline-bio" className="block text-xs font-semibold text-foreground">
                      Bio
                    </label>
                    <span className="text-[0.68rem] text-muted-foreground">
                      {bioDraft.trim().length}/200
                    </span>
                  </div>
                  <textarea
                    id="inline-bio"
                    rows={3}
                    maxLength={200}
                    value={bioDraft}
                    onChange={(e) => setBioDraft(e.target.value)}
                    placeholder="e.g. Undergrad researcher into AI in education."
                    className="mt-1 w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand/20"
                  />
                  {bioError && <p className="mt-1.5 text-xs text-destructive">{bioError}</p>}
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingBio(false)
                        setBioError(null)
                      }}
                      disabled={bioSaving}
                      className="rounded-xl border border-border bg-secondary/80 px-4 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveBio}
                      disabled={bioSaving}
                      className="rounded-xl bg-gradient-to-r from-brand to-lavender px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {bioSaving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              ) : profile.bio ? (
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                  {profile.bio}
                </p>
              ) : (
                isOwner && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No bio yet.
                  </p>
                )
              )}
            </div>
            {(payload?.connections !== undefined || payload?.groups !== undefined) && (
              <div className="ml-auto hidden shrink-0 items-start gap-6 pt-1 sm:flex">
                {payload?.connections !== undefined && payload && (
                  <a
                    href="#profile-connections-heading"
                    className="rounded-lg text-center transition-opacity hover:opacity-75"
                  >
                    <span className="block text-xl font-bold tracking-tight text-foreground">
                      {payload.connections.length}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Connection{payload.connections.length === 1 ? "" : "s"}
                    </span>
                  </a>
                )}
                {payload?.groups !== undefined && payload && (
                  <a
                    href="#profile-groups-heading"
                    className="rounded-lg text-center transition-opacity hover:opacity-75"
                  >
                    <span className="block text-xl font-bold tracking-tight text-foreground">
                      {payload.groups.length}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Group{payload.groups.length === 1 ? "" : "s"}
                    </span>
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Action row */}
          <div className="relative mt-5 flex items-center gap-2">
            {relation === "self" ? (
              <div className="flex w-full gap-2 sm:max-w-md">
                <Link
                  href="/account"
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary/70"
                >
                  <Pencil className="size-4" aria-hidden="true" />
                  Edit profile
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setBioDraft(profile?.bio ?? "")
                    setBioError(null)
                    setEditingBio(true)
                  }}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary/70"
                >
                  <PenLine className="size-4" aria-hidden="true" />
                  Edit bio
                </button>
              </div>
            ) : (
              <>
                {relation === "connected" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <Check className="size-3.5" aria-hidden="true" />
                    Connected
                  </span>
                ) : relation === "pending_outgoing" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                    <Clock className="size-3.5" aria-hidden="true" />
                    Request sent
                  </span>
                ) : relation === "pending_incoming" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                    <Clock className="size-3.5" aria-hidden="true" />
                    Pending
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                    Not connected
                  </span>
                )}
                {relation !== "pending_outgoing" && (
                  <RowActionsMenu
                    onEdit={
                      relation === "connected"
                        ? undefined
                        : relation === "pending_incoming"
                          ? handleAccept
                          : handleConnect
                    }
                    editLabel={relation === "pending_incoming" ? "Accept request" : "Connect"}
                    onDelete={relation === "connected" ? openRemoveDialog : undefined}
                    deleteLabel="Remove connection"
                  />
                )}
              </>
            )}
          </div>
          {message && <p className="relative mt-2 text-xs text-destructive">{message}</p>}
          </section>

          {/* Connections */}
          {payload?.connections !== undefined && payload && (
            <section
              aria-labelledby="profile-connections-heading"
              className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
            >
              <div className="flex items-center gap-2">
                <Users className="size-4 text-brand" aria-hidden="true" />
                <h2 id="profile-connections-heading" className="text-base font-semibold tracking-tight text-foreground">
                  Connections ({payload.connections.length})
                </h2>
                {isOwner && connsPrivate && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
                    Only visible to you
                  </span>
                )}
              </div>
              {payload.connections.length > 0 ? (
                <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {payload.connections.map((u) => (
                    <li key={u.id}>
                      <Link
                        href={`/users/${u.id}`}
                        className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-background/60 px-3 py-2 transition-colors hover:border-brand/30"
                      >
                        <Avatar
                          member={{
                            id: u.id,
                            name: (fullNameOf(u) || "Member"),
                            initials: u.initials,
                            color: u.color,
                            avatarUrl: u.avatarUrl,
                          }}
                          className="size-8 shrink-0 text-[0.6rem]"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold text-foreground">
                            {(fullNameOf(u) || "Member")}
                          </span>
                          <span className="block truncate text-[0.68rem] text-muted-foreground">
                            @{u.username}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 rounded-xl border border-dashed border-border bg-card/50 px-4 py-6 text-center text-sm text-muted-foreground">
                  No connections yet.
                </p>
              )}
            </section>
          )}

          {/* Research groups */}
          {payload?.groups !== undefined && payload && (
            <section
              aria-labelledby="profile-groups-heading"
              className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
            >
              <div className="flex items-center gap-2">
                <Folder className="size-4 text-brand" aria-hidden="true" />
                <h2 id="profile-groups-heading" className="text-base font-semibold tracking-tight text-foreground">
                  Research groups ({payload.groups.length})
                </h2>
                {isOwner && groupsPrivate && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
                    Only visible to you
                  </span>
                )}
              </div>
              {payload.groups.length > 0 ? (
                <ul className="mt-3 flex flex-col gap-2">
                  {payload.groups.map((g) => (
                    <li
                      key={g.id}
                      className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-background/60 px-3 py-2"
                    >
                      <Folder className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0 truncate text-sm font-medium text-foreground">
                        {g.name}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 rounded-xl border border-dashed border-border bg-card/50 px-4 py-6 text-center text-sm text-muted-foreground">
                  Not in any research group yet.
                </p>
              )}
            </section>
          )}

        </>
      )}

      {/* Remove Connection Confirmation Modal (shared with Team / Find collaborators) */}
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
    </AppShell>
  )
}
