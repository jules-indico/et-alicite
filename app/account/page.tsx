"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import Cropper, { type Area } from "react-easy-crop"
import { AppShell } from "@/components/app-shell"
import { Z } from "@/lib/layers"
import { PageIntro } from "@/components/page-intro"
import { Avatar, StatusBadge } from "@/components/primitives"
import { project } from "@/lib/research-data"
import type { Task } from "@/lib/research-data"
import { useAuth } from "@/lib/auth-context"
import {
  AVATAR_ACCEPT,
  AVATAR_MAX_BYTES,
  isSquareImage,
  notifyAvatarUpdated,
  renderAvatarBlob,
  validateAvatarFile,
} from "@/lib/avatar"
import { ROLE_GROUPS, ROLE_VALUES, DEFAULT_ROLE } from "@/lib/roles"
import { fullNameOf, splitName } from "@/lib/names"
import { RemoveMemberDialog } from "@/components/remove-member-dialog"
import { useDismissOnOutsideClick } from "@/lib/use-dismiss"
import { CollaboratorsSection } from "@/components/collaborators-section"
import { UserCircle, Mail, Users, GraduationCap, BookOpen, Calendar, ShieldCheck, AtSign, Camera, Loader2, Trash2, ChevronDown, Check } from "lucide-react"

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-brand">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  )
}

/**
 * Custom avatar upload (own account only — nothing like this exists on the
 * public profile page). Square images save straight through; anything else
 * opens a crop step (react-easy-crop). Every save is canvas-normalized to
 * 256×256 JPEG before upload, then announced so all mounted surfaces
 * refresh without a page reload.
 */
function AvatarUploader() {
  const { currentUser, refreshUser } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [pixels, setPixels] = useState<Area | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onCropComplete = useCallback((_: Area, cropped: Area) => {
    setPixels(cropped)
  }, [])

  async function uploadBlob(blob: Blob): Promise<string> {
    const form = new FormData()
    form.append("file", new File([blob], "avatar.jpg", { type: "image/jpeg" }))
    const res = await fetch("/api/avatars", { method: "POST", body: form })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok || !data.file?.url) {
      throw new Error(data.error || "Upload failed. Please try again.")
    }
    return data.file.url as string
  }

  async function saveUrl(url: string) {
    const res = await fetch("/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatarUrl: url }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) {
      throw new Error(data.error || "Could not save avatar. Please try again.")
    }
  }

  async function saveBlob(blob: Blob) {
    setWorking(true)
    setError(null)
    try {
      await saveUrl(await uploadBlob(blob))
      await refreshUser()
      notifyAvatarUpdated()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save avatar.")
    } finally {
      setWorking(false)
    }
  }

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    const problem = validateAvatarFile(file)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    const reader = new FileReader()
    reader.onload = async () => {
      const url = String(reader.result ?? "")
      if (!url) return
      try {
        if (await isSquareImage(url)) {
          await saveBlob(await renderAvatarBlob(url))
        } else {
          setCrop({ x: 0, y: 0 })
          setZoom(1)
          setPixels(null)
          setSrc(url)
        }
      } catch {
        setError("Could not read that image. Please try another file.")
      }
    }
    reader.onerror = () => setError("Could not read that file. Please try another.")
    reader.readAsDataURL(file)
  }

  async function handleCropSave() {
    if (!src || !pixels) return
    try {
      await saveBlob(await renderAvatarBlob(src, pixels))
      setSrc(null)
    } catch {
      setError("Could not process that image. Please try another file.")
    }
  }

  async function handleRemove() {
    setWorking(true)
    setError(null)
    try {
      await saveUrl("")
      await refreshUser()
      notifyAvatarUpdated()
    } catch {
      setError("Could not remove avatar. Please try again.")
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="mt-3 flex w-full flex-col items-center gap-1.5">
      <input
        ref={fileRef}
        type="file"
        accept={AVATAR_ACCEPT.join(",")}
        onChange={pickFile}
        className="hidden"
        aria-label="Choose avatar image"
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={working}
        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-secondary/80 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
      >
        {working ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Camera className="size-3.5" aria-hidden="true" />
        )}
        {currentUser?.avatarUrl ? "Change avatar" : "Upload avatar"}
      </button>
      {currentUser?.avatarUrl && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={working}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[0.68rem] font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
        >
          <Trash2 className="size-3" aria-hidden="true" />
          Remove
        </button>
      )}
      <p className="text-[0.68rem] text-muted-foreground">
        PNG, JPG or WebP · up to 2 MB · cropped to a square
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}

      {src && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Crop your avatar"
        >
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl">
            <h3 className="text-base font-semibold tracking-tight text-foreground">
              Crop your avatar
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Drag to position · use the slider to zoom
            </p>
            <div className="relative mt-3 h-72 overflow-hidden rounded-xl bg-muted/30">
              <Cropper
                image={src}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            </div>
            <label className="mt-3 block text-xs font-medium text-muted-foreground">
              Zoom
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="mt-1 w-full accent-brand"
                aria-label="Crop zoom"
              />
            </label>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSrc(null)}
                disabled={working}
                className="rounded-xl border border-border bg-secondary/80 px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCropSave}
                disabled={working || !pixels}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand to-lavender px-4 py-2 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {working && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
                Save avatar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Public-profile editing (bio + section visibility). Lives only on the
 * private Account page — the public profile page itself is read-only.
 */
function PublicProfileEditor() {
  const { currentUser, refreshUser } = useAuth()
  const [bio, setBio] = useState<string | null>(null)
  const [firstName, setFirstName] = useState<string | null>(null)
  const [lastName, setLastName] = useState<string | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [initialRole, setInitialRole] = useState<string | null>(null)
  const [initialIdentity, setInitialIdentity] = useState<{
    firstName: string
    lastName: string
    username: string
  } | null>(null)
  const [showConnections, setShowConnections] = useState(true)
  const [showGroups, setShowGroups] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedTick, setSavedTick] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Seed from the session record once (never clobber in-progress edits when
  // refreshUser lands after a save). Split fields fall back to the legacy
  // full-name value for pre-migration cached records.
  useEffect(() => {
    if (currentUser && bio === null) {
      const split = splitName(
        [currentUser.firstName ?? "", currentUser.lastName ?? ""].filter(Boolean).join(" ") ||
          currentUser.displayName ||
          currentUser.name ||
          ""
      )
      const first = (currentUser.firstName ?? split.firstName).trim()
      const last = (currentUser.lastName ?? split.lastName).trim()
      const handle = (currentUser.username || "").trim().toLowerCase()
      setBio(currentUser.bio ?? "")
      setFirstName(first)
      setLastName(last)
      setUsername(handle)
      setInitialIdentity({ firstName: first, lastName: last, username: handle })
      setRole(currentUser.role || DEFAULT_ROLE)
      setInitialRole(currentUser.role || DEFAULT_ROLE)
      setShowConnections(currentUser.showConnections !== false)
      setShowGroups(currentUser.showGroups !== false)
    }
  }, [currentUser, bio])

  type IdentityChange = { label: string; from: string; to: string }

  function pendingIdentityChanges(): IdentityChange[] {
    if (!initialIdentity) return []
    const changes: IdentityChange[] = []
    const first = (firstName ?? "").trim()
    const last = (lastName ?? "").trim()
    const handle = (username ?? "").trim().toLowerCase()
    if (first !== initialIdentity.firstName) {
      changes.push({
        label: "First name",
        from: initialIdentity.firstName || "—",
        to: first || "—",
      })
    }
    if (last !== initialIdentity.lastName) {
      changes.push({
        label: "Last name",
        from: initialIdentity.lastName || "—",
        to: last || "—",
      })
    }
    if (handle !== initialIdentity.username) {
      changes.push({
        label: "Username",
        from: initialIdentity.username ? `@${initialIdentity.username}` : "—",
        to: handle ? `@${handle}` : "—",
      })
    }
    return changes
  }

  function validateAll(): string | null {
    if ((bio ?? "").trim().length > 200) return "Bio must be 200 characters or fewer."
    if (!(firstName ?? "").trim()) return "First name is required."
    if (!/^[a-z0-9_.-]{3,30}$/.test((username ?? "").trim().toLowerCase())) {
      return "Username must be 3-30 characters and contain only letters, numbers, underscores, dashes, or dots."
    }
    if (!role || (role !== initialRole && !ROLE_VALUES.includes(role))) {
      return "Please choose a role from the list."
    }
    return null
  }

  async function doSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bio: (bio ?? "").trim(),
          firstName: (firstName ?? "").trim(),
          lastName: (lastName ?? "").trim(),
          username: (username ?? "").trim().toLowerCase(),
          role,
          showConnections,
          showGroups,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to save. Please try again.")
        return
      }
      await refreshUser()
      // Names flow into group rosters via enrichGroup — refresh them live.
      notifyAvatarUpdated()
      setInitialIdentity({
        firstName: (firstName ?? "").trim(),
        lastName: (lastName ?? "").trim(),
        username: (username ?? "").trim().toLowerCase(),
      })
      setInitialRole(role)
      setConfirmOpen(false)
      setSavedTick(true)
      window.setTimeout(() => setSavedTick(false), 3000)
    } catch {
      setError("Failed to save. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  async function handleSave() {
    const problem = validateAll()
    if (problem) {
      setError(problem)
      return
    }
    // Name/username changes are visible to other users — confirm them.
    // Anything else (bio, role, visibility) saves immediately.
    if (pendingIdentityChanges().length > 0) {
      setError(null)
      setConfirmOpen(true)
      return
    }
    await doSave()
  }

  if (
    !currentUser ||
    bio === null ||
    firstName === null ||
    lastName === null ||
    username === null ||
    role === null ||
    !initialIdentity
  ) {
    return null
  }

  function VisibilityToggle({
    label,
    hint,
    value,
    onChange,
  }: {
    label: string
    hint: string
    value: boolean
    onChange: (v: boolean) => void
  }) {
    return (
      <div className="flex items-center justify-between gap-3 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <div className="flex shrink-0 gap-1 rounded-xl border border-border bg-muted/30 p-1" role="group" aria-label={label}>
          {(
            [
              { v: true, label: "Public" },
              { v: false, label: "Private" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.label}
              type="button"
              aria-pressed={value === opt.v}
              onClick={() => onChange(opt.v)}
              className={
                value === opt.v
                  ? "rounded-lg bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm"
                  : "rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  function RoleSelector({
    value,
    onChange,
  }: {
    value: string
    onChange: (v: string) => void
  }) {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState("")
    const wrapRef = useRef<HTMLDivElement>(null)
    useDismissOnOutsideClick({
      refs: [wrapRef],
      enabled: open,
      onDismiss: () => setOpen(false),
    })
    const q = query.trim().toLowerCase()
    const groups = ROLE_GROUPS.map((g) => ({
      label: g.label,
      roles: g.roles.filter((r) => r.toLowerCase().includes(q)),
    })).filter((g) => g.roles.length > 0)
    const legacy = value && !ROLE_VALUES.includes(value) ? value : null
    const showLegacy = legacy && legacy.toLowerCase().includes(q)
    return (
      <div ref={wrapRef} className="relative">
        <button
          type="button"
          onClick={() => {
            setQuery("")
            setOpen((v) => !v)
          }}
          aria-expanded={open}
          aria-label="Choose a role"
          className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand/20"
        >
          <span className="truncate">{value || "Select a role"}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
        {open && (
          <div className={`absolute ${Z.menu} mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-xl`}>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search roles…"
              aria-label="Search roles"
              className="w-full rounded-lg bg-transparent px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/70 outline-none"
            />
            {showLegacy && (
              <button
                type="button"
                onClick={() => {
                  onChange(legacy)
                  setOpen(false)
                }}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-foreground hover:bg-secondary transition-colors"
              >
                <span>
                  <span className="block text-[0.65rem] font-medium text-muted-foreground">Current</span>
                  {legacy}
                </span>
                {value === legacy && <Check className="size-3.5 text-brand" aria-hidden="true" />}
              </button>
            )}
            {groups.map((g) => (
              <div key={g.label}>
                <p className="px-2.5 pb-0.5 pt-2 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.label}
                </p>
                {g.roles.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      onChange(r)
                      setOpen(false)
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-foreground hover:bg-secondary transition-colors"
                  >
                    {r}
                    {value === r && <Check className="size-3.5 text-brand" aria-hidden="true" />}
                  </button>
                ))}
              </div>
            ))}
            {!showLegacy && groups.length === 0 && (
              <p className="px-2.5 py-3 text-center text-xs text-muted-foreground">
                No roles match “{query}”.
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <section
      className="rounded-2xl border border-border bg-card p-6 shadow-sm"
      aria-labelledby="public-profile-heading"
    >
      <h2 id="public-profile-heading" className="text-base font-semibold tracking-tight text-foreground">
        Public profile
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Shown on your public profile page — visible to other users.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="profile-first-name" className="mb-1 block text-xs font-semibold text-foreground">
            First name
          </label>
          <input
            id="profile-first-name"
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="e.g. Jules"
            autoComplete="given-name"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </div>
        <div>
          <label htmlFor="profile-last-name" className="mb-1 block text-xs font-semibold text-foreground">
            Last name
          </label>
          <input
            id="profile-last-name"
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="e.g. Kyryll"
            autoComplete="family-name"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="profile-username" className="mb-1 block text-xs font-semibold text-foreground">
            Username
          </label>
          <input
            id="profile-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. jules_kyryll"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          <p className="mt-1 text-[0.7rem] text-muted-foreground">
            3–30 characters: lowercase letters, numbers, _ . -
          </p>
        </div>
      </div>

      <div className="mt-3">
        <span id="profile-role-label" className="mb-1 block text-xs font-semibold text-foreground">
          Role
        </span>
        <div role="group" aria-labelledby="profile-role-label">
          <RoleSelector value={role} onChange={setRole} />
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between">
          <label htmlFor="profile-bio" className="block text-xs font-semibold text-foreground">
            Bio
          </label>
          <span className="text-[0.68rem] text-muted-foreground">{bio.trim().length}/200</span>
        </div>
        <textarea
          id="profile-bio"
          rows={3}
          maxLength={200}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="e.g. Undergrad researcher into AI in education."
          className="mt-1 w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </div>

      <div className="mt-2 divide-y divide-border">
        <VisibilityToggle
          label="Connections list"
          hint="Public: anyone can see it. Private: only you."
          value={showConnections}
          onChange={setShowConnections}
        />
        <VisibilityToggle
          label="Research groups list"
          hint="Public: anyone can see it. Private: only you."
          value={showGroups}
          onChange={setShowGroups}
        />
      </div>

      {error && (
        <div className="mt-3 rounded-xl bg-destructive/10 p-3 text-xs text-destructive">{error}</div>
      )}

      <div className="mt-4 flex items-center justify-end gap-3 border-t border-border pt-4">
        {savedTick && <span className="text-xs font-medium text-[oklch(0.45_0.12_155)]">Saved</span>}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-gradient-to-r from-brand to-lavender px-5 py-2 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save profile"}
        </button>
      </div>

      {/* Name/username confirmation (shared dialog, brand tone) */}
      <RemoveMemberDialog
        open={confirmOpen}
        memberName={null}
        groupName={null}
        tone="brand"
        loading={saving}
        error={error}
        title="Save profile changes?"
        subtitle="These changes will be visible to other users."
        message={
          <span className="flex flex-col gap-1.5">
            {pendingIdentityChanges().map((c) => (
              <span key={c.label} className="flex items-baseline justify-between gap-3">
                <span className="text-xs text-muted-foreground">{c.label}</span>
                <span className="text-right text-xs">
                  <span className="text-muted-foreground line-through">{c.from}</span>
                  {" → "}
                  <span className="font-semibold text-foreground">{c.to}</span>
                </span>
              </span>
            ))}
            <span className="mt-1 text-xs text-muted-foreground">
              Your new name and username will be visible to other users across
              et-alicite (profiles, teams, tasks, and activity).
            </span>
          </span>
        }
        confirmLabel="Save changes"
        confirmingLabel="Saving…"
        onClose={() => {
          if (!saving) setConfirmOpen(false)
        }}
        onConfirm={doSave}
      />
    </section>
  )
}

export default function AccountPage() {
  const { currentUser } = useAuth()

  // Account-level task list: assignee ID equals the signed-in user's real
  // ID, across ALL member groups (same shared group-research records as
  // Home/Tasks — never the legacy seed arrays). Each row carries groupName.
  const [myTasks, setMyTasks] = useState<(Task & { groupId: string; groupName: string })[]>([])
  const [tasksLoading, setTasksLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function loadAssigned() {
      try {
        const res = await fetch("/api/tasks/assigned", { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (!cancelled && res.ok && data.ok) setMyTasks(data.tasks ?? [])
      } catch {
        // List simply stays empty; the empty state covers it.
      } finally {
        if (!cancelled) setTasksLoading(false)
      }
    }
    loadAssigned()
    return () => {
      cancelled = true
    }
  }, [])

  const initials = currentUser?.initials || "U"
  const color = currentUser?.color || "bg-[oklch(0.58_0.16_260)]"
  const name = (currentUser && fullNameOf(currentUser)) || "Researcher"
  const username = currentUser?.username ? `@${currentUser.username}` : "@researcher"
  const email = currentUser?.email || "user@et-alicite.edu"
  const role = currentUser?.role || "Researcher"

  return (
    <AppShell>
      <PageIntro
        icon={UserCircle}
        eyebrow="Account"
        title="Your account"
        description="The profile you are currently signed in with, plus your research workspace details."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="flex flex-col items-center rounded-2xl border border-border bg-card p-6 text-center shadow-sm lg:col-span-1">
          {currentUser?.avatarUrl ? (
            <span
              className="flex size-20 items-center justify-center overflow-hidden rounded-full shadow-md"
              title={name}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={currentUser.avatarUrl} alt="" className="size-full object-cover" />
            </span>
          ) : (
            <span
              className={`flex size-20 items-center justify-center rounded-full text-2xl font-semibold text-white shadow-md ${color}`}
              title={name}
            >
              {initials}
            </span>
          )}
          <h2 className="mt-4 text-lg font-semibold tracking-tight text-foreground">{name}</h2>
          <p className="text-xs font-medium text-brand">{username}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{role}</p>
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
            <ShieldCheck className="size-3.5 text-brand" />
            Signed in
          </span>
          <AvatarUploader />
        </section>

        <section
          className="rounded-2xl border border-border bg-card p-6 shadow-sm lg:col-span-2"
          aria-labelledby="details-heading"
        >
          <h2 id="details-heading" className="text-base font-semibold tracking-tight text-foreground">
            Profile details
          </h2>
          <div className="mt-2 divide-y divide-border">
            <InfoRow icon={AtSign} label="Username" value={username} />
            <InfoRow icon={Mail} label="Email" value={email} />
            <InfoRow icon={GraduationCap} label="Role" value={`${role} · Research Team`} />
            <InfoRow icon={BookOpen} label="Active project" value={project.shortName} />
          </div>
        </section>
      </div>

      <PublicProfileEditor />

      {/* Collaborators & Networking Section */}
      <CollaboratorsSection />

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm" aria-labelledby="mytasks-heading">
        <div className="flex items-center justify-between">
          <h2 id="mytasks-heading" className="text-base font-semibold tracking-tight text-foreground">
            Your assigned tasks
          </h2>
          <span className="text-sm text-muted-foreground">{myTasks.length} task{myTasks.length === 1 ? "" : "s"}</span>
        </div>
        <ul className="mt-4 flex flex-col divide-y divide-border">
          {tasksLoading ? (
            <li className="py-6 text-center text-sm text-muted-foreground">Loading tasks…</li>
          ) : myTasks.length > 0 ? (
            myTasks.map((task) => (
              <li key={`${task.groupId}:${task.id}`}>
                <Link
                  href={`/tasks/${task.id}`}
                  title={`Open ${task.title}`}
                  className="flex items-center gap-3 rounded-xl py-3 transition-colors hover:bg-secondary/40"
                >
                  <Avatar
                    member={{
                      id: currentUser?.id ?? "",
                      name: name,
                      initials,
                      color,
                    }}
                    className="ring-card"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {task.chapter} · {task.groupName}
                    </p>
                  </div>
                  <StatusBadge status={task.status} />
                </Link>
              </li>
            ))
          ) : (
            <li className="py-6 text-center text-sm text-muted-foreground">
              No tasks assigned yet. You're ready to pick up research tasks with your team!
            </li>
          )}
        </ul>
      </section>

    </AppShell>
  )
}
