// One-shot migration: local JSON store + data/uploads/* → Neon Postgres + Vercel Blob.
//
// Prerequisites (run once, see report):
//   1. Neon database created via Vercel Marketplace and connected to the project.
//   2. A Vercel Blob store created (Storage → Blob) with its token available.
//   3. .env.local contains DATABASE_URL and BLOB_READ_WRITE_TOKEN.
//
// Run:  node scripts/migrate-to-neon.mjs
// Safe to re-run: tables are created IF NOT EXISTS and rows are inserted
// with ON CONFLICT DO NOTHING (keyed by id), so already-migrated data is
// skipped. Re-running re-uploads local files (same Blob pathnames).

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { neon } from "@neondatabase/serverless"
import { put } from "@vercel/blob"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, "..")
const JSON_PATH = path.join(ROOT, "data", "auth-db.json")
const UPLOAD_DIR = path.join(ROOT, "data", "uploads")

// Plain `node` does not load .env.local (only `next` commands do), so read
// it here. Real environment values always win over the file.
try {
  const envPath = path.join(ROOT, ".env.local")
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue
      const idx = trimmed.indexOf("=")
      const key = trimmed.slice(0, idx).trim()
      let value = trimmed.slice(idx + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (key && !(key in process.env)) process.env[key] = value
    }
  }
} catch {
  // Missing/unreadable .env.local just means env must come from elsewhere.
}

const sql = neon(process.env.DATABASE_URL ?? "")
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env.local first.");
  process.exit(1)
}
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("BLOB_READ_WRITE_TOKEN is not set. Add it to .env.local first.");
  process.exit(1)
}

const DDL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  initials TEXT NOT NULL,
  color TEXT NOT NULL,
  role TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  show_connections BOOLEAN,
  show_groups BOOLEAN,
  first_name TEXT,
  last_name TEXT,
  preferences JSONB,
  active_group_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  research_title TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  leader TEXT NOT NULL,
  members JSONB NOT NULL,
  invite_token TEXT,
  invite_enabled BOOLEAN,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS join_requests (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  label TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  progress INTEGER NOT NULL,
  sections_complete INTEGER NOT NULL,
  sections_total INTEGER NOT NULL,
  sources INTEGER NOT NULL,
  assigned JSONB NOT NULL,
  updated TEXT NOT NULL,
  icon_name TEXT,
  color_tag TEXT,
  files JSONB,
  attachment_url TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  title TEXT NOT NULL,
  chapter TEXT NOT NULL,
  chapter_id TEXT,
  status TEXT NOT NULL,
  assignee TEXT NOT NULL,
  due_date TEXT,
  description TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  year INTEGER NOT NULL,
  tags JSONB NOT NULL,
  used_in JSONB NOT NULL,
  cited BOOLEAN NOT NULL,
  url TEXT,
  chapter_ids JSONB NOT NULL,
  files JSONB,
  attachment_url TEXT,
  source_type TEXT,
  apa_citation TEXT,
  apa_inputs JSONB,
  summary TEXT,
  summary_inputs JSONB,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  access TEXT,
  allowed_ids JSONB
);
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  name TEXT NOT NULL,
  size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  blob_url TEXT,
  uploaded_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  access TEXT,
  allowed_ids JSONB
);
CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  member_name TEXT NOT NULL,
  member_initials TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  time TEXT NOT NULL,
  created_at TEXT NOT NULL,
  ref JSONB
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  group_id TEXT,
  group_name TEXT,
  task_id TEXT,
  task_title TEXT,
  actor_id TEXT,
  actor_name TEXT,
  created_at TEXT NOT NULL,
  read_at TEXT
);
`

const CONTENT_TYPES = {
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
}

async function uploadLocalFile(storedName, subdir) {
  const filePath = path.join(UPLOAD_DIR, storedName)
  if (!fs.existsSync(filePath)) {
    console.log(`  skip missing bytes: ${storedName}`);
    return null
  }
  // Server-side `put()` with access "public" is rejected on this private
  // store; access "private" uploads the same bytes under the same pathname.
  const ext = path.extname(storedName).toLowerCase()
  const body = fs.readFileSync(filePath)
  await put(storedName, body, {
    access: "private",
    contentType: CONTENT_TYPES[ext] ?? "application/octet-stream",
    addRandomSuffix: false,
    allowOverwrite: true,
  })
  return true
}

async function main() {
  console.log("creating tables…");
  for (const stmt of DDL.split(";").map((s) => s.trim()).filter(Boolean)) {
    await sql.query(stmt)
  }
  if (!fs.existsSync(JSON_PATH)) {
    console.log("no data/auth-db.json found — tables created, nothing to import.");
    return
  }
  const db = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"))
  const counts = {}

  const insert = async (table, row) => {
    const cols = Object.keys(row)
    // Raw sql.query does NOT serialize objects (drizzle does that for the
    // app) — stringify JSONB values explicitly; plain strings stay as-is.
    const vals = Object.values(row).map((v) =>
      typeof v === "object" && v !== null ? JSON.stringify(v) : v
    )
    // drizzle-free raw insert with ON CONFLICT DO NOTHING (idempotent)
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ")
    try {
      await sql.query(
        `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
        vals
      )
    } catch (e) {
      console.error(`insert into ${table} failed. row keys: ${cols.join(",")}`);
      throw e
    }
  }
  // users (avatar bytes → Blob; avatarUrl values stay /api/avatars/…
  // URLs, which now proxy Blob bytes instead of local disk)
  for (const u of db.users || []) {
    if (typeof u.avatarUrl === "string" && u.avatarUrl.startsWith("/api/avatars/")) {
      const name = u.avatarUrl.split("/").pop()
      const ok = await uploadLocalFile(name, "avatars")
      if (ok) console.log(`  avatar ${u.email} → Blob`);
    }
    await insert("users", {
      id: u.id, email: u.email, password_hash: u.passwordHash, salt: u.salt,
      name: u.name, display_name: u.displayName, username: u.username,
      initials: u.initials, color: u.color, role: u.role,
      avatar_url: u.avatarUrl ?? null, bio: u.bio ?? null,
      show_connections: u.showConnections ?? null, show_groups: u.showGroups ?? null,
      first_name: u.firstName ?? null, last_name: u.lastName ?? null,
      preferences: u.preferences ?? null, active_group_id: u.activeGroupId ?? null,
      created_at: u.createdAt,
    })
  }
  counts.users = (db.users || []).length

  for (const s of db.sessions || []) {
    await insert("sessions", { token: s.token, user_id: s.userId, expires_at: s.expiresAt, created_at: s.createdAt })
  }
  counts.sessions = (db.sessions || []).length

  for (const c of db.connections || []) {
    await insert("connections", {
      id: c.id, requester_id: c.requesterId, recipient_id: c.recipientId,
      status: c.status, created_at: c.createdAt, updated_at: c.updatedAt,
    })
  }
  counts.connections = (db.connections || []).length

  for (const g of db.groups || []) {
    await insert("groups", {
      id: g.id, name: g.name, description: g.description ?? null,
      research_title: g.researchTitle, owner_id: g.ownerId, leader: g.leader,
      members: g.members ?? [], invite_token: g.inviteToken ?? null,
      invite_enabled: g.inviteEnabled ?? null,
      created_at: g.createdAt, updated_at: g.updatedAt,
    })
  }
  counts.groups = (db.groups || []).length

  for (const r of db.joinRequests || []) {
    await insert("join_requests", {
      id: r.id, group_id: r.groupId, user_id: r.userId, status: r.status, created_at: r.createdAt,
    })
  }
  counts.joinRequests = (db.joinRequests || []).length

  // chapter + source inline attachments: upload bytes (records keep
  // their storedName, which the serving routes resolve via Blob)
  const migrateFiles = async (files, subdir) => {
    if (!Array.isArray(files)) return files ?? null
    for (const f of files) {
      if (f.storedName && !f.blobUrl) {
        await uploadLocalFile(f.storedName, subdir)
      }
    }
    return files
  }

  for (const c of db.chapters || []) {
    await insert("chapters", {
      id: c.id, group_id: c.groupId, label: c.label, title: c.title,
      description: c.description ?? null, status: c.status, progress: c.progress ?? 0,
      sections_complete: c.sectionsComplete ?? 0, sections_total: c.sectionsTotal ?? 0,
      sources: c.sources ?? 0, assigned: c.assigned ?? [], updated: c.updated ?? "Just now",
      icon_name: c.iconName ?? null, color_tag: c.colorTag ?? null,
      files: await migrateFiles(c.files, "attachments"),
      attachment_url: c.attachmentUrl ?? null, created_by: c.createdBy,
      created_at: c.createdAt, updated_at: c.updatedAt,
    })
  }
  counts.chapters = (db.chapters || []).length

  for (const t of db.tasks || []) {
    await insert("tasks", {
      id: t.id, group_id: t.groupId, title: t.title, chapter: t.chapter,
      chapter_id: t.chapterId ?? null, status: t.status, assignee: t.assignee,
      due_date: t.dueDate ?? null, description: t.description ?? null,
      created_by: t.createdBy, created_at: t.createdAt, updated_at: t.updatedAt,
    })
  }
  counts.tasks = (db.tasks || []).length

  for (const s of db.sources || []) {
    await insert("sources", {
      id: s.id, group_id: s.groupId, title: s.title, author: s.author,
      year: s.year, tags: s.tags ?? [], used_in: s.usedIn ?? [], cited: s.cited ?? false,
      url: s.url ?? null, chapter_ids: s.chapterIds ?? [],
      files: await migrateFiles(s.files, "attachments"),
      attachment_url: s.attachmentUrl ?? null, source_type: s.sourceType ?? null,
      apa_citation: s.apaCitation ?? null, apa_inputs: s.apaInputs ?? null,
      summary: s.summary ?? null, summary_inputs: s.summaryInputs ?? null,
      created_by: s.createdBy, created_at: s.createdAt, updated_at: s.updatedAt,
    })
  }
  counts.sources = (db.sources || []).length

  for (const f of db.folders || []) {
    await insert("folders", {
      id: f.id, group_id: f.groupId, name: f.name, created_by: f.createdBy,
      created_at: f.createdAt, updated_at: f.updatedAt,
      access: f.access ?? null, allowed_ids: f.allowedIds ?? null,
    })
  }
  counts.folders = (db.folders || []).length

  for (const f of db.files || []) {
    if (f.storedName) {
      const ok = await uploadLocalFile(f.storedName, "research")
      if (ok) console.log(`  research file ${f.name} → Blob`);
    }
    await insert("files", {
      id: f.id, group_id: f.groupId, folder_id: f.folderId, name: f.name,
      size: f.size, mime_type: f.mimeType, stored_name: f.storedName,
      blob_url: f.blobUrl ?? null, uploaded_by: f.uploadedBy, created_at: f.createdAt,
      access: f.access ?? null, allowed_ids: f.allowedIds ?? null,
    })
  }
  counts.files = (db.files || []).length

  for (const a of db.activities || []) {
    await insert("activities", {
      id: a.id, group_id: a.groupId, member_id: a.memberId, member_name: a.memberName,
      member_initials: a.memberInitials, action: a.action, target: a.target ?? "",
      time: a.time ?? "just now", created_at: a.createdAt, ref: a.ref ?? null,
    })
  }
  counts.activities = (db.activities || []).length

  for (const n of db.notifications || []) {
    await insert("notifications", {
      id: n.id, user_id: n.userId, kind: n.kind, title: n.title, body: n.body,
      group_id: n.groupId ?? null, group_name: n.groupName ?? null,
      task_id: n.taskId ?? null, task_title: n.taskTitle ?? null,
      actor_id: n.actorId ?? null, actor_name: n.actorName ?? null,
      created_at: n.createdAt, read_at: n.readAt ?? null,
    })
  }
  counts.notifications = (db.notifications || []).length

  console.log("migrated:", JSON.stringify(counts));
  console.log("done. Verify row counts in Neon, then deploy.");
}

main().catch((e) => {
  console.error("migration failed:", e.message);
  process.exit(1)
})
