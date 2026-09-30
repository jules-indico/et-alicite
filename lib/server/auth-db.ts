import crypto from "crypto"
import { eq, and, desc, inArray } from "drizzle-orm"
import { db } from "./db"
import { deleteBlob, isBlobUrl } from "./blob"
import * as T from "./schema"
import { ROLE_VALUES } from "@/lib/roles"
import { splitName, fullNameOf } from "@/lib/names"
import type { UserPreferences, ViewMode, ViewSectionKey, SectionSort, SortDirection, SortScope } from "@/lib/research-data"
import { VIEW_SECTIONS, SORT_SCOPES, TASK_STATUSES } from "@/lib/research-data"

/**
 * Convert a Drizzle row (SQL NULLs) to the Db* shapes this module has
 * always used (optional fields as undefined). JSONB columns arrive parsed.
 */
type NullToUndefined<T> = {
  [K in keyof T]: null extends T[K] ? Exclude<T[K], null> | undefined : T[K]
}

function cleanRow<T extends Record<string, unknown>>(row: T): NullToUndefined<T> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) out[k] = v === null ? undefined : v
  return out as NullToUndefined<T>
}

/** Fetch one group row (throws a 404-shaped error when missing). */
async function getGroupRow(groupId: string) {
  const rows = await db().select().from(T.groups).where(eq(T.groups.id, groupId))
  return rows.length > 0 ? (cleanRow(rows[0]) as unknown as ResearchGroup) : null
}

/** All user rows as a lookup map (group enrichment, roster resolution). */
async function getUserMap(): Promise<Map<string, DbUser>> {
  const rows = await db().select().from(T.users)
  return new Map(rows.map((r) => [r.id, cleanRow(r) as unknown as DbUser]))
}

export type DbUser = {
  id: string
  name: string
  displayName: string
  username: string
  email: string
  passwordHash: string
  salt: string
  initials: string
  color: string
  role: string
  /** Custom avatar image URL (uploaded on the Account page). Absent = initials. */
  avatarUrl?: string
  /** Free-text bio (200 chars max). Shown on the public profile. */
  bio?: string
  /** Connections/groups section visibility. Undefined = public; false = owner-only. */
  showConnections?: boolean
  showGroups?: boolean
  /** Split name fields (migrated from the legacy full-name value). */
  firstName?: string
  lastName?: string
  /** Private per-user UI preferences (view modes). Never exposed publicly. */
  preferences?: UserPreferences
  activeGroupId?: string | null
  createdAt: string
}

export type SafeUser = Omit<DbUser, "passwordHash" | "salt">

export type PublicUser = {
  id: string
  username: string
  displayName: string
  name: string
  initials: string
  color: string
  role: string
  avatarUrl?: string
  bio?: string
  createdAt: string
  firstName?: string
  lastName?: string
}

export type DbSession = {
  token: string
  userId: string
  expiresAt: number
  createdAt: string
}

export type ConnectionStatus = "pending" | "accepted"

export type UserConnection = {
  id: string
  requesterId: string
  recipientId: string
  status: ConnectionStatus
  createdAt: string
  updatedAt: string
}

export type EnrichedConnection = UserConnection & {
  otherUser: PublicUser
  isOutgoing: boolean
}

export type GroupMemberRole = "owner" | "member"

export type GroupMember = {
  userId: string
  role: GroupMemberRole
  joinedAt: string
}

export type ResearchGroup = {
  id: string
  name: string
  description?: string
  /** The actual research title the group is working on (required; backfilled). */
  researchTitle: string
  ownerId: string
  leader: string
  members: GroupMember[]
  /** Invite-link token (unique, generated on first Share). Absent = never shared. */
  inviteToken?: string
  /** Whether the invite link currently accepts new join requests. Default false. */
  inviteEnabled?: boolean
  createdAt: string
  updatedAt: string
}

export type EnrichedGroupMember = GroupMember & {
  user: PublicUser
}

export type EnrichedGroup = Omit<ResearchGroup, "members"> & {
  members: EnrichedGroupMember[]
  memberCount: number
  isOwner: boolean
  isLeader: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// GROUP-SCOPED RESEARCH DATA
// Every record belongs to exactly one research group (`groupId`) so that all
// group members share the same chapters, tasks, sources, and activity feed.
// `createdBy` tracks the authoring user for attribution/display only ("created
// by User A") — it is NEVER used for access control. Reads and writes are
// authorized by group membership alone.
// ─────────────────────────────────────────────────────────────────────────────

export type DbChapter = {
  id: string
  groupId: string
  label: string
  title: string
  description?: string
  status: string
  progress: number
  sectionsComplete: number
  sectionsTotal: number
  sources: number
  assigned: string[]
  updated: string
  iconName?: string
  colorTag?: string
  files?: { name: string; size: number; url?: string; storedName?: string; blobUrl?: string }[]
  /** Attached URL (mutually exclusive with uploaded files). */
  attachmentUrl?: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type DbTask = {
  id: string
  groupId: string
  title: string
  chapter: string
  /** Linked chapter ID — stable attribution key for task-derived chapter progress. */
  chapterId?: string
  status: string
  assignee: string
  dueDate?: string
  /** Optional free-text detail — shown only on the task detail page. */
  description?: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type DbFolder = {
  id: string
  groupId: string
  name: string
  createdBy: string
  createdAt: string
  updatedAt: string
  /** Who can access: "everyone" (default), "mine" (owner only), "selected". */
  access?: AccessLevel
  /** Member user IDs for "selected" (owner always included implicitly). */
  allowedIds?: string[]
  /** Total bytes of files inside the viewer may access (list responses only). */
  totalSize?: number
}

export type DbFile = {
  id: string
  groupId: string
  folderId: string
  name: string
  size: number
  mimeType: string
  storedName: string
  /** Vercel Blob URL for the bytes (replaces local disk reads). */
  blobUrl?: string
  uploadedBy: string
  createdAt: string
  /** Who can access: "everyone" (default), "mine" (owner only), "selected". */
  access?: AccessLevel
  /** Member user IDs for "selected" (owner always included implicitly). */
  allowedIds?: string[]
}

export type AccessLevel = "everyone" | "mine" | "selected"

export type DbSource = {
  id: string
  groupId: string
  title: string
  author: string
  year: number
  tags: string[]
  usedIn: string[]
  cited: boolean
  /** Reference link for the source itself (used by auto-fill and summaries). */
  url?: string
  /** Associated chapters — array of chapter IDs (multi-select, unlike Task.chapter). */
  chapterIds: string[]
  /**
   * Attached upload files (mutually exclusive with attachmentUrl).
   * Distinct from `url`: these are the group's own copies, served via /api/files.
   */
  files?: { name: string; size: number; url?: string; storedName?: string; blobUrl?: string }[]
  /** Attached URL (mutually exclusive with uploaded files). */
  attachmentUrl?: string
  /** Source type driving deterministic APA 7 formatting. */
  sourceType?: string
  /** Stored APA 7 citation (HTML, generated on demand — never auto-built). */
  apaCitation?: string
  /** Field snapshot the stored citation was generated from (staleness check). */
  apaInputs?: { title: string; author: string; year: number | null; sourceType: string }
  /** AI-generated summary (plain text, on demand only — never auto-built). */
  summary?: string
  /** Content snapshot the stored summary was generated from (staleness check). */
  summaryInputs?: { url: string | null; title: string }
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type DbActivity = {
  id: string
  groupId: string
  /** Acting user id (attribution only — never used for access control) */
  memberId: string
  /** Display name snapshotted at log time so it survives member list changes */
  memberName: string
  memberInitials: string
  action: string
  target: string
  time: string
  createdAt: string
  /**
   * Optional link to a research folder/file. Activity reads filter entries
   * whose linked item the requester can no longer access.
   */
  ref?: { kind: "folder" | "file"; id: string }
}

export type NotificationKind =
  | "added_to_group"
  | "removed_from_group"
  | "connection_accepted"
  | "connection_request"
  | "task_assigned"
  | "deadline_approaching"
  | "deadline_passed"

export type DbNotification = {
  id: string
  /** Recipient user id. */
  userId: string
  kind: NotificationKind
  title: string
  body: string
  groupId?: string
  groupName?: string
  taskId?: string
  taskTitle?: string
  actorId?: string
  actorName?: string
  createdAt: string
  readAt?: string
}

export type DbJoinRequest = {
  id: string
  groupId: string
  userId: string
  status: "pending" | "accepted" | "declined"
  createdAt: string
}

export type AuthStore = {
  users: DbUser[]
  sessions: DbSession[]
  connections: UserConnection[]
  groups: ResearchGroup[]
  joinRequests: DbJoinRequest[]
  chapters: DbChapter[]
  tasks: DbTask[]
  sources: DbSource[]
  folders: DbFolder[]
  files: DbFile[]
  activities: DbActivity[]
  notifications: DbNotification[]
}

export const SESSION_COOKIE_NAME = "et_alicite_session"

const AVATAR_COLORS = [
  "bg-[oklch(0.58_0.16_260)]",
  "bg-[oklch(0.72_0.09_290)]",
  "bg-[oklch(0.68_0.13_155)]",
  "bg-[oklch(0.8_0.08_240)]",
  "bg-[oklch(0.78_0.12_75)]",
]

export function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0 || !parts[0]) return "U"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function pickAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export function generateUsername(name: string, email?: string): string {
  if (email) {
    const prefix = email.split("@")[0].toLowerCase().replace(/[^a-z0-9_.]/g, "_")
    if (prefix.length >= 3) return prefix
  }
  const cleanName = name.toLowerCase().replace(/[^a-z0-9_.]/g, "_").replace(/_+/g, "_")
  return cleanName || "user"
}

// (No seed accounts: fresh databases start empty and users sign up.
// The one-shot migration script imports existing local JSON data.)
function hashPasswordWithSalt(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex")
}

function generateSalt(): string {
  return crypto.randomBytes(16).toString("hex")
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex")
}

export function toSafeUser(user: DbUser): SafeUser {
  const { passwordHash: _, salt: __, ...safe } = user
  const composed = [(user.firstName ?? "").trim(), (user.lastName ?? "").trim()]
    .filter(Boolean)
    .join(" ")
  const displayName = composed || safe.displayName || safe.name || "User"
  return {
    ...safe,
    displayName,
    name: composed || safe.name || displayName,
    username: safe.username || generateUsername(displayName, safe.email),
    activeGroupId: safe.activeGroupId ?? null,
  }
}

export function toPublicUser(user: DbUser | SafeUser): PublicUser {
  const composed = [(user.firstName ?? "").trim(), ("lastName" in user ? (user.lastName ?? "") : "").trim()]
    .filter(Boolean)
    .join(" ")
  const displayName = composed || user.displayName || user.name || "User"
  return {
    id: user.id,
    username: user.username || generateUsername(displayName, "email" in user ? user.email : ""),
    displayName,
    name: displayName,
    initials: user.initials,
    color: user.color,
    role: user.role,
    avatarUrl: user.avatarUrl || undefined,
    bio: user.bio || undefined,
    createdAt: user.createdAt,
    firstName: (user.firstName ?? "").trim() || undefined,
    lastName: ("lastName" in user ? (user.lastName ?? "") : "").trim() || undefined,
  }
}

export async function enrichGroup(
  group: ResearchGroup,
  currentUserId: string,
  userMap?: Map<string, DbUser>
): Promise<EnrichedGroup> {
  if (!userMap) {
    userMap = await getUserMap()
  }

  const members: EnrichedGroupMember[] = group.members.map((m) => {
    const db = userMap!.get(m.userId)
    const user: PublicUser = db
      ? toPublicUser(db)
      : {
          id: m.userId,
          username: "unknown",
          displayName: "Unknown User",
          name: "Unknown User",
          initials: "U",
          color: "bg-muted",
          role: "Researcher",
          createdAt: new Date(0).toISOString(),
        }
    return {
      ...m,
      user,
    }
  })

  const leaderId = group.leader || group.ownerId

  return {
    ...group,
    leader: leaderId,
    members,
    memberCount: members.length,
    isOwner: group.ownerId === currentUserId,
    isLeader: leaderId === currentUserId,
  }
}

// (No seed accounts: fresh databases start empty and users sign up.
// The one-shot migration script imports existing local JSON data.)

// Persistence now lives in Neon Postgres (see ./db.ts + ./schema.ts).
// The JSON-file store, its auto-migrations, and seed accounts are gone:
// fresh databases start empty and the migration script imports old data.

export async function findUserByEmail(email: string): Promise<DbUser | null> {
  const normalized = email.trim().toLowerCase()
  const rows = await db().select().from(T.users)
  return (
    (rows.map((r) => cleanRow(r) as unknown as DbUser)).find(
      (u) => u.email.toLowerCase() === normalized
    ) ?? null
  )
}

export async function findUserById(id: string): Promise<DbUser | null> {
  const rows = await db().select().from(T.users).where(eq(T.users.id, id))
  return rows.length > 0 ? (cleanRow(rows[0]) as unknown as DbUser) : null
}

export async function findUserByUsername(username: string): Promise<DbUser | null> {
  const normalized = username.trim().toLowerCase()
  const rows = await db().select().from(T.users)
  return (
    (rows.map((r) => cleanRow(r) as unknown as DbUser)).find(
      (u) => (u.username || "").toLowerCase() === normalized
    ) ?? null
  )
}

export async function registerUser(
  firstName: string,
  lastName: string,
  email: string,
  password: string,
  role = "Researcher",
  customUsername?: string
): Promise<{ ok: true; user: SafeUser } | { ok: false; error: string }> {
  const trimmedFirst = firstName.trim()
  const trimmedLast = lastName.trim()
  const normalizedEmail = email.trim().toLowerCase()

  if (!trimmedFirst) {
    return { ok: false, error: "Please enter your first name." }
  }
  if (!trimmedLast) {
    return { ok: false, error: "Please enter your last name." }
  }
  const trimmedName = `${trimmedFirst} ${trimmedLast}`
  if (trimmedName.length < 2) {
    return { ok: false, error: "Name must be at least 2 characters long." }
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(normalizedEmail)) {
    return { ok: false, error: "Please enter a valid email address." }
  }

  if (password.length < 6) {
    return { ok: false, error: "Password must be at least 6 characters long." }
  }

  const existing = await findUserByEmail(normalizedEmail)
  if (existing) {
    return { ok: false, error: "An account with that email already exists." }
  }

  const allUsers = (
    await db().select().from(T.users)
  ).map((r) => cleanRow(r) as unknown as DbUser)
  const usernameTaken = (name: string) =>
    allUsers.some((u) => (u.username || "").toLowerCase() === name)

  let finalUsername: string
  if (customUsername && customUsername.trim()) {
    finalUsername = customUsername.trim().toLowerCase()
    if (!/^[a-z0-9_.-]{3,30}$/.test(finalUsername)) {
      return { ok: false, error: "Username must be 3-30 characters and contain only letters, numbers, underscores, dashes, or dots." }
    }
    if (usernameTaken(finalUsername)) {
      return { ok: false, error: "That username is already taken." }
    }
  } else {
    let candidate = generateUsername(trimmedName, normalizedEmail)
    let suffix = 1
    while (usernameTaken(candidate)) {
      candidate = `${candidate}_${suffix++}`
    }
    finalUsername = candidate
  }

  const salt = generateSalt()
  const passwordHash = hashPasswordWithSalt(password, salt)
  const id = `user_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`

  const newUser: DbUser = {
    id,
    name: trimmedName,
    displayName: trimmedName,
    firstName: trimmedFirst,
    lastName: trimmedLast,
    username: finalUsername,
    email: normalizedEmail,
    passwordHash,
    salt,
    initials: computeInitials(trimmedName),
    color: pickAvatarColor(trimmedName),
    role,
    activeGroupId: null,
    createdAt: new Date().toISOString(),
  }

  await db().insert(T.users).values({
    id: newUser.id,
    email: newUser.email,
    passwordHash: newUser.passwordHash,
    salt: newUser.salt,
    name: newUser.name,
    displayName: newUser.displayName,
    username: newUser.username,
    initials: newUser.initials,
    color: newUser.color,
    role: newUser.role,
    firstName: newUser.firstName,
    lastName: newUser.lastName,
    activeGroupId: newUser.activeGroupId,
    createdAt: newUser.createdAt,
  })

  return { ok: true, user: toSafeUser(newUser) }
}

export async function verifyCredentials(
  email: string,
  password: string
): Promise<{ ok: true; user: SafeUser } | { ok: false; error: string }> {
  const normalizedEmail = email.trim().toLowerCase()
  const user = await findUserByEmail(normalizedEmail)

  if (!user) {
    return { ok: false, error: "Wrong email/password." }
  }

  const computedHash = hashPasswordWithSalt(password, user.salt)
  const isMatch = crypto.timingSafeEqual(
    Buffer.from(computedHash, "hex"),
    Buffer.from(user.passwordHash, "hex")
  )

  if (!isMatch) {
    return { ok: false, error: "Wrong email/password." }
  }

  return { ok: true, user: toSafeUser(user) }
}

export async function createSession(userId: string): Promise<DbSession> {
  // 30 days session expiry
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000
  const token = generateToken()

  // Clean up any old expired sessions
  const now = Date.now()
  const stale = await db().select().from(T.sessions)
  for (const s of stale) {
    if (s.expiresAt <= now) {
      await db().delete(T.sessions).where(eq(T.sessions.token, s.token))
    }
  }

  const session: DbSession = {
    token,
    userId,
    expiresAt,
    createdAt: new Date().toISOString(),
  }

  await db().insert(T.sessions).values(session)

  return session
}

export async function getSessionUser(token: string): Promise<SafeUser | null> {
  if (!token) return null
  const now = Date.now()

  const rows = await db().select().from(T.sessions).where(eq(T.sessions.token, token))
  const session = rows.length > 0 ? rows[0] : null
  if (!session || session.expiresAt <= now) return null

  const user = await findUserById(session.userId)
  if (!user) return null

  return toSafeUser(user)
}

export async function destroySession(token: string): Promise<void> {
  if (!token) return
  await db().delete(T.sessions).where(eq(T.sessions.token, token))
}

export async function getAllSafeUsers(): Promise<SafeUser[]> {
  const rows = await db().select().from(T.users)
  return rows.map((r) => toSafeUser(cleanRow(r) as unknown as DbUser))
}

/**
 * Set (or clear, with null) the caller's custom avatar URL. Group member
 * entries resolve live via enrichGroup → toPublicUser, so no fan-out is
 * needed — every surface picks the new avatar up on its next fetch.
 * Accepts Vercel Blob URLs (new uploads) and legacy /api/avatars/
 * references (pre-migration data).
 */
export async function setUserAvatar(
  userId: string,
  avatarUrl: string | null
): Promise<{ ok: true; user: SafeUser } | { ok: false; error: string; status?: number }> {
  const user = await findUserById(userId)
  if (!user) return { ok: false, error: "User not found.", status: 404 }
  if (avatarUrl !== null) {
    const legacy = /^\/api\/avatars\/avatar_[A-Za-z0-9._-]+\.(png|jpe?g|webp)$/.test(avatarUrl)
    if (!legacy && !isBlobUrl(avatarUrl)) {
      return { ok: false, error: "Invalid avatar reference.", status: 400 }
    }
  }
  const previous = user.avatarUrl
  await db()
    .update(T.users)
    .set({ avatarUrl: avatarUrl || null })
    .where(eq(T.users.id, userId))
  // Best-effort cleanup of the replaced Blob (never fails the update).
  if (previous && previous !== avatarUrl && isBlobUrl(previous)) {
    await deleteBlob(previous)
  }
  const updated = await findUserById(userId)
  if (!updated) return { ok: false, error: "User not found.", status: 404 }
  return { ok: true, user: toSafeUser(updated) }
}

export const PROFILE_BIO_MAX = 200

/**
 * Merge per-user UI preferences (Home section view modes + list sorts).
 * Unknown sections and non list/grid values are dropped, never stored;
 * sort entries need a sane lowercase key and an asc/desc direction.
 */
export async function setUserPreferences(
  userId: string,
  input: { views?: Partial<Record<string, string>>; sorts?: Partial<Record<string, unknown>> }
): Promise<{ ok: true; user: SafeUser } | { ok: false; error: string; status?: number }> {
  const user = await findUserById(userId)
  if (!user) return { ok: false, error: "User not found.", status: 404 }
  const clean: Partial<Record<ViewSectionKey, ViewMode>> = {}
  if (input.views && typeof input.views === "object") {
    for (const section of VIEW_SECTIONS) {
      const value = (input.views as Record<string, unknown>)[section]
      if (value === "list" || value === "grid") clean[section] = value
    }
  }
  const cleanSorts: Partial<Record<SortScope, SectionSort>> = {}
  if (input.sorts && typeof input.sorts === "object") {
    for (const section of SORT_SCOPES) {
      const entry = (input.sorts as Record<string, unknown>)[section]
      if (entry && typeof entry === "object") {
        const { key, dir } = entry as { key?: unknown; dir?: unknown }
        if (
          typeof key === "string" &&
          /^[a-z]{1,16}$/.test(key) &&
          (dir === "asc" || dir === "desc")
        ) {
          cleanSorts[section] = { key, dir: dir as SortDirection }
        }
      }
    }
  }
  const preferences: UserPreferences = {
    ...(user.preferences ?? {}),
    views: { ...(user.preferences?.views ?? {}), ...clean },
    sorts: { ...(user.preferences?.sorts ?? {}), ...cleanSorts },
  }
  await db().update(T.users).set({ preferences }).where(eq(T.users.id, userId))
  const updated = await findUserById(userId)
  if (!updated) return { ok: false, error: "User not found.", status: 404 }
  return { ok: true, user: toSafeUser(updated) }
}

/**
 * Update the caller's public-profile fields (bio + section visibility).
 * Bio is trimmed and capped at 200 characters, enforced here.
 */
export async function setUserProfile(
  userId: string,
  input: {
    bio?: string | null
    showConnections?: boolean
    showGroups?: boolean
    displayName?: string
    username?: string
    role?: string
    firstName?: string
    lastName?: string
  }
): Promise<{ ok: true; user: SafeUser } | { ok: false; error: string; status?: number }> {
  const user = await findUserById(userId)
  if (!user) return { ok: false, error: "User not found.", status: 404 }
  const patch: {
    bio?: string | null
    showConnections?: boolean
    showGroups?: boolean
    displayName?: string
    username?: string
    role?: string
    firstName?: string
    lastName?: string
    name?: string
    initials?: string
  } = {}
  if (input.bio !== undefined) {
    const bio = typeof input.bio === "string" ? input.bio.trim() : ""
    if (bio.length > PROFILE_BIO_MAX) {
      return { ok: false, error: "Bio must be 200 characters or fewer.", status: 400 }
    }
    patch.bio = bio || null
  }
  if (typeof input.showConnections === "boolean") patch.showConnections = input.showConnections
  if (typeof input.showGroups === "boolean") patch.showGroups = input.showGroups
  let composed: string | null = null
  let composedInitials = user.initials
  if (input.firstName !== undefined || input.lastName !== undefined) {
    const current = splitName(user.displayName || user.name || "")
    const first = input.firstName !== undefined ? input.firstName.trim() : (user.firstName ?? current.firstName)
    const last = input.lastName !== undefined ? input.lastName.trim() : (user.lastName ?? current.lastName)
    if (!first) {
      return { ok: false, error: "First name is required.", status: 400 }
    }
    composed = last ? `${first} ${last}` : first
    patch.firstName = first
    patch.lastName = last
    patch.displayName = composed
    patch.name = composed
    composedInitials = computeInitials(composed)
    patch.initials = composedInitials
  } else if (input.displayName !== undefined) {
    const name = typeof input.displayName === "string" ? input.displayName.trim() : ""
    if (name.length < 2) {
      return { ok: false, error: "Name must be at least 2 characters long.", status: 400 }
    }
    composed = name
    patch.displayName = name
    patch.name = name
    composedInitials = computeInitials(name)
    patch.initials = composedInitials
    // Legacy path: keep the split fields in sync via the migration rule.
    const split = splitName(name)
    patch.firstName = split.firstName
    patch.lastName = split.lastName
  }
  if (input.username !== undefined) {
    const username = typeof input.username === "string" ? input.username.trim().toLowerCase() : ""
    if (!/^[a-z0-9_.-]{3,30}$/.test(username)) {
      return {
        ok: false,
        error: "Username must be 3-30 characters and contain only letters, numbers, underscores, dashes, or dots.",
        status: 400,
      }
    }
    const allUsers = (
      await db().select().from(T.users)
    ).map((r) => cleanRow(r) as unknown as DbUser)
    const taken = allUsers.some(
      (u) => u.id !== userId && (u.username || "").toLowerCase() === username
    )
    if (taken) {
      return { ok: false, error: "That username is already taken.", status: 400 }
    }
    patch.username = username
  }
  if (input.role !== undefined) {
    if (input.role !== user.role && !ROLE_VALUES.includes(input.role)) {
      return { ok: false, error: "Please choose a role from the list.", status: 400 }
    }
    patch.role = input.role
  }
  if (Object.keys(patch).length > 0) {
    await db().update(T.users).set(patch).where(eq(T.users.id, userId))
  }
  if (composed !== null) {
    const previousName = user.displayName || user.name || ""
    if (composed !== previousName) {
      // Rename backfill: refresh name snapshots on this member's own groups
      // only — entries elsewhere (departed groups) keep their history.
      const groupRows = await db().select().from(T.groups)
      for (const g of groupRows) {
        const members = (g.members ?? []) as GroupMember[]
        const onRoster =
          g.ownerId === userId || members.some((m) => m.userId === userId)
        if (!onRoster) continue
        const acts = await db()
          .select()
          .from(T.activities)
          .where(and(eq(T.activities.groupId, g.id), eq(T.activities.memberId, userId)))
        for (const a of acts) {
          await db()
            .update(T.activities)
            .set({ memberName: composed, memberInitials: composedInitials })
            .where(eq(T.activities.id, a.id))
        }
      }
    }
  }
  const updated = await findUserById(userId)
  if (!updated) return { ok: false, error: "User not found.", status: 404 }
  return { ok: true, user: toSafeUser(updated) }
}

/** Groups the user belongs to (owner or member) — names only for profiles. */
export async function getUserGroups(userId: string): Promise<{ id: string; name: string }[]> {
  const rows = await db().select().from(T.groups)
  return rows
    .filter(
      (g) => g.ownerId === userId || ((g.members ?? []) as GroupMember[]).some((m) => m.userId === userId)
    )
    .map((g) => ({ id: g.id, name: g.name }))
}

export type AssignedTask = DbTask & { groupName: string }

/**
 * Every task assigned to the user across ALL groups they belong to.
 * Membership is inherent (only member groups are scanned), so no groupId
 * is needed — the same access rule as every other endpoint, applied per
 * group instead of per call.
 */
export async function getAssignedTasks(userId: string): Promise<AssignedTask[]> {
  const [groupRows, taskRows] = await Promise.all([
    db().select().from(T.groups),
    db().select().from(T.tasks),
  ])
  const out: AssignedTask[] = []
  for (const g of groupRows) {
    const members = (g.members ?? []) as GroupMember[]
    if (g.ownerId !== userId && !members.some((m) => m.userId === userId)) continue
    for (const t of taskRows) {
      if (t.groupId === g.id && t.assignee === userId) {
        out.push({ ...(cleanRow(t) as unknown as DbTask), groupName: g.name })
      }
    }
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH & PRIVACY
// ─────────────────────────────────────────────────────────────────────────────

export async function searchUsers(query: string, currentUserId: string): Promise<PublicUser[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const rows = await db().select().from(T.users)
  return rows
    .map((r) => cleanRow(r) as unknown as DbUser)
    .filter((u) => {
      if (u.id === currentUserId) return false
      const matchUsername = (u.username || "").toLowerCase().includes(q)
      const matchFirst = (u.firstName || "").toLowerCase().includes(q)
      const matchLast = (u.lastName || "").toLowerCase().includes(q)
      const matchDisplayName = (u.displayName || u.name || "").toLowerCase().includes(q)
      return matchUsername || matchFirst || matchLast || matchDisplayName
    })
    .map(toPublicUser)
}

// ─────────────────────────────────────────────────────────────────────────────
// CONNECTIONS
// ─────────────────────────────────────────────────────────────────────────────

export async function sendConnectionRequest(
  requesterId: string,
  recipientId: string
): Promise<{ ok: true; connection: UserConnection } | { ok: false; error: string; status?: number }> {
  if (requesterId === recipientId) {
    return { ok: false, error: "You cannot connect with yourself.", status: 400 }
  }

  const recipient = await findUserById(recipientId)
  if (!recipient) {
    return { ok: false, error: "User not found.", status: 404 }
  }

  // Check if connection already exists in either direction
  const connRows = await db().select().from(T.connections)
  const existing = (
    connRows.map((r) => cleanRow(r) as unknown as UserConnection)
  ).find(
    (c) =>
      (c.requesterId === requesterId && c.recipientId === recipientId) ||
      (c.requesterId === recipientId && c.recipientId === requesterId)
  )

  if (existing) {
    if (existing.status === "accepted") {
      return { ok: false, error: "You are already connected with this user.", status: 400 }
    }
    if (existing.requesterId === requesterId) {
      return { ok: false, error: "Connection request already sent and pending.", status: 400 }
    }
    // Recipient had previously sent a request to requester: auto-accept
    const now = new Date().toISOString()
    await db()
      .update(T.connections)
      .set({ status: "accepted", updatedAt: now })
      .where(eq(T.connections.id, existing.id))
    const autoAccepter = await findUserById(requesterId)
    await createNotification({
      userId: existing.requesterId,
      kind: "connection_accepted",
      title: "Collaboration request accepted",
      body: `${displayUserName(autoAccepter ?? undefined)} accepted your collaboration request.`,
      actorId: requesterId,
      actorName: autoAccepter ? displayUserName(autoAccepter) : undefined,
    })
    return { ok: true, connection: { ...existing, status: "accepted", updatedAt: now } }
  }

  const now = new Date().toISOString()
  const newConn: UserConnection = {
    id: `conn_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
    requesterId,
    recipientId,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  }

  await db().insert(T.connections).values(newConn)
  const requester = await findUserById(requesterId)
  await createNotification({
    userId: recipientId,
    kind: "connection_request",
    title: "New collaboration request",
    body: `${displayUserName(requester ?? undefined)} wants to collaborate with you.`,
    actorId: requesterId,
    actorName: requester ? displayUserName(requester) : undefined,
  })
  return { ok: true, connection: newConn }
}

export async function respondToConnectionRequest(
  connectionId: string,
  userId: string,
  action: "accept" | "decline"
): Promise<{ ok: true; connection?: UserConnection } | { ok: false; error: string; status?: number }> {
  const rows = await db().select().from(T.connections).where(eq(T.connections.id, connectionId))
  if (rows.length === 0) {
    return { ok: false, error: "Connection request not found.", status: 404 }
  }

  const conn = cleanRow(rows[0]) as unknown as UserConnection

  if (action === "accept") {
    if (conn.recipientId !== userId) {
      return { ok: false, error: "Only the recipient can accept this connection request.", status: 403 }
    }
    const now = new Date().toISOString()
    await db()
      .update(T.connections)
      .set({ status: "accepted", updatedAt: now })
      .where(eq(T.connections.id, connectionId))
    const accepter = await findUserById(userId)
    await createNotification({
      userId: conn.requesterId,
      kind: "connection_accepted",
      title: "Collaboration request accepted",
      body: `${displayUserName(accepter ?? undefined)} accepted your collaboration request.`,
      actorId: userId,
      actorName: accepter ? displayUserName(accepter) : undefined,
    })
    return { ok: true, connection: { ...conn, status: "accepted", updatedAt: now } }
  }

  if (action === "decline") {
    if (conn.recipientId !== userId && conn.requesterId !== userId) {
      return { ok: false, error: "Not authorized to modify this connection.", status: 403 }
    }
    await db().delete(T.connections).where(eq(T.connections.id, connectionId))
    return { ok: true }
  }

  return { ok: false, error: "Invalid action. Must be 'accept' or 'decline'.", status: 400 }
}

export async function getUserConnections(userId: string, statusFilter?: ConnectionStatus): Promise<EnrichedConnection[]> {
  const userMap = await getUserMap()
  const rows = await db().select().from(T.connections)

  return (
    rows.map((r) => cleanRow(r) as unknown as UserConnection)
    .filter((c) => {
      const isPart = c.requesterId === userId || c.recipientId === userId
      if (!isPart) return false
      if (statusFilter && c.status !== statusFilter) return false
      return true
    })
    .map((c) => {
      const isOutgoing = c.requesterId === userId
      const otherId = isOutgoing ? c.recipientId : c.requesterId
      const otherDb = userMap.get(otherId)
      const otherUser: PublicUser = otherDb
        ? toPublicUser(otherDb)
        : {
            id: otherId,
            username: "unknown",
            displayName: "Unknown User",
            name: "Unknown User",
            initials: "U",
            color: "bg-muted",
            role: "Researcher",
            createdAt: new Date(0).toISOString(),
          }
      return {
        ...c,
        isOutgoing,
        otherUser,
      }
    })
  )
}

export async function getAcceptedConnectionUserIds(userId: string): Promise<Set<string>> {
  const rows = await db().select().from(T.connections)
  const connectedIds = new Set<string>()
  for (const c of rows) {
    if (c.status === "accepted") {
      if (c.requesterId === userId) connectedIds.add(c.recipientId)
      else if (c.recipientId === userId) connectedIds.add(c.requesterId)
    }
  }
  return connectedIds
}

export async function getAcceptedConnections(userId: string): Promise<PublicUser[]> {
  const connectedIds = await getAcceptedConnectionUserIds(userId)
  const rows = await db().select().from(T.users)
  return rows
    .map((r) => cleanRow(r) as unknown as DbUser)
    .filter((u) => connectedIds.has(u.id))
    .map(toPublicUser)
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS
// One record per event, addressed to exactly one recipient (userId). Events
// 1–5 are written at action time by the functions below; deadline events
// (6–7) are generated lazily on read from live task data, so no scheduler
// or duplicate store is needed.
// ─────────────────────────────────────────────────────────────────────────────

function displayUserName(user: DbUser | undefined): string {
  if (!user) return "Someone"
  return fullNameOf(user) || "Someone"
}

export async function createNotification(input: {
  userId: string
  kind: NotificationKind
  title: string
  body: string
  groupId?: string
  groupName?: string
  taskId?: string
  taskTitle?: string
  actorId?: string
  actorName?: string
}): Promise<DbNotification> {
  const now = new Date().toISOString()
  const notification: DbNotification = {
    id: `notif_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
    userId: input.userId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    groupId: input.groupId,
    groupName: input.groupName,
    taskId: input.taskId,
    taskTitle: input.taskTitle,
    actorId: input.actorId,
    actorName: input.actorName,
    createdAt: now,
  }
  await db().insert(T.notifications).values({
    id: notification.id,
    userId: notification.userId,
    kind: notification.kind,
    title: notification.title,
    body: notification.body,
    groupId: notification.groupId,
    groupName: notification.groupName,
    taskId: notification.taskId,
    taskTitle: notification.taskTitle,
    actorId: notification.actorId,
    actorName: notification.actorName,
    createdAt: notification.createdAt,
  })
  return notification
}

export async function getNotifications(userId: string): Promise<DbNotification[]> {
  const rows = await db()
    .select()
    .from(T.notifications)
    .where(eq(T.notifications.userId, userId))
    .orderBy(desc(T.notifications.createdAt))
  return rows.map((r) => cleanRow(r) as unknown as DbNotification)
}

export async function markNotificationRead(
  userId: string,
  notificationId: string,
  read: boolean
): Promise<{ ok: true; notification: DbNotification } | { ok: false; error: string; status: number }> {
  const rows = await db()
    .select()
    .from(T.notifications)
    .where(
      and(eq(T.notifications.id, notificationId), eq(T.notifications.userId, userId))
    )
  if (rows.length === 0) {
    return { ok: false, error: "Notification not found.", status: 404 }
  }
  const notification = cleanRow(rows[0]) as unknown as DbNotification
  const readAt = read ? (notification.readAt ?? new Date().toISOString()) : null
  await db()
    .update(T.notifications)
    .set({ readAt })
    .where(eq(T.notifications.id, notificationId))
  return { ok: true, notification: { ...notification, readAt: readAt ?? undefined } }
}

export async function markAllNotificationsRead(userId: string): Promise<{ ok: true; count: number }> {
  const rows = await db()
    .select()
    .from(T.notifications)
    .where(eq(T.notifications.userId, userId))
  const now = new Date().toISOString()
  let count = 0
  for (const r of rows) {
    if (!r.readAt) {
      await db()
        .update(T.notifications)
        .set({ readAt: now })
        .where(eq(T.notifications.id, r.id))
      count += 1
    }
  }
  return { ok: true, count }
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/**
 * Deadline events are derived from live data on every read: tasks assigned
 * to the user, not Completed, due within 3 days (approaching) or overdue
 * (passed). Missing unread records are created once; lapsed ones (done,
 * reassigned, deleted, or superseded approaching→passed) are auto-resolved
 * so the badge stays truthful without manual cleanup.
 */
export async function syncDeadlineNotifications(userId: string): Promise<void> {
  const [notifRows, taskRows, groupRows] = await Promise.all([
    db().select().from(T.notifications).where(eq(T.notifications.userId, userId)),
    db().select().from(T.tasks),
    db().select().from(T.groups),
  ])
  const existing = notifRows.map((r) => cleanRow(r) as unknown as DbNotification)
  const tasks = taskRows.map((r) => cleanRow(r) as unknown as DbTask)
  const groups = groupRows.map((r) => cleanRow(r) as unknown as ResearchGroup)
  const hasRecord = (kind: NotificationKind, taskId: string) =>
    existing.some((n) => n.userId === userId && n.kind === kind && n.taskId === taskId)
  const resolveKind = async (kind: NotificationKind, taskId: string): Promise<boolean> => {
    let changed = false
    for (const n of existing) {
      if (n.userId === userId && n.kind === kind && n.taskId === taskId && !n.readAt) {
        await db()
          .update(T.notifications)
          .set({ readAt: new Date().toISOString() })
          .where(eq(T.notifications.id, n.id))
        n.readAt = new Date().toISOString()
        changed = true
      }
    }
    return changed
  }
  {
    const now = new Date().toISOString()
    const today = startOfDay(new Date())
    const liveTaskIds = new Set<string>()
    for (const t of tasks) {
      if (t.assignee !== userId || !t.dueDate || t.status === "Completed") continue
      const due = new Date(`${t.dueDate}T00:00:00`)
      if (Number.isNaN(due.getTime())) continue
      liveTaskIds.add(t.id)
      const group = groups.find((g) => g.id === t.groupId)
      const days = Math.round((startOfDay(due).getTime() - today.getTime()) / 86400000)
      const base = {
        userId,
        groupId: t.groupId,
        groupName: group?.name,
        taskId: t.id,
        taskTitle: t.title,
      }
      if (days < 0) {
        await resolveKind("deadline_approaching", t.id)
        if (!hasRecord("deadline_passed", t.id)) {
          await createNotification({
            kind: "deadline_passed",
            title: "Deadline passed",
            body: `“${t.title}” was due ${Math.abs(days) === 1 ? "yesterday" : `${Math.abs(days)} days ago`}.`,
            ...base,
          })
          existing.push({ ...base, id: "", kind: "deadline_passed", title: "", body: "", createdAt: now })
        }
      } else if (days <= 3) {
        if (!hasRecord("deadline_approaching", t.id)) {
          await createNotification({
            kind: "deadline_approaching",
            title: "Deadline approaching",
            body:
              days === 0
                ? `“${t.title}” is due today.`
                : `“${t.title}” is due in ${days} day${days === 1 ? "" : "s"}.`,
            ...base,
          })
          existing.push({ ...base, id: "", kind: "deadline_approaching", title: "", body: "", createdAt: now })
        }
      } else {
        await resolveKind("deadline_approaching", t.id)
      }
    }
    // Tasks gone from the user's plate resolve all their deadline records.
    for (const n of existing) {
      if (
        n.userId === userId &&
        (n.kind === "deadline_approaching" || n.kind === "deadline_passed") &&
        !n.readAt &&
        n.taskId &&
        !liveTaskIds.has(n.taskId) &&
        n.id
      ) {
        await db()
          .update(T.notifications)
          .set({ readAt: now })
          .where(eq(T.notifications.id, n.id))
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RESEARCH GROUPS
// ─────────────────────────────────────────────────────────────────────────────

export async function createResearchGroup(
  ownerId: string,
  name: string,
  description?: string,
  memberIds: string[] = [],
  researchTitle?: string
): Promise<{ ok: true; group: EnrichedGroup } | { ok: false; error: string; status?: number }> {
  const trimmedName = name.trim()
  if (!trimmedName) {
    return { ok: false, error: "Group name is required.", status: 400 }
  }

  const trimmedTitle = (researchTitle ?? "").trim()
  if (!trimmedTitle) {
    return { ok: false, error: "Research title is required.", status: 400 }
  }

  const owner = await findUserById(ownerId)
  if (!owner) {
    return { ok: false, error: "Owner user not found.", status: 404 }
  }

  // Enforce accepted connections constraint: All invited members must have an accepted connection with the owner
  const acceptedIds = await getAcceptedConnectionUserIds(ownerId)
  const cleanMemberIds = Array.from(new Set(memberIds)).filter((id) => id !== ownerId)

  const allUsers = (
    await db().select().from(T.users)
  ).map((r) => cleanRow(r) as unknown as DbUser)
  for (const mId of cleanMemberIds) {
    const candidate = allUsers.find((u) => u.id === mId)
    if (!candidate) {
      return { ok: false, error: `User with ID ${mId} not found.`, status: 400 }
    }
    if (!acceptedIds.has(mId)) {
      const candidateName = candidate.displayName || candidate.name || mId
      return {
        ok: false,
        error: `Cannot add ${candidateName}: members must be accepted connections.`,
        status: 400,
      }
    }
  }

  const now = new Date().toISOString()
  const newGroup: ResearchGroup = {
    id: `grp_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
    name: trimmedName,
    description: description?.trim() || undefined,
    researchTitle: trimmedTitle,
    ownerId,
    leader: ownerId,
    members: [
      { userId: ownerId, role: "owner", joinedAt: now },
      ...cleanMemberIds.map((id) => ({
        userId: id,
        role: "member" as GroupMemberRole,
        joinedAt: now,
      })),
    ],
    createdAt: now,
    updatedAt: now,
  }

  await db().insert(T.groups).values({
    id: newGroup.id,
    name: newGroup.name,
    description: newGroup.description ?? null,
    researchTitle: newGroup.researchTitle,
    ownerId: newGroup.ownerId,
    leader: newGroup.leader,
    members: newGroup.members,
    createdAt: newGroup.createdAt,
    updatedAt: newGroup.updatedAt,
  })

  // If owner doesn't currently have an active group, automatically set this one
  if (owner && !owner.activeGroupId) {
    await db()
      .update(T.users)
      .set({ activeGroupId: newGroup.id })
      .where(eq(T.users.id, ownerId))
  }

  for (const mId of cleanMemberIds) {
    await createNotification({
      userId: mId,
      kind: "added_to_group",
      title: "Added to research group",
      body: `${owner ? displayUserName(owner) : "Someone"} added you to “${trimmedName}”.`,
      groupId: newGroup.id,
      groupName: trimmedName,
      actorId: ownerId,
      actorName: owner ? displayUserName(owner) : undefined,
    })
  }
  return { ok: true, group: await enrichGroup(newGroup, ownerId) }
}

export async function getUserResearchGroups(userId: string): Promise<EnrichedGroup[]> {
  const userMap = await getUserMap()
  const rows = await db().select().from(T.groups)
  const out: EnrichedGroup[] = []
  for (const r of rows) {
    const g = cleanRow(r) as unknown as ResearchGroup
    if (g.members.some((m) => m.userId === userId)) {
      out.push(await enrichGroup(g, userId, userMap))
    }
  }
  return out
}

export async function getResearchGroupById(groupId: string): Promise<ResearchGroup | null> {
  return getGroupRow(groupId)
}

export async function getActiveGroupForUser(userId: string): Promise<{
  activeGroupId: string | null
  activeGroup: EnrichedGroup | null
}> {
  const user = await findUserById(userId)
  if (!user) {
    return { activeGroupId: null, activeGroup: null }
  }

  const rows = await db().select().from(T.groups)
  const userGroups = rows
    .map((r) => cleanRow(r) as unknown as ResearchGroup)
    .filter((g) => g.members.some((m) => m.userId === userId))

  // If user has an explicit active group and is still a member:
  if (user.activeGroupId) {
    const matched = userGroups.find((g) => g.id === user.activeGroupId)
    if (matched) {
      return {
        activeGroupId: matched.id,
        activeGroup: await enrichGroup(matched, userId),
      }
    }
  }

  // Fallback to the first group user belongs to, if any
  if (userGroups.length > 0) {
    const first = userGroups[0]
    return {
      activeGroupId: first.id,
      activeGroup: await enrichGroup(first, userId),
    }
  }

  return { activeGroupId: null, activeGroup: null }
}

export async function setActiveGroupForUser(
  userId: string,
  groupId: string | null
): Promise<{ ok: true; activeGroupId: string | null; activeGroup: EnrichedGroup | null } | { ok: false; error: string; status?: number }> {
  const user = await findUserById(userId)
  if (!user) {
    return { ok: false, error: "User not found.", status: 404 }
  }

  if (groupId === null) {
    await db().update(T.users).set({ activeGroupId: null }).where(eq(T.users.id, userId))
    return { ok: true, activeGroupId: null, activeGroup: null }
  }

  const group = await getGroupRow(groupId)
  if (!group) {
    return { ok: false, error: "Research group not found.", status: 404 }
  }

  const isMember = group.members.some((m) => m.userId === userId)
  if (!isMember) {
    return { ok: false, error: "You are not a member of this research group.", status: 403 }
  }

  await db().update(T.users).set({ activeGroupId: groupId }).where(eq(T.users.id, userId))

  return {
    ok: true,
    activeGroupId: groupId,
    activeGroup: await enrichGroup(group, userId),
  }
}

export async function deleteResearchGroup(
  groupId: string,
  requestingUserId: string
): Promise<{
  ok: true
  activeGroupId: string | null
  activeGroup: EnrichedGroup | null
  deletedGroupId: string
} | {
  ok: false
  error: string
  status?: number
}> {
  const group = await getGroupRow(groupId)
  if (!group) {
    return { ok: false, error: "Research group not found.", status: 404 }
  }

  const groupLeader = group.leader || group.ownerId
  if (groupLeader !== requestingUserId) {
    return {
      ok: false,
      error: "Only the group leader can delete this group",
      status: 403,
    }
  }

  // Hard delete the group from database
  await db().delete(T.groups).where(eq(T.groups.id, groupId))

  // Cascade: remove all group-scoped research data so deleted groups leave
  // no orphaned chapters, tasks, sources, folders, files, or activity
  // entries behind. Research-file bytes are deleted from Blob too.
  const removedFiles = await db().select().from(T.files).where(eq(T.files.groupId, groupId))
  await db().delete(T.chapters).where(eq(T.chapters.groupId, groupId))
  await db().delete(T.tasks).where(eq(T.tasks.groupId, groupId))
  await db().delete(T.sources).where(eq(T.sources.groupId, groupId))
  await db().delete(T.folders).where(eq(T.folders.groupId, groupId))
  await db().delete(T.files).where(eq(T.files.groupId, groupId))
  await db().delete(T.activities).where(eq(T.activities.groupId, groupId))
  await db().delete(T.joinRequests).where(eq(T.joinRequests.groupId, groupId))

  for (const f of removedFiles) {
    const row = cleanRow(f) as unknown as DbFile
    if (row.blobUrl) await deleteBlob(row.blobUrl)
  }

  // Reassign activeGroupId for any user whose active group was this deleted group
  const userRows = await db().select().from(T.users)
  const users = userRows.map((r) => cleanRow(r) as unknown as DbUser)
  const groupRows = await db().select().from(T.groups)
  const remaining = groupRows.map((r) => cleanRow(r) as unknown as ResearchGroup)
  for (const user of users) {
    if (user.activeGroupId === groupId) {
      const remainingUserGroups = remaining.filter((g) =>
        g.members.some((m) => m.userId === user.id)
      )
      await db()
        .update(T.users)
        .set({ activeGroupId: remainingUserGroups.length > 0 ? remainingUserGroups[0].id : null })
        .where(eq(T.users.id, user.id))
    }
  }

  // Determine the new active group state for the requesting user
  const reassignment = await getActiveGroupForUser(requestingUserId)

  return {
    ok: true,
    deletedGroupId: groupId,
    activeGroupId: reassignment.activeGroupId,
    activeGroup: reassignment.activeGroup,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UPLOADED FILES (chapter attachments stored under data/uploads)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Locate an uploaded file by its stored name across chapter AND source
 * attachments. Used by the file-serving endpoint to resolve the owning
 * group (for membership checks) and the original filename.
 */
export async function findUploadedFile(
  storedName: string
): Promise<{ groupId: string; name: string; blobUrl?: string } | null> {
  const [chapterRows, sourceRows] = await Promise.all([
    db().select().from(T.chapters),
    db().select().from(T.sources),
  ])
  for (const c of chapterRows) {
    const files = (c.files ?? []) as { name: string; storedName?: string; blobUrl?: string }[]
    const f = files.find((x) => x.storedName === storedName)
    if (f) return { groupId: c.groupId, name: f.name, blobUrl: f.blobUrl }
  }
  for (const s of sourceRows) {
    const files = (s.files ?? []) as { name: string; storedName?: string; blobUrl?: string }[]
    const f = files.find((x) => x.storedName === storedName)
    if (f) return { groupId: s.groupId, name: f.name, blobUrl: f.blobUrl }
  }
  return null
}

export async function isGroupMember(userId: string, groupId: string): Promise<boolean> {
  const group = await getGroupRow(groupId)
  return !!group && group.members.some((m) => m.userId === userId)
}

export type GroupUpdateInput = {
  name?: string
  /** Empty string clears the description. */
  description?: string
  /** When provided, must be non-empty (research title is required). */
  researchTitle?: string
  addMemberIds?: string[]
  removeMemberIds?: string[]
}

/**
 * Update a research group's name/description/membership. Leader-only —
 * same check as group deletion. Member content (chapters, tasks, sources,
 * activities) is keyed by groupId and is NEVER touched here: removed
 * members keep their attribution in group history.
 */
export async function updateResearchGroup(
  requestingUserId: string,
  groupId: string,
  input: GroupUpdateInput
): Promise<{ ok: true; group: EnrichedGroup } | { ok: false; error: string; status?: number }> {
  const group = await getGroupRow(groupId)
  if (!group) {
    return { ok: false, error: "Research group not found.", status: 404 }
  }

  // Leader-only — same check as group deletion.
  const groupLeader = group.leader || group.ownerId
  if (groupLeader !== requestingUserId) {
    return {
      ok: false,
      error: "Only the group leader can edit this group",
      status: 403,
    }
  }

  if (input.name !== undefined) {
    const trimmed = input.name.trim()
    if (!trimmed) {
      return { ok: false, error: "Group name cannot be empty.", status: 400 }
    }
    group.name = trimmed
  }

  if (input.description !== undefined) {
    const trimmed = (input.description ?? "").trim()
    group.description = trimmed || undefined
  }

  if (input.researchTitle !== undefined) {
    const trimmed = (input.researchTitle ?? "").trim()
    if (!trimmed) {
      return { ok: false, error: "Research title cannot be empty.", status: 400 }
    }
    group.researchTitle = trimmed
  }

  // Removals: the leader cannot remove themselves (leaving / transferring
  // leadership is a separate feature). Removed members' content stays in
  // group history — records are keyed by groupId, not membership.
  const removeIds = Array.from(new Set(input.removeMemberIds ?? []))
  if (removeIds.includes(requestingUserId)) {
    return {
      ok: false,
      error: "The leader cannot remove themselves from the group.",
      status: 400,
    }
  }
  if (removeIds.length > 0) {
    group.members = group.members.filter((m) => !removeIds.includes(m.userId))
    // Dropped members lose every "selected" grant in this group.
    const removed = new Set(removeIds)
    const [folderRows, fileRows] = await Promise.all([
      db().select().from(T.folders).where(eq(T.folders.groupId, group.id)),
      db().select().from(T.files).where(eq(T.files.groupId, group.id)),
    ])
    for (const f of folderRows) {
      const allowed = (f.allowedIds ?? []) as string[]
      if (!allowed.length) continue
      const kept = allowed.filter((id) => !removed.has(id))
      if (kept.length !== allowed.length) {
        await db().update(T.folders).set({ allowedIds: kept }).where(eq(T.folders.id, f.id))
      }
    }
    for (const f of fileRows) {
      const allowed = (f.allowedIds ?? []) as string[]
      if (!allowed.length) continue
      const kept = allowed.filter((id) => !removed.has(id))
      if (kept.length !== allowed.length) {
        await db().update(T.files).set({ allowedIds: kept }).where(eq(T.files.id, f.id))
      }
    }
  }

  // Additions: same accepted-connections rule as group creation, checked
  // against the editing leader. Already-present members are skipped.
  const currentIds = new Set(group.members.map((m) => m.userId))
  const addIds = Array.from(new Set(input.addMemberIds ?? [])).filter(
    (id) => id !== requestingUserId && !currentIds.has(id)
  )
  if (addIds.length > 0) {
    const acceptedIds = await getAcceptedConnectionUserIds(requestingUserId)
    for (const aid of addIds) {
      const candidate = await findUserById(aid)
      if (!candidate) {
        return { ok: false, error: `User with ID ${aid} not found.`, status: 400 }
      }
      if (!acceptedIds.has(aid)) {
        const candidateName = candidate.displayName || candidate.name || aid
        return {
          ok: false,
          error: `Cannot add ${candidateName}: members must be accepted connections.`,
          status: 400,
        }
      }
    }
    const now = new Date().toISOString()
    for (const aid of addIds) {
      group.members.push({ userId: aid, role: "member" as GroupMemberRole, joinedAt: now })
      currentIds.add(aid)
    }
  }

  group.updatedAt = new Date().toISOString()
  await db()
    .update(T.groups)
    .set({
      name: group.name,
      description: group.description ?? null,
      researchTitle: group.researchTitle,
      members: group.members,
      updatedAt: group.updatedAt,
    })
    .where(eq(T.groups.id, group.id))

  // Membership notifications go out after the write above.
  const leader = await findUserById(requestingUserId)
  for (const rid of removeIds) {
    await createNotification({
      userId: rid,
      kind: "removed_from_group",
      title: "Removed from research group",
      body: `You were removed from “${group.name}”.`,
      groupId: group.id,
      groupName: group.name,
      actorId: requestingUserId,
      actorName: leader ? displayUserName(leader) : undefined,
    })
  }
  for (const aid of addIds) {
    await createNotification({
      userId: aid,
      kind: "added_to_group",
      title: "Added to research group",
      body: `${leader ? displayUserName(leader) : "Someone"} added you to “${group.name}”.`,
      groupId: group.id,
      groupName: group.name,
      actorId: requestingUserId,
      actorName: leader ? displayUserName(leader) : undefined,
    })
  }

  const userMap = await getUserMap()
  return { ok: true, group: await enrichGroup(group, requestingUserId, userMap) }
}

// ─────────────────────────────────────────────────────────────────────────────
// GROUP INVITE LINKS + JOIN REQUESTS
// Anyone with a group's invite link can request to join without being a
// connection of the leader. Joining via invite creates NO connection —
// the new member is group-members-only ("Not connected" elsewhere), and
// every collaboration surface (assignee dropdown, task attribution,
// activity) keys off group membership alone, so nothing assumes otherwise.
// ─────────────────────────────────────────────────────────────────────────────

export type InviteInfo = { token: string; enabled: boolean; linkPath: string }

/**
 * Leader-only. Returns the group's invite token, generating a unique
 * random one on first use (later calls return the same token).
 */
export async function getOrGenerateInviteToken(
  userId: string,
  groupId: string
): Promise<{ ok: true; invite: InviteInfo } | { ok: false; error: string; status: number }> {
  const leadership = await requireGroupLeader(groupId, userId)
  if (!leadership.ok) return leadership
  const group = leadership.group
  if (!group.inviteToken) {
    const groupRows = await db().select().from(T.groups)
    const taken = new Set(
      groupRows.map((g) => g.inviteToken).filter((t): t is string => !!t)
    )
    let token = ""
    do {
      token = crypto.randomBytes(16).toString("hex")
    } while (taken.has(token))
    group.inviteToken = token
    taken.add(token)
    group.updatedAt = new Date().toISOString()
    await db()
      .update(T.groups)
      .set({ inviteToken: token, updatedAt: group.updatedAt })
      .where(eq(T.groups.id, group.id))
  }
  return {
    ok: true,
    invite: {
      token: group.inviteToken,
      enabled: group.inviteEnabled === true,
      linkPath: `/join/${group.inviteToken}`,
    },
  }
}

/**
 * Leader-only. Enables/disables the group's invite link. Disabling stops
 * new requests; existing pending requests are left untouched.
 */
export async function setInviteEnabled(
  userId: string,
  groupId: string,
  enabled: boolean
): Promise<{ ok: true; enabled: boolean } | { ok: false; error: string; status: number }> {
  const leadership = await requireGroupLeader(groupId, userId)
  if (!leadership.ok) return leadership
  leadership.group.inviteEnabled = enabled
  leadership.group.updatedAt = new Date().toISOString()
  await db()
    .update(T.groups)
    .set({ inviteEnabled: enabled, updatedAt: leadership.group.updatedAt })
    .where(eq(T.groups.id, groupId))
  return { ok: true, enabled }
}

export type EnrichedJoinRequest = {
  id: string
  groupId: string
  createdAt: string
  user: PublicUser
}

/**
 * Leader-only. Lists pending join requests with requester profiles.
 * Non-leaders get the 403 from requireGroupLeader (never the list).
 */
export async function listJoinRequests(
  userId: string,
  groupId: string
): Promise<{ ok: true; requests: EnrichedJoinRequest[] } | { ok: false; error: string; status: number }> {
  const leadership = await requireGroupLeader(groupId, userId)
  if (!leadership.ok) return leadership
  const reqRows = await db().select().from(T.joinRequests).where(eq(T.joinRequests.groupId, groupId))
  const requests: EnrichedJoinRequest[] = []
  for (const r of reqRows) {
    if (r.status !== "pending") continue
    const requester = await findUserById(r.userId)
    if (!requester) continue
    requests.push({ id: r.id, groupId: r.groupId, createdAt: r.createdAt, user: toPublicUser(requester) })
  }
  return { ok: true, requests }
}

/**
 * Leader-only. Accepts (adds as a real member WITHOUT requiring a
 * connection, then logs activity) or declines (marks declined) a request.
 */
export async function resolveJoinRequest(
  userId: string,
  groupId: string,
  requestId: string,
  action: "accept" | "decline"
): Promise<
  | { ok: true; request: DbJoinRequest }
  | { ok: false; error: string; status: number }> {
  const leadership = await requireGroupLeader(groupId, userId)
  if (!leadership.ok) return leadership
  const group = leadership.group
  const reqRows = await db()
    .select()
    .from(T.joinRequests)
    .where(
      and(
        eq(T.joinRequests.id, requestId),
        eq(T.joinRequests.groupId, groupId),
        eq(T.joinRequests.status, "pending")
      )
    )
  if (reqRows.length === 0) {
    return { ok: false, error: "Join request not found.", status: 404 }
  }
  const request = cleanRow(reqRows[0]) as unknown as DbJoinRequest
  if (action !== "accept" && action !== "decline") {
    return { ok: false, error: "Action must be 'accept' or 'decline'.", status: 400 }
  }
  const requester = await findUserById(request.userId)
  if (!requester) {
    return { ok: false, error: "Requesting user not found.", status: 404 }
  }
  const now = new Date().toISOString()
  if (action === "decline") {
    await db()
      .update(T.joinRequests)
      .set({ status: "declined" })
      .where(eq(T.joinRequests.id, requestId))
    return { ok: true, request: { ...request, status: "declined" } }
  }
  const members = [...group.members]
  if (!members.some((m) => m.userId === requester.id)) {
    members.push({ userId: requester.id, role: "member" as GroupMemberRole, joinedAt: now })
  }
  await db().update(T.joinRequests).set({ status: "accepted" }).where(eq(T.joinRequests.id, requestId))
  await db()
    .update(T.groups)
    .set({ members, updatedAt: now })
    .where(eq(T.groups.id, group.id))
  // Same member-added notification as the edit-group path, then a Recent
  // activity entry (no ref → visible to every member under standard rules).
  const leader = await findUserById(userId)
  await createNotification({
    userId: requester.id,
    kind: "added_to_group",
    title: "Added to research group",
    body: `${leader ? displayUserName(leader) : "Someone"} accepted your request to join “${group.name}”.`,
    groupId: group.id,
    groupName: group.name,
    actorId: userId,
    actorName: leader ? displayUserName(leader) : undefined,
  })
  await logGroupActivity(userId, group.id, {
    action: "accepted join request from",
    target: displayUserName(requester),
  })
  return { ok: true, request: { ...request, status: "accepted" } }
}

export type InviteResolution =
  | { status: "member" | "pending" | "requested"; group: { id: string; name: string; researchTitle: string } }

/**
 * Any signed-in user. Validates the token, reports already-member /
 * already-pending, otherwise creates a pending JoinRequest. Never creates
 * a connection between the requester and the leader.
 */
export async function resolveInviteToken(
  userId: string,
  token: string
): Promise<{ ok: true; resolution: InviteResolution } | { ok: false; error: string; status: number }> {
  const requester = await findUserById(userId)
  if (!requester) return { ok: false, error: "User not found.", status: 404 }
  const groupRows = await db().select().from(T.groups)
  const groupRow = groupRows.find((g) => g.inviteToken === token)
  if (!groupRow) {
    return { ok: false, error: "This invite link is invalid.", status: 404 }
  }
  const group = cleanRow(groupRow) as unknown as ResearchGroup
  if (group.inviteEnabled !== true) {
    return { ok: false, error: "This invite link is disabled.", status: 403 }
  }
  const publicGroup = { id: group.id, name: group.name, researchTitle: group.researchTitle }
  if (group.members.some((m) => m.userId === userId)) {
    return { ok: true, resolution: { status: "member", group: publicGroup } }
  }
  const reqRows = await db().select().from(T.joinRequests)
  const existing = reqRows.find(
    (r) => r.groupId === group.id && r.userId === userId && r.status === "pending"
  )
  if (existing) {
    return { ok: true, resolution: { status: "pending", group: publicGroup } }
  }
  const request: DbJoinRequest = {
    id: newResearchId("jr"),
    groupId: group.id,
    userId,
    status: "pending",
    createdAt: new Date().toISOString(),
  }
  await db().insert(T.joinRequests).values(request)
  return { ok: true, resolution: { status: "requested", group: publicGroup } }
}

// ─────────────────────────────────────────────────────────────────────────────
// GROUP-SCOPED RESEARCH DATA (chapters, tasks, sources, activities)
// Access control = group membership. `createdBy` is attribution only.
// ─────────────────────────────────────────────────────────────────────────────

type MembershipCheck =
  | { ok: true; group: ResearchGroup }
  | { ok: false; error: string; status: number }

async function requireGroupMembership(
  groupId: string,
  userId: string
): Promise<MembershipCheck> {
  const group = await getGroupRow(groupId)
  if (!group) {
    return { ok: false, error: "Research group not found.", status: 404 }
  }
  const isMember = group.members.some((m) => m.userId === userId)
  if (!isMember) {
    return { ok: false, error: "You are not a member of this research group.", status: 403 }
  }
  return { ok: true, group }
}

/**
 * Research tasks are leader-managed: only the group leader
 * (group.leader, falling back to ownerId — same rule as group deletion)
 * may create, update, or delete them. Members have read access.
 */
async function requireGroupLeader(
  groupId: string,
  userId: string
): Promise<MembershipCheck> {
  const membership = await requireGroupMembership(groupId, userId)
  if (!membership.ok) return membership
  const leaderId = membership.group.leader || membership.group.ownerId
  if (leaderId !== userId) {
    return { ok: false, error: "Only the group leader can manage research tasks.", status: 403 }
  }
  return { ok: true, group: membership.group }
}

function newResearchId(prefix: string): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`
}

// ── Chapters ─────────────────────────────────────────────────────────────────

export type ChapterInput = {
  label: string
  title: string
  description?: string
  status?: string
  progress?: number
  sectionsComplete?: number
  sectionsTotal?: number
  sources?: number
  assigned?: string[]
  updated?: string
  iconName?: string
  colorTag?: string
  files?: { name: string; size: number; url?: string; storedName?: string }[]
  attachmentUrl?: string
}

export async function getGroupChapters(
  userId: string,
  groupId: string
): Promise<{ ok: true; chapters: DbChapter[] } | { ok: false; error: string; status: number }> {
  const membership = await requireGroupMembership(groupId, userId)
  if (!membership.ok) return membership
  const rows = await db().select().from(T.chapters).where(eq(T.chapters.groupId, groupId))
  return {
    ok: true,
    chapters: rows.map((r) => cleanRow(r) as unknown as DbChapter),
  }
}

export async function createGroupChapter(
  userId: string,
  groupId: string,
  input: ChapterInput
): Promise<{ ok: true; chapter: DbChapter } | { ok: false; error: string; status: number }> {
  if (!input.title || !input.title.trim()) {
    return { ok: false, error: "Chapter title is required.", status: 400 }
  }
  const membership = await requireGroupMembership(groupId, userId)
  if (!membership.ok) return membership
  const now = new Date().toISOString()
  const chapter: DbChapter = {
    id: newResearchId("ch"),
    groupId,
    label: input.label || "Chapter",
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    status: input.status || "In progress",
    progress: input.progress ?? 0,
    sectionsComplete: input.sectionsComplete ?? 0,
    sectionsTotal: input.sectionsTotal ?? 0,
    sources: input.sources ?? 0,
    assigned: Array.isArray(input.assigned) ? input.assigned : [],
    updated: input.updated || "Just now",
    iconName: input.iconName || undefined,
    colorTag: input.colorTag || undefined,
    files: (() => {
      const url = typeof input.attachmentUrl === "string" ? input.attachmentUrl.trim() : ""
      // Mutually exclusive: an attached URL wins, uploaded files are dropped.
      if (url) return undefined
      return Array.isArray(input.files)
        ? input.files.map((f) => ({
            name: String(f.name || "file"),
            size: Number(f.size) || 0,
            url: typeof f.url === "string" && f.url.trim() ? f.url.trim() : undefined,
            storedName: typeof f.storedName === "string" && f.storedName.trim() ? f.storedName.trim() : undefined,
            blobUrl: typeof (f as unknown as { blobUrl?: unknown }).blobUrl === "string" ? (f as unknown as { blobUrl: string }).blobUrl : undefined,
          }))
        : undefined
    })(),
    attachmentUrl: (() => {
      const url = typeof input.attachmentUrl === "string" ? input.attachmentUrl.trim() : ""
      return url || undefined
    })(),
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  }
  await db().insert(T.chapters).values({
    id: chapter.id,
    groupId: chapter.groupId,
    label: chapter.label,
    title: chapter.title,
    description: chapter.description ?? null,
    status: chapter.status,
    progress: chapter.progress,
    sectionsComplete: chapter.sectionsComplete,
    sectionsTotal: chapter.sectionsTotal,
    sources: chapter.sources,
    assigned: chapter.assigned,
    updated: chapter.updated,
    iconName: chapter.iconName ?? null,
    colorTag: chapter.colorTag ?? null,
    files: chapter.files ?? null,
    attachmentUrl: chapter.attachmentUrl ?? null,
    createdBy: chapter.createdBy,
    createdAt: chapter.createdAt,
    updatedAt: chapter.updatedAt,
  })
  return { ok: true, chapter }
}

export type ChapterPatch = Partial<
  Pick<
    DbChapter,
    | "label"
    | "title"
    | "description"
    | "status"
    | "progress"
    | "sectionsComplete"
    | "sectionsTotal"
    | "sources"
    | "assigned"
    | "updated"
    | "iconName"
    | "colorTag"
    | "files"
    | "attachmentUrl"
  >
>

export async function updateGroupChapter(
  userId: string,
  groupId: string,
  chapterId: string,
  patch: ChapterPatch
): Promise<{ ok: true; chapter: DbChapter } | { ok: false; error: string; status: number }> {
  const membership = await requireGroupMembership(groupId, userId)
  if (!membership.ok) return membership
  const rows = await db()
    .select()
    .from(T.chapters)
    .where(and(eq(T.chapters.id, chapterId), eq(T.chapters.groupId, groupId)))
  if (rows.length === 0) {
    return { ok: false, error: "Chapter not found in this group.", status: 404 }
  }
  const chapter = cleanRow(rows[0]) as unknown as DbChapter
  if (patch.title !== undefined) {
    if (!patch.title.trim()) {
      return { ok: false, error: "Chapter title cannot be empty.", status: 400 }
    }
    chapter.title = patch.title.trim()
  }
  if (patch.label !== undefined) chapter.label = patch.label
  if (patch.description !== undefined) chapter.description = patch.description?.trim() || undefined
  if (patch.status !== undefined) chapter.status = patch.status
  if (patch.progress !== undefined) chapter.progress = patch.progress
  if (patch.sectionsComplete !== undefined) chapter.sectionsComplete = patch.sectionsComplete
  if (patch.sectionsTotal !== undefined) chapter.sectionsTotal = patch.sectionsTotal
  if (patch.sources !== undefined) chapter.sources = patch.sources
  if (patch.assigned !== undefined) chapter.assigned = patch.assigned
  if (patch.updated !== undefined) chapter.updated = patch.updated
  if (patch.iconName !== undefined) chapter.iconName = patch.iconName || undefined
  if (patch.colorTag !== undefined) chapter.colorTag = patch.colorTag || undefined
  if (patch.files !== undefined) {
    chapter.files = patch.files
    // Uploading files clears any attached URL (mutually exclusive).
    if (Array.isArray(patch.files) && patch.files.length > 0) {
      chapter.attachmentUrl = undefined
    }
  }
  if (patch.attachmentUrl !== undefined) {
    const url = (patch.attachmentUrl ?? "").trim()
    // Mutually exclusive: setting a URL drops uploaded files and vice versa.
    chapter.attachmentUrl = url || undefined
    if (url) chapter.files = undefined
  }
  chapter.updatedAt = new Date().toISOString()
  await db()
    .update(T.chapters)
    .set({
      label: chapter.label,
      title: chapter.title,
      description: chapter.description ?? null,
      status: chapter.status,
      progress: chapter.progress,
      sectionsComplete: chapter.sectionsComplete,
      sectionsTotal: chapter.sectionsTotal,
      sources: chapter.sources,
      assigned: chapter.assigned,
      updated: chapter.updated,
      iconName: chapter.iconName ?? null,
      colorTag: chapter.colorTag ?? null,
      files: chapter.files ?? null,
      attachmentUrl: chapter.attachmentUrl ?? null,
      updatedAt: chapter.updatedAt,
    })
    .where(eq(T.chapters.id, chapterId))
  return { ok: true, chapter }
}

/**
 * Bump a chapter's updatedAt when its attached sources or attributed
 * tasks change (creation, edits, deletion, link changes). Field edits
 * already refresh updatedAt in updateGroupChapter itself.
 */
async function touchChapter(
  groupId: string,
  chapterId: string | undefined,
  now: string
): Promise<void> {
  if (!chapterId) return
  await db()
    .update(T.chapters)
    .set({ updatedAt: now })
    .where(and(eq(T.chapters.id, chapterId), eq(T.chapters.groupId, groupId)))
}

export async function deleteGroupChapter(
  userId: string,
  groupId: string,
  chapterId: string
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const membership = await requireGroupMembership(groupId, userId)
  if (!membership.ok) return membership
  const rows = await db()
    .select()
    .from(T.chapters)
    .where(and(eq(T.chapters.id, chapterId), eq(T.chapters.groupId, groupId)))
  if (rows.length === 0) {
    return { ok: false, error: "Chapter not found in this group.", status: 404 }
  }
  await db()
    .delete(T.chapters)
    .where(and(eq(T.chapters.id, chapterId), eq(T.chapters.groupId, groupId)))
  // Unlink the deleted chapter from sources instead of deleting them:
  // remove its ID from every chapterIds array in the same group.
  const sourceRows = await db().select().from(T.sources).where(eq(T.sources.groupId, groupId))
  for (const s of sourceRows) {
    const ids = (s.chapterIds ?? []) as string[]
    if (Array.isArray(ids) && ids.includes(chapterId)) {
      await db()
        .update(T.sources)
        .set({ chapterIds: ids.filter((id) => id !== chapterId), updatedAt: new Date().toISOString() })
        .where(eq(T.sources.id, s.id))
    }
  }
  // Same treatment for tasks (consistent with source-unlinking): clear the
  // chapter link so no task keeps a dangling chapterId or a stale chapter
  // name. Tasks become unattributed, exactly as if never assigned.
  const taskRows = await db().select().from(T.tasks).where(eq(T.tasks.groupId, groupId))
  for (const t of taskRows) {
    if (t.chapterId === chapterId) {
      await db()
        .update(T.tasks)
        .set({ chapterId: null, chapter: "General", updatedAt: new Date().toISOString() })
        .where(eq(T.tasks.id, t.id))
    }
  }
  return { ok: true }
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export type TaskInput = {
  title: string
  chapter?: string
  chapterId?: string
  status?: string
  assignee?: string
  dueDate?: string
  description?: string
}

export async function getGroupTasks(
  userId: string,
  groupId: string
): Promise<{ ok: true; tasks: DbTask[] } | { ok: false; error: string; status: number }> {
  const membership = await requireGroupMembership(groupId, userId)
  if (!membership.ok) return membership
  const rows = await db().select().from(T.tasks).where(eq(T.tasks.groupId, groupId))
  return {
    ok: true,
    tasks: rows.map((r) => cleanRow(r) as unknown as DbTask),
  }
}

export async function createGroupTask(
  userId: string,
  groupId: string,
  input: TaskInput
): Promise<{ ok: true; task: DbTask } | { ok: false; error: string; status: number }> {
  if (!input.title || !input.title.trim()) {
    return { ok: false, error: "Task title is required.", status: 400 }
  }
  if (input.status !== undefined && !(TASK_STATUSES as readonly string[]).includes(input.status)) {
    return { ok: false, error: "Invalid task status. Must be 'To do', 'In progress', or 'Completed'.", status: 400 }
  }
  const membership = await requireGroupLeader(groupId, userId)
  if (!membership.ok) return membership
  const now = new Date().toISOString()
  const chapterTitle = input.chapter || "General"
  const chapterRows = await db().select().from(T.chapters).where(eq(T.chapters.groupId, groupId))
  const task: DbTask = {
    id: newResearchId("task"),
    groupId,
    title: input.title.trim(),
    chapter: chapterTitle,
    // Prefer an explicit chapterId; otherwise resolve the title against the
    // group's chapters so title-only writes still attribute correctly.
    chapterId:
      input.chapterId ||
      chapterRows.find((c) => c.title === chapterTitle)?.id ||
      undefined,
    status: input.status || "To do",
    assignee: input.assignee || userId,
    dueDate: input.dueDate || undefined,
    description: input.description?.trim() || undefined,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  }
  await db().insert(T.tasks).values({
    id: task.id,
    groupId: task.groupId,
    title: task.title,
    chapter: task.chapter,
    chapterId: task.chapterId ?? null,
    status: task.status,
    assignee: task.assignee,
    dueDate: task.dueDate ?? null,
    description: task.description ?? null,
    createdBy: task.createdBy,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  })
  await touchChapter(groupId, task.chapterId, now)
  const group = membership.group
  if (task.assignee && task.assignee !== userId) {
    const assigner = await findUserById(userId)
    await createNotification({
      userId: task.assignee,
      kind: "task_assigned",
      title: "New task assigned",
      body: `${assigner ? displayUserName(assigner) : "Someone"} assigned you “${task.title}”.`,
      groupId,
      groupName: group.name,
      taskId: task.id,
      taskTitle: task.title,
      actorId: userId,
      actorName: assigner ? displayUserName(assigner) : undefined,
    })
  }
  return { ok: true, task }
}

export async function updateGroupTask(
  userId: string,
  groupId: string,
  taskId: string,
  patch: Partial<Pick<DbTask, "title" | "chapter" | "chapterId" | "status" | "assignee" | "dueDate" | "description">>
): Promise<{ ok: true; task: DbTask } | { ok: false; error: string; status: number }> {
  // Status-only changes are allowed for every member (progress reporting);
  // anything else still requires the group leader.
  const touched = Object.keys(patch).filter(
    (k) => (patch as Record<string, unknown>)[k] !== undefined
  )
  const statusOnly = touched.length > 0 && touched.every((k) => k === "status")
  const membership = statusOnly
    ? await requireGroupMembership(groupId, userId)
    : await requireGroupLeader(groupId, userId)
  if (!membership.ok) return membership
  const rows = await db()
    .select()
    .from(T.tasks)
    .where(and(eq(T.tasks.id, taskId), eq(T.tasks.groupId, groupId)))
  if (rows.length === 0) {
    return { ok: false, error: "Task not found in this group.", status: 404 }
  }
  const task = cleanRow(rows[0]) as unknown as DbTask
  const oldChapterId = task.chapterId
  if (patch.title !== undefined) {
    if (!patch.title.trim()) {
      return { ok: false, error: "Task title cannot be empty.", status: 400 }
    }
    task.title = patch.title.trim()
  }
  if (patch.chapter !== undefined) task.chapter = patch.chapter
  if (patch.chapterId !== undefined) {
    task.chapterId = patch.chapterId || undefined
  } else if (patch.chapter !== undefined) {
    // Chapter retitled/reassigned by title alone — re-resolve the link so
    // task-derived chapter progress follows the rename.
    const chapterRows = await db().select().from(T.chapters).where(eq(T.chapters.groupId, groupId))
    task.chapterId =
      chapterRows.find((c) => c.title === patch.chapter)?.id ||
      undefined
  }
  if (patch.status !== undefined) {
    if (!(TASK_STATUSES as readonly string[]).includes(patch.status)) {
      return { ok: false, error: "Invalid task status. Must be 'To do', 'In progress', or 'Completed'.", status: 400 }
    }
    task.status = patch.status
  }
  const reassigned =
    patch.assignee !== undefined && patch.assignee !== task.assignee
      ? patch.assignee
      : null
  if (patch.assignee !== undefined) task.assignee = patch.assignee
  if (patch.dueDate !== undefined) task.dueDate = patch.dueDate || undefined
  if (patch.description !== undefined) task.description = patch.description?.trim() || undefined
  task.updatedAt = new Date().toISOString()
  await db()
    .update(T.tasks)
    .set({
      title: task.title,
      chapter: task.chapter,
      chapterId: task.chapterId ?? null,
      status: task.status,
      assignee: task.assignee,
      dueDate: task.dueDate ?? null,
      description: task.description ?? null,
      updatedAt: task.updatedAt,
    })
    .where(eq(T.tasks.id, taskId))
  // Any task change rolls up to its chapter(s): progress, counts, and the
  // "most recently updated" order all derive from attributed tasks.
  await touchChapter(groupId, oldChapterId, task.updatedAt)
  await touchChapter(groupId, task.chapterId, task.updatedAt)
  if (reassigned && reassigned !== userId) {
    const group = membership.group
    const assigner = await findUserById(userId)
    await createNotification({
      userId: reassigned,
      kind: "task_assigned",
      title: "New task assigned",
      body: `${assigner ? displayUserName(assigner) : "Someone"} assigned you “${task.title}”.`,
      groupId,
      groupName: group.name,
      taskId: task.id,
      taskTitle: task.title,
      actorId: userId,
      actorName: assigner ? displayUserName(assigner) : undefined,
    })
  }
  return { ok: true, task }
}

export async function deleteGroupTask(
  userId: string,
  groupId: string,
  taskId: string
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const membership = await requireGroupLeader(groupId, userId)
  if (!membership.ok) return membership
  const rows = await db()
    .select()
    .from(T.tasks)
    .where(and(eq(T.tasks.id, taskId), eq(T.tasks.groupId, groupId)))
  if (rows.length === 0) {
    return { ok: false, error: "Task not found in this group.", status: 404 }
  }
  const doomed = cleanRow(rows[0]) as unknown as DbTask
  await db()
    .delete(T.tasks)
    .where(and(eq(T.tasks.id, taskId), eq(T.tasks.groupId, groupId)))
  await touchChapter(groupId, doomed.chapterId, new Date().toISOString())
  return { ok: true }
}

// ── Sources ──────────────────────────────────────────────────────────────────

export type SourceInput = {
  title: string
  author?: string
  year?: number
  tags?: string[]
  usedIn?: string[]
  cited?: boolean
  url?: string
  chapterIds?: string[]
  files?: { name: string; size: number; url?: string; storedName?: string }[]
  attachmentUrl?: string
  sourceType?: string
  apaCitation?: string
  apaInputs?: { title: string; author: string; year: number | null; sourceType: string }
  summary?: string
  summaryInputs?: { url: string | null; title: string }
}

export async function getGroupSources(
  userId: string,
  groupId: string
): Promise<{ ok: true; sources: DbSource[] } | { ok: false; error: string; status: number }> {
  const membership = await requireGroupMembership(groupId, userId)
  if (!membership.ok) return membership
  const rows = await db().select().from(T.sources).where(eq(T.sources.groupId, groupId))
  return {
    ok: true,
    sources: rows.map((r) => cleanRow(r) as unknown as DbSource),
  }
}

export async function createGroupSource(
  userId: string,
  groupId: string,
  input: SourceInput
): Promise<{ ok: true; source: DbSource } | { ok: false; error: string; status: number }> {
  if (!input.title || !input.title.trim()) {
    return { ok: false, error: "Source title is required.", status: 400 }
  }
  const membership = await requireGroupMembership(groupId, userId)
  if (!membership.ok) return membership
  const now = new Date().toISOString()
  const source: DbSource = {
    id: newResearchId("src"),
    groupId,
    title: input.title.trim(),
    author: input.author?.trim() || "Unknown",
    year: Number(input.year) || new Date().getFullYear(),
    tags: Array.isArray(input.tags) ? input.tags : [],
    usedIn: Array.isArray(input.usedIn) ? input.usedIn : [],
    cited: input.cited ?? false,
    url: input.url?.trim() || undefined,
    chapterIds: await resolveChapterIds(groupId, input.chapterIds),
    files: (() => {
      const url = typeof input.attachmentUrl === "string" ? input.attachmentUrl.trim() : ""
      // Mutually exclusive: an attached URL wins, uploaded files are dropped.
      if (url) return undefined
      return Array.isArray(input.files)
        ? input.files.map((f) => ({
            name: String(f.name || "file"),
            size: Number(f.size) || 0,
            url: typeof f.url === "string" && f.url.trim() ? f.url.trim() : undefined,
            storedName: typeof f.storedName === "string" && f.storedName.trim() ? f.storedName.trim() : undefined,
            blobUrl: typeof (f as unknown as { blobUrl?: unknown }).blobUrl === "string" ? (f as unknown as { blobUrl: string }).blobUrl : undefined,
          }))
        : undefined
    })(),
    attachmentUrl: (() => {
      const url = typeof input.attachmentUrl === "string" ? input.attachmentUrl.trim() : ""
      return url || undefined
    })(),
    sourceType: typeof input.sourceType === "string" && input.sourceType.trim() ? input.sourceType.trim() : undefined,
    apaCitation: typeof input.apaCitation === "string" && input.apaCitation ? input.apaCitation : undefined,
    apaInputs: input.apaInputs && typeof input.apaInputs === "object" ? input.apaInputs : undefined,
    summary: typeof input.summary === "string" && input.summary.trim() ? input.summary : undefined,
    summaryInputs: input.summaryInputs && typeof input.summaryInputs === "object" ? input.summaryInputs : undefined,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  }
  await db().insert(T.sources).values({
    id: source.id,
    groupId: source.groupId,
    title: source.title,
    author: source.author,
    year: source.year,
    tags: source.tags,
    usedIn: source.usedIn,
    cited: source.cited,
    url: source.url ?? null,
    chapterIds: source.chapterIds,
    files: source.files ?? null,
    attachmentUrl: source.attachmentUrl ?? null,
    sourceType: source.sourceType ?? null,
    apaCitation: source.apaCitation ?? null,
    apaInputs: source.apaInputs ?? null,
    summary: source.summary ?? null,
    summaryInputs: source.summaryInputs ?? null,
    createdBy: source.createdBy,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  })
  for (const cid of source.chapterIds) await touchChapter(groupId, cid, now)
  return { ok: true, source }
}

/** Keep only chapter IDs that belong to the same workspace (group). */
async function resolveChapterIds(
  groupId: string,
  ids: unknown
): Promise<string[]> {
  if (!Array.isArray(ids)) return []
  const chapterRows = await db().select().from(T.chapters).where(eq(T.chapters.groupId, groupId))
  const valid = new Set(chapterRows.map((c) => c.id))
  return Array.from(
    new Set(ids.filter((id): id is string => typeof id === "string" && valid.has(id)))
  )
}

export async function updateGroupSource(
  userId: string,
  groupId: string,
  sourceId: string,
  patch: Partial<Pick<DbSource, "title" | "author" | "year" | "tags" | "usedIn" | "cited" | "url" | "chapterIds" | "files" | "attachmentUrl" | "sourceType" | "apaCitation" | "apaInputs" | "summary" | "summaryInputs">>
): Promise<{ ok: true; source: DbSource } | { ok: false; error: string; status: number }> {
  const membership = await requireGroupMembership(groupId, userId)
  if (!membership.ok) return membership
  const rows = await db()
    .select()
    .from(T.sources)
    .where(and(eq(T.sources.id, sourceId), eq(T.sources.groupId, groupId)))
  if (rows.length === 0) {
    return { ok: false, error: "Source not found in this group.", status: 404 }
  }
  const source = cleanRow(rows[0]) as unknown as DbSource
  if (patch.title !== undefined) {
    if (!patch.title.trim()) {
      return { ok: false, error: "Source title cannot be empty.", status: 400 }
    }
    source.title = patch.title.trim()
  }
  if (patch.author !== undefined) source.author = patch.author
  if (patch.year !== undefined) source.year = patch.year
  if (patch.tags !== undefined) source.tags = patch.tags
  if (patch.usedIn !== undefined) source.usedIn = patch.usedIn
  if (patch.cited !== undefined) source.cited = patch.cited
  if (patch.url !== undefined) source.url = patch.url || undefined
  if (patch.chapterIds !== undefined) {
    const oldChapterIds = source.chapterIds ?? []
    source.chapterIds = await resolveChapterIds(groupId, patch.chapterIds)
    // Link/unlink rolls up to every chapter on either side of the change.
    const touched = new Date().toISOString()
    for (const cid of new Set([...oldChapterIds, ...source.chapterIds])) {
      await touchChapter(groupId, cid, touched)
    }
  }
  if (patch.files !== undefined) {
    source.files = patch.files
    // Uploading files clears any attached URL (mutually exclusive).
    if (Array.isArray(patch.files) && patch.files.length > 0) {
      source.attachmentUrl = undefined
    }
  }
  if (patch.attachmentUrl !== undefined) {
    const url = (patch.attachmentUrl ?? "").trim()
    // Attaching a URL drops uploaded files (mutually exclusive).
    source.attachmentUrl = url || undefined
    if (url) source.files = undefined
  }
  if (patch.sourceType !== undefined) {
    source.sourceType = patch.sourceType?.trim() || undefined
  }
  if (patch.apaCitation !== undefined) {
    source.apaCitation = patch.apaCitation || undefined
  }
  if (patch.apaInputs !== undefined) {
    source.apaInputs = patch.apaInputs ?? undefined
  }
  if (patch.summary !== undefined) {
    source.summary = patch.summary?.trim() ? patch.summary : undefined
  }
  if (patch.summaryInputs !== undefined) {
    source.summaryInputs = patch.summaryInputs ?? undefined
  }
  source.updatedAt = new Date().toISOString()
  await db()
    .update(T.sources)
    .set({
      title: source.title,
      author: source.author,
      year: source.year,
      tags: source.tags,
      usedIn: source.usedIn,
      cited: source.cited,
      url: source.url ?? null,
      chapterIds: source.chapterIds,
      files: source.files ?? null,
      attachmentUrl: source.attachmentUrl ?? null,
      sourceType: source.sourceType ?? null,
      apaCitation: source.apaCitation ?? null,
      apaInputs: source.apaInputs ?? null,
      summary: source.summary ?? null,
      summaryInputs: source.summaryInputs ?? null,
      updatedAt: source.updatedAt,
    })
    .where(eq(T.sources.id, sourceId))
  return { ok: true, source }
}

export async function deleteGroupSource(
  userId: string,
  groupId: string,
  sourceId: string
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const membership = await requireGroupMembership(groupId, userId)
  if (!membership.ok) return membership
  const rows = await db()
    .select()
    .from(T.sources)
    .where(and(eq(T.sources.id, sourceId), eq(T.sources.groupId, groupId)))
  if (rows.length === 0) {
    return { ok: false, error: "Source not found in this group.", status: 404 }
  }
  const doomed = cleanRow(rows[0]) as unknown as DbSource
  await db()
    .delete(T.sources)
    .where(and(eq(T.sources.id, sourceId), eq(T.sources.groupId, groupId)))
  const now = new Date().toISOString()
  for (const cid of doomed.chapterIds ?? []) await touchChapter(groupId, cid, now)
  return { ok: true }
}

// ── Research files ─────────────────────────────────────────────────────────
// Group-scoped folders holding uploaded files of any type. Same conventions
// as chapters/tasks/sources: groupId for access, createdBy/uploadedBy for
// attribution only — plus per-item access levels ("everyone" / "mine" /
// "selected"). Renaming is creator-or-leader; access changes are strictly
// owner-only; delete is owner, or leader for accessible/ownerless items
// (see each function).
// ──────────────────────────────────────────────────────────────────────────

export const RESEARCH_FILE_MAX_BYTES = Math.floor(4.5 * 1024 * 1024)
export const RESEARCH_GROUP_QUOTA_BYTES = 100 * 1024 * 1024

function isGroupLeader(group: { leader?: string; ownerId: string }, userId: string): boolean {
  return (group.leader || group.ownerId) === userId
}

function memberIdsOf(group: { members: { userId: string }[] }): Set<string> {
  return new Set(group.members.map((m) => m.userId))
}

/**
 * Normalize an access setting: unknown levels fall back to "everyone",
 * and the selected list is scrubbed to current group members (deduped).
 */
function normalizeAccess(
  input: { access?: unknown; allowedIds?: unknown },
  group: { members: { userId: string }[] }
): { access: AccessLevel; allowedIds: string[] } {
  const access: AccessLevel =
    input.access === "mine" || input.access === "selected" ? input.access : "everyone"
  const members = memberIdsOf(group)
  const allowedIds =
    access === "selected" && Array.isArray(input.allowedIds)
      ? Array.from(new Set(input.allowedIds.filter((id) => typeof id === "string" && members.has(id))))
      : []
  return { access, allowedIds }
}

/**
 * Effective folder rule: the owner always accesses their own items.
 * If the owner left the group, the item hides from everyone except the
 * leader (who may still delete it). Otherwise "everyone" allows every
 * member, "mine" allows nobody else, and "selected" allows listed members.
 * Pure over already-fetched rows (no store reads).
 */
function canAccessFolder(
  group: Pick<ResearchGroup, "ownerId" | "members">,
  folder: Pick<DbFolder, "createdBy" | "access" | "allowedIds">,
  userId: string,
  isLeader: boolean
): boolean {
  if (folder.createdBy === userId) return true
  const creatorOnRoster =
    group.ownerId === folder.createdBy ||
    (group.members || []).some((m) => m.userId === folder.createdBy)
  if (!creatorOnRoster) return isLeader
  const access = folder.access ?? "everyone"
  if (access === "everyone") return true
  if (access === "mine") return false
  return (folder.allowedIds ?? []).includes(userId)
}

/**
 * Effective file rule: the viewer must access the containing folder AND
 * satisfy the file's own setting (owners always access their own items;
 * a leader sees ownerless items). A file in an inaccessible folder is
 * inaccessible even to its uploader.
 */
function canAccessFile(
  group: Pick<ResearchGroup, "ownerId" | "members">,
  folders: Pick<DbFolder, "id" | "createdBy" | "access" | "allowedIds">[],
  file: Pick<DbFile, "folderId" | "uploadedBy" | "access" | "allowedIds">,
  userId: string,
  isLeader: boolean
): boolean {
  const folder = folders.find((f) => f.id === file.folderId)
  if (!folder || !canAccessFolder(group, folder, userId, isLeader)) return false
  if (file.uploadedBy === userId) return true
  const uploaderOnRoster =
    group.ownerId === file.uploadedBy ||
    (group.members || []).some((m) => m.userId === file.uploadedBy)
  if (!uploaderOnRoster) return isLeader
  const access = file.access ?? "everyone"
  if (access === "everyone") return true
  if (access === "mine") return false
  return (file.allowedIds ?? []).includes(userId)
}

async function rosterHas(groupId: string, userId: string): Promise<boolean> {
  const group = await getGroupRow(groupId)
  if (!group) return false
  return group.ownerId === userId || (group.members || []).some((m) => m.userId === userId)
}

/** Owner id still on the roster? Removed owners' items stay (hidden). */
async function isOwnerOnRoster(groupId: string, ownerId: string): Promise<boolean> {
  return rosterHas(groupId, ownerId)
}

export async function getGroupFolders(
  userId: string,
  groupId: string
): Promise<{ ok: true; folders: DbFolder[] } | { ok: false; error: string; status: number }> {
  const membership = await requireGroupMembership(groupId, userId)
  if (!membership.ok) return membership
  const group = membership.group
  const leader = isGroupLeader(group, userId)
  const [folderRows, fileRows] = await Promise.all([
    db().select().from(T.folders).where(eq(T.folders.groupId, groupId)),
    db().select().from(T.files).where(eq(T.files.groupId, groupId)),
  ])
  const folders = folderRows.map((r) => cleanRow(r) as unknown as DbFolder)
  const files = fileRows.map((r) => cleanRow(r) as unknown as DbFile)
  return {
    ok: true,
    // Inaccessible items are absent, never shown as locked. Each folder
    // carries the total size of the files inside the viewer may access
    // (same folder-AND-file rule as file reads, so restricted files never
    // leak through the aggregate).
    folders: folders
      .filter((f) => canAccessFolder(group, f, userId, leader))
      .map((f) => ({
        ...f,
        totalSize: files
          .filter(
            (file) =>
              file.folderId === f.id &&
              canAccessFile(group, folders, file, userId, leader)
          )
          .reduce((sum, file) => sum + (Number(file.size) || 0), 0),
      })),
  }
}

export async function createGroupFolder(
  userId: string,
  groupId: string,
  input: { name?: string; access?: unknown; allowedIds?: unknown }
): Promise<{ ok: true; folder: DbFolder } | { ok: false; error: string; status: number }> {
  if (!input.name || !input.name.trim()) {
    return { ok: false, error: "Folder name is required.", status: 400 }
  }
  const membership = await requireGroupMembership(groupId, userId)
  if (!membership.ok) return membership
  const { access, allowedIds } = normalizeAccess(input, membership.group)
  const now = new Date().toISOString()
  const folder: DbFolder = {
    id: newResearchId("folder"),
    groupId,
    name: input.name.trim(),
    createdBy: userId,
    access,
    allowedIds,
    createdAt: now,
    updatedAt: now,
  }
  await db().insert(T.folders).values({
    id: folder.id,
    groupId: folder.groupId,
    name: folder.name,
    createdBy: folder.createdBy,
    access: folder.access,
    allowedIds: folder.allowedIds,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  })
  await logGroupActivity(userId, groupId, {
    action: "created folder",
    target: folder.name,
    ref: { kind: "folder", id: folder.id },
  })
  return { ok: true, folder }
}

export async function renameGroupFolder(
  userId: string,
  groupId: string,
  folderId: string,
  input: { name?: string; access?: unknown; allowedIds?: unknown }
): Promise<{ ok: true; folder: DbFolder } | { ok: false; error: string; status: number }> {
  const membership = await requireGroupMembership(groupId, userId)
  if (!membership.ok) return membership
  const folderRows = await db()
    .select()
    .from(T.folders)
    .where(and(eq(T.folders.id, folderId), eq(T.folders.groupId, groupId)))
  if (folderRows.length === 0) {
    return { ok: false, error: "Folder not found in this group.", status: 404 }
  }
  const folder = cleanRow(folderRows[0]) as unknown as DbFolder
  // Hidden items read exactly like missing ones.
  if (!canAccessFolder(membership.group, folder, userId, false)) {
    return { ok: false, error: "Folder not found in this group.", status: 404 }
  }
  // Rename: creator or group leader. Access changes stay strictly
  // owner-only, even for leaders.
  const isOwner = folder.createdBy === userId
  const isLeader = isGroupLeader(membership.group, userId)
  if (input.access !== undefined || input.allowedIds !== undefined) {
    if (!isOwner) {
      return { ok: false, error: "Only the creator can change this folder's access.", status: 403 }
    }
  }
  if (input.name !== undefined && !isOwner && !isLeader) {
    return { ok: false, error: "Only the creator or group leader can rename this folder.", status: 403 }
  }
  if (input.name !== undefined) {
    if (!input.name || !input.name.trim()) {
      return { ok: false, error: "Folder name is required.", status: 400 }
    }
    folder.name = input.name.trim()
  }
  if (input.access !== undefined || input.allowedIds !== undefined) {
    const { access, allowedIds } = normalizeAccess(
      {
        access: input.access !== undefined ? input.access : folder.access,
        allowedIds: input.allowedIds !== undefined ? input.allowedIds : folder.allowedIds,
      },
      membership.group
    )
    folder.access = access
    folder.allowedIds = allowedIds
  }
  folder.updatedAt = new Date().toISOString()
  await db()
    .update(T.folders)
    .set({
      name: folder.name,
      access: folder.access,
      allowedIds: folder.allowedIds,
      updatedAt: folder.updatedAt,
    })
    .where(eq(T.folders.id, folderId))
  return { ok: true, folder }
}

export async function deleteGroupFolder(
  userId: string,
  groupId: string,
  folderId: string
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const membership = await requireGroupMembership(groupId, userId)
  if (!membership.ok) return membership
  const folderRows = await db()
    .select()
    .from(T.folders)
    .where(and(eq(T.folders.id, folderId), eq(T.folders.groupId, groupId)))
  if (folderRows.length === 0) {
    return { ok: false, error: "Folder not found in this group.", status: 404 }
  }
  const folder = cleanRow(folderRows[0]) as unknown as DbFolder
  const group = membership.group
  const hasAccess = canAccessFolder(
    group,
    folder,
    userId,
    isGroupLeader(group, userId)
  )
  const ownerLeft = !(await isOwnerOnRoster(groupId, folder.createdBy))
  if (folder.createdBy === userId) {
    // Owner: always allowed.
  } else if (isGroupLeader(group, userId) && (hasAccess || ownerLeft)) {
    // Leader: items they can access, or ownerless items.
  } else if (!hasAccess) {
    return { ok: false, error: "Folder not found in this group.", status: 404 }
  } else {
    return { ok: false, error: "Only the creator can delete this folder.", status: 403 }
  }
  const removedRows = await db()
    .select()
    .from(T.files)
    .where(and(eq(T.files.folderId, folderId), eq(T.files.groupId, groupId)))
  const removed = removedRows.map((r) => cleanRow(r) as unknown as DbFile)
  await db()
    .delete(T.files)
    .where(and(eq(T.files.folderId, folderId), eq(T.files.groupId, groupId)))
  await db()
    .delete(T.folders)
    .where(and(eq(T.folders.id, folderId), eq(T.folders.groupId, groupId)))
  for (const f of removed) {
    if (f.blobUrl) await deleteBlob(f.blobUrl)
  }
  await logGroupActivity(userId, groupId, {
    action: "deleted folder",
    target: folder.name,
    ref: { kind: "folder", id: folder.id },
  })
  return { ok: true }
}

export async function mergeGroupFolders(
  userId: string,
  groupId: string,
  sourceId: string,
  targetId: string
): Promise<{ ok: true; moved: number } | { ok: false; error: string; status: number }> {
  if (sourceId === targetId) {
    return { ok: false, error: "Pick a different target folder.", status: 400 }
  }
  const membership = await requireGroupMembership(groupId, userId)
  if (!membership.ok) return membership
  const group = membership.group
  const folderRows = await db().select().from(T.folders).where(eq(T.folders.groupId, groupId))
  const folders = folderRows.map((r) => cleanRow(r) as unknown as DbFolder)
  const source = folders.find((f) => f.id === sourceId)
  const target = folders.find((f) => f.id === targetId)
  if (!source || !target) {
    return { ok: false, error: "Folder not found in this group.", status: 404 }
  }
  // Merge requires ownership of both folders — or group leadership, which
  // covers any pair in the leader's group.
  const ownsBoth = source.createdBy === userId && target.createdBy === userId
  if (!ownsBoth && !isGroupLeader(group, userId)) {
    return { ok: false, error: "Only the creator of both folders or the group leader can merge them.", status: 403 }
  }
  // Re-link every file, renaming incoming ones on collision so both survive.
  // Bytes stay in Blob untouched — only records move, one row at a time.
  const targetFiles = await db()
    .select()
    .from(T.files)
    .where(and(eq(T.files.folderId, targetId), eq(T.files.groupId, groupId)))
  const taken = new Set(targetFiles.map((f) => f.name))
  const sourceFiles = await db()
    .select()
    .from(T.files)
    .where(and(eq(T.files.folderId, sourceId), eq(T.files.groupId, groupId)))
  let moved = 0
  for (const row of sourceFiles) {
    const f = cleanRow(row) as unknown as DbFile
    let name = f.name
    if (taken.has(name)) {
      const dot = f.name.lastIndexOf(".")
      const stem = dot > 0 ? f.name.slice(0, dot) : f.name
      const ext = dot > 0 ? f.name.slice(dot) : ""
      let n = 2
      while (taken.has(`${stem} (${n})${ext}`)) n += 1
      name = `${stem} (${n})${ext}`
    }
    taken.add(name)
    await db()
      .update(T.files)
      .set({ name, folderId: targetId })
      .where(eq(T.files.id, f.id))
    moved += 1
  }
  await db()
    .delete(T.folders)
    .where(and(eq(T.folders.id, sourceId), eq(T.folders.groupId, groupId)))
  await logGroupActivity(userId, groupId, {
    action: "merged folder",
    target: `"${source.name}" into "${target.name}"`,
    ref: { kind: "folder", id: target.id },
  })
  return { ok: true, moved }
}

export async function getFolderFiles(
  userId: string,
  groupId: string,
  folderId: string
): Promise<{ ok: true; files: DbFile[] } | { ok: false; error: string; status: number }> {
  const membership = await requireGroupMembership(groupId, userId)
  if (!membership.ok) return membership
  const group = membership.group
  const leader = isGroupLeader(group, userId)
  const folderRows = await db()
    .select()
    .from(T.folders)
    .where(and(eq(T.folders.id, folderId), eq(T.folders.groupId, groupId)))
  if (folderRows.length === 0) {
    return { ok: false, error: "Folder not found in this group.", status: 404 }
  }
  const folder = cleanRow(folderRows[0]) as unknown as DbFolder
  if (!canAccessFolder(group, folder, userId, leader)) {
    return { ok: false, error: "Folder not found in this group.", status: 404 }
  }
  const fileRows = await db()
    .select()
    .from(T.files)
    .where(and(eq(T.files.folderId, folderId), eq(T.files.groupId, groupId)))
  const folders = (await db().select().from(T.folders).where(eq(T.folders.groupId, groupId))).map(
    (r) => cleanRow(r) as unknown as DbFolder
  )
  return {
    ok: true,
    files: fileRows
      .map((r) => cleanRow(r) as unknown as DbFile)
      .filter((f) => canAccessFile(group, folders, f, userId, leader)),
  }
}

/** Total stored research-file bytes for quota enforcement. */
export async function getGroupFileUsage(groupId: string): Promise<number> {
  const rows = await db().select().from(T.files).where(eq(T.files.groupId, groupId))
  return rows.reduce((sum, f) => sum + (f.size || 0), 0)
}

export type ResearchFileMeta = {
  name: string
  size: number
  mimeType: string
  storedName: string
  /** Vercel Blob URL for the uploaded bytes. */
  blobUrl: string
}

export async function registerResearchFiles(
  userId: string,
  groupId: string,
  folderId: string,
  metas: ResearchFileMeta[],
  accessInput?: { access?: unknown; allowedIds?: unknown }
): Promise<{ ok: true; files: DbFile[] } | { ok: false; error: string; status: number }> {
  const membership = await requireGroupMembership(groupId, userId)
  if (!membership.ok) return membership
  const group = membership.group
  const leader = isGroupLeader(group, userId)
  const folderRows = await db()
    .select()
    .from(T.folders)
    .where(and(eq(T.folders.id, folderId), eq(T.folders.groupId, groupId)))
  if (folderRows.length === 0) {
    return { ok: false, error: "Folder not found in this group.", status: 404 }
  }
  const folder = cleanRow(folderRows[0]) as unknown as DbFolder
  if (!canAccessFolder(group, folder, userId, leader)) {
    return { ok: false, error: "Folder not found in this group.", status: 404 }
  }
  const { access, allowedIds } = normalizeAccess(accessInput ?? {}, group)
  const now = new Date().toISOString()
  const files: DbFile[] = metas.map((m) => ({
    id: newResearchId("file"),
    groupId,
    folderId,
    name: m.name,
    size: m.size,
    mimeType: m.mimeType,
    storedName: m.storedName,
    blobUrl: m.blobUrl,
    uploadedBy: userId,
    access,
    allowedIds,
    createdAt: now,
  }))
  for (const f of files) {
    await db().insert(T.files).values({
      id: f.id,
      groupId: f.groupId,
      folderId: f.folderId,
      name: f.name,
      size: f.size,
      mimeType: f.mimeType,
      storedName: f.storedName,
      blobUrl: f.blobUrl ?? null,
      uploadedBy: f.uploadedBy,
      access: f.access,
      allowedIds: f.allowedIds,
      createdAt: f.createdAt,
    })
  }
  for (const f of files) {
    await logGroupActivity(userId, groupId, {
      action: "uploaded file",
      target: f.name,
      ref: { kind: "file", id: f.id },
    })
  }
  return { ok: true, files }
}

export async function setResearchFileAccess(
  userId: string,
  groupId: string,
  fileId: string,
  input: { access?: unknown; allowedIds?: unknown }
): Promise<{ ok: true; file: DbFile } | { ok: false; error: string; status: number }> {
  const membership = await requireGroupMembership(groupId, userId)
  if (!membership.ok) return membership
  const group = membership.group
  const leader = isGroupLeader(group, userId)
  const fileRows = await db()
    .select()
    .from(T.files)
    .where(and(eq(T.files.id, fileId), eq(T.files.groupId, groupId)))
  if (fileRows.length === 0) {
    return { ok: false, error: "File not found in this group.", status: 404 }
  }
  const file = cleanRow(fileRows[0]) as unknown as DbFile
  const folderRows = await db().select().from(T.folders).where(eq(T.folders.groupId, groupId))
  const folders = folderRows.map((r) => cleanRow(r) as unknown as DbFolder)
  if (!canAccessFile(group, folders, file, userId, leader)) {
    return { ok: false, error: "File not found in this group.", status: 404 }
  }
  if (file.uploadedBy !== userId) {
    return { ok: false, error: "Only the uploader can change this file's access.", status: 403 }
  }
  const { access, allowedIds } = normalizeAccess(
    {
      access: input.access !== undefined ? input.access : file.access,
      allowedIds: input.allowedIds !== undefined ? input.allowedIds : file.allowedIds,
    },
    group
  )
  await db()
    .update(T.files)
    .set({ access, allowedIds })
    .where(eq(T.files.id, fileId))
  return { ok: true, file: { ...file, access, allowedIds } }
}

export async function deleteResearchFile(
  userId: string,
  groupId: string,
  fileId: string
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const membership = await requireGroupMembership(groupId, userId)
  if (!membership.ok) return membership
  const group = membership.group
  const leader = isGroupLeader(group, userId)
  const fileRows = await db()
    .select()
    .from(T.files)
    .where(and(eq(T.files.id, fileId), eq(T.files.groupId, groupId)))
  if (fileRows.length === 0) {
    return { ok: false, error: "File not found in this group.", status: 404 }
  }
  const file = cleanRow(fileRows[0]) as unknown as DbFile
  const folderRows = await db().select().from(T.folders).where(eq(T.folders.groupId, groupId))
  const folders = folderRows.map((r) => cleanRow(r) as unknown as DbFolder)
  const hasAccess = canAccessFile(
    group,
    folders,
    file,
    userId,
    leader
  )
  const folder = folders.find(
    (f) => f.id === file.folderId
  )
  const ownerLeft =
    !folder || !(await isOwnerOnRoster(groupId, file.uploadedBy))
  if (file.uploadedBy === userId) {
    // Owner (uploader): always allowed.
  } else if (leader && (hasAccess || ownerLeft)) {
    // Leader: files they can access, or ownerless files.
  } else if (!hasAccess) {
    return { ok: false, error: "File not found in this group.", status: 404 }
  } else {
    return { ok: false, error: "Only the uploader can delete this file.", status: 403 }
  }
  await db()
    .delete(T.files)
    .where(and(eq(T.files.id, fileId), eq(T.files.groupId, groupId)))
  if (file.blobUrl) await deleteBlob(file.blobUrl)
  await logGroupActivity(userId, groupId, {
    action: "deleted file",
    target: file.name,
    ref: { kind: "file", id: file.id },
  })
  return { ok: true }
}

/**
 * Locate a research file by stored name for the file-serving endpoint
 * (resolves the owning folder/group for access checks + the original name).
 */
export async function findResearchFile(
  storedName: string
): Promise<{ groupId: string; folderId: string; name: string; mimeType: string; blobUrl?: string } | null> {
  const rows = await db().select().from(T.files).where(eq(T.files.storedName, storedName))
  if (rows.length === 0) return null
  const file = cleanRow(rows[0]) as unknown as DbFile
  return { groupId: file.groupId, folderId: file.folderId, name: file.name, mimeType: file.mimeType, blobUrl: file.blobUrl }
}

/**
 * Full effective access check for serving: membership, folder access, and
 * the file's own setting. Owners always access their own items; the leader
 * additionally sees ownerless items.
 */
export async function canServeResearchFile(
  userId: string,
  storedName: string
): Promise<{ ok: true; name: string; blobUrl?: string } | { ok: false }> {
  const rows = await db().select().from(T.files).where(eq(T.files.storedName, storedName))
  if (rows.length === 0) return { ok: false }
  const file = cleanRow(rows[0]) as unknown as DbFile
  const group = await getGroupRow(file.groupId)
  if (!group || !group.members.some((m) => m.userId === userId)) return { ok: false }
  const folderRows = await db().select().from(T.folders).where(eq(T.folders.groupId, file.groupId))
  const folders = folderRows.map((r) => cleanRow(r) as unknown as DbFolder)
  if (!canAccessFile(group, folders, file, userId, isGroupLeader(group, userId))) {
    return { ok: false }
  }
  return { ok: true, name: file.name, blobUrl: file.blobUrl }
}

// ── Activities ───────────────────────────────────────────────────────────────
// Newest-first. Reads are bounded (limit/offset) but nothing is ever
// deleted: history is a permanent log, capped only to bound storage growth.

const ACTIVITY_CAP_PER_GROUP = 200
const ACTIVITY_DEFAULT_LIMIT = 50
const ACTIVITY_MAX_LIMIT = 200

export async function getGroupActivities(
  userId: string,
  groupId: string,
  opts?: { limit?: number; offset?: number }
): Promise<{ ok: true; activities: DbActivity[]; total: number } | { ok: false; error: string; status: number }> {
  const membership = await requireGroupMembership(groupId, userId)
  if (!membership.ok) return membership
  const group = membership.group
  const leader = isGroupLeader(group, userId)
  const [activityRows, folderRows, fileRows] = await Promise.all([
    db()
      .select()
      .from(T.activities)
      .where(eq(T.activities.groupId, groupId))
      .orderBy(desc(T.activities.createdAt)),
    db().select().from(T.folders).where(eq(T.folders.groupId, groupId)),
    db().select().from(T.files).where(eq(T.files.groupId, groupId)),
  ])
  const all = activityRows.map((r) => cleanRow(r) as unknown as DbActivity)
  const folders = folderRows.map((r) => cleanRow(r) as unknown as DbFolder)
  const files = fileRows.map((r) => cleanRow(r) as unknown as DbFile)
  // Entries linked to a research folder/file are visible only to users who
  // can access that item. Entries whose item is gone (deleted) stay visible
  // — they describe the deletion, and there is no content left to protect.
  const visible = all.filter((a) => {
    if (!a.ref) return true
    if (a.ref.kind === "folder") {
      const folder = folders.find((f) => f.id === a.ref!.id)
      if (!folder) return true
      return canAccessFolder(group, folder, userId, leader)
    }
    const file = files.find((f) => f.id === a.ref!.id)
    if (!file) return true
    return canAccessFile(group, folders, file, userId, leader)
  })
  const rawLimit = opts?.limit ?? ACTIVITY_DEFAULT_LIMIT
  const limit = Math.min(Math.max(Math.floor(rawLimit) || ACTIVITY_DEFAULT_LIMIT, 1), ACTIVITY_MAX_LIMIT)
  const offset = Math.max(Math.floor(opts?.offset ?? 0) || 0, 0)
  return {
    ok: true,
    activities: visible.slice(offset, offset + limit),
    total: visible.length,
  }
}

export async function logGroupActivity(
  userId: string,
  groupId: string,
  entry: {
    action: string
    target: string
    memberName?: string
    memberInitials?: string
    ref?: { kind: "folder" | "file"; id: string }
  }
): Promise<{ ok: true; activity: DbActivity } | { ok: false; error: string; status: number }> {
  if (!entry.action || !entry.action.trim()) {
    return { ok: false, error: "Activity action is required.", status: 400 }
  }
  const membership = await requireGroupMembership(groupId, userId)
  if (!membership.ok) return membership
  const actor = await findUserById(userId)
  const displayName = entry.memberName?.trim() || actor?.displayName || actor?.name || "Someone"
  const now = new Date().toISOString()
  const activity: DbActivity = {
    id: newResearchId("act"),
    groupId,
    memberId: userId,
    memberName: displayName,
    memberInitials: entry.memberInitials?.trim() || computeInitials(displayName),
    action: entry.action.trim(),
    target: entry.target?.trim() || "",
    time: "just now",
    createdAt: now,
    ...(entry.ref ? { ref: entry.ref } : {}),
  }
  await db().insert(T.activities).values({
    id: activity.id,
    groupId: activity.groupId,
    memberId: activity.memberId,
    memberName: activity.memberName,
    memberInitials: activity.memberInitials,
    action: activity.action,
    target: activity.target,
    time: activity.time,
    createdAt: activity.createdAt,
    ref: activity.ref ?? null,
  })
  // Permanent log, capped per group to bound storage growth (drops oldest).
  const existing = await db()
    .select({ id: T.activities.id })
    .from(T.activities)
    .where(eq(T.activities.groupId, groupId))
    .orderBy(desc(T.activities.createdAt))
  if (existing.length > ACTIVITY_CAP_PER_GROUP) {
    const dropIds = existing
      .slice(ACTIVITY_CAP_PER_GROUP)
      .map((r) => r.id)
    await db().delete(T.activities).where(inArray(T.activities.id, dropIds))
  }
  return { ok: true, activity }
}
