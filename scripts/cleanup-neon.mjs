// One-off Neon cleanup for E2E test users. Not part of the app.
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { neon } from "@neondatabase/serverless"

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
  const t = line.trim()
  if (!t || t.startsWith("#") || !t.includes("=")) continue
  const i = t.indexOf("=")
  const k = t.slice(0, i).trim()
  if (k && !(k in process.env)) process.env[k] = t.slice(i + 1).trim()
}
const sql = neon(process.env.DATABASE_URL)
const patterns = [
  "neonverify_%", "blobverify_%", "dbg_%", "sortpref_%", "taskstat_%",
  "taskpagesort_%", "chapsort_%", "srcsort_%", "srcpagesort_%", "srcview_%",
  "touch_%", "viewa_%", "viewb_%", "logintest_%",
]
for (const p of patterns) {
  const rows = await sql.query("SELECT id FROM users WHERE email LIKE $1", [p])
  for (const r of rows) {
    await sql.query("DELETE FROM sessions WHERE user_id = $1", [r.id])
    await sql.query("DELETE FROM users WHERE id = $1", [r.id])
  }
  if (rows.length > 0) console.log(`removed ${rows.length} user(s) like ${p}`)
}
const remaining = await sql.query("SELECT email FROM users")
console.log("remaining users:", remaining.map((u) => u.email).join(", "))
