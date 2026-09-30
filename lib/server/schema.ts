import {
  pgTable,
  text,
  boolean,
  integer,
  bigint,
  jsonb,
} from "drizzle-orm/pg-core"
import type {
  GroupMember,
  UserConnection,
} from "./auth-db"
import type { UserPreferences } from "@/lib/research-data"

/**
 * Postgres schema mirroring the Db* types in auth-db.ts 1:1. Nested
 * arrays/objects stay JSONB so the business logic keeps working on the
 * exact same JS shapes; timestamps stay ISO strings (text) exactly as the
 * JSON store kept them.
 */

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  salt: text("salt").notNull(),
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  username: text("username").notNull().unique(),
  initials: text("initials").notNull(),
  color: text("color").notNull(),
  role: text("role").notNull(),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  showConnections: boolean("show_connections"),
  showGroups: boolean("show_groups"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  preferences: jsonb("preferences").$type<UserPreferences>(),
  activeGroupId: text("active_group_id"),
  createdAt: text("created_at").notNull(),
})

export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
  createdAt: text("created_at").notNull(),
})

export const connections = pgTable("connections", {
  id: text("id").primaryKey(),
  requesterId: text("requester_id").notNull(),
  recipientId: text("recipient_id").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
})

export type StoredConnection = typeof connections.$inferSelect & {
  status: UserConnection["status"]
}

export const groups = pgTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  researchTitle: text("research_title").notNull(),
  ownerId: text("owner_id").notNull(),
  leader: text("leader").notNull(),
  members: jsonb("members").$type<GroupMember[]>().notNull(),
  inviteToken: text("invite_token"),
  inviteEnabled: boolean("invite_enabled"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
})

export const joinRequests = pgTable("join_requests", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  userId: text("user_id").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
})

export const chapters = pgTable("chapters", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  label: text("label").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull(),
  progress: integer("progress").notNull(),
  sectionsComplete: integer("sections_complete").notNull(),
  sectionsTotal: integer("sections_total").notNull(),
  sources: integer("sources").notNull(),
  assigned: jsonb("assigned").$type<string[]>().notNull(),
  updated: text("updated").notNull(),
  iconName: text("icon_name"),
  colorTag: text("color_tag"),
  files: jsonb("files"),
  attachmentUrl: text("attachment_url"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
})

export const tasks = pgTable("tasks", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  title: text("title").notNull(),
  chapter: text("chapter").notNull(),
  chapterId: text("chapter_id"),
  status: text("status").notNull(),
  assignee: text("assignee").notNull(),
  dueDate: text("due_date"),
  description: text("description"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
})

export const sources = pgTable("sources", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  title: text("title").notNull(),
  author: text("author").notNull(),
  year: integer("year").notNull(),
  tags: jsonb("tags").$type<string[]>().notNull(),
  usedIn: jsonb("used_in").$type<string[]>().notNull(),
  cited: boolean("cited").notNull(),
  url: text("url"),
  chapterIds: jsonb("chapter_ids").$type<string[]>().notNull(),
  files: jsonb("files"),
  attachmentUrl: text("attachment_url"),
  sourceType: text("source_type"),
  apaCitation: text("apa_citation"),
  apaInputs: jsonb("apa_inputs"),
  summary: text("summary"),
  summaryInputs: jsonb("summary_inputs"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
})

export const folders = pgTable("folders", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  name: text("name").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  access: text("access"),
  allowedIds: jsonb("allowed_ids").$type<string[]>(),
})

export const files = pgTable("files", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  folderId: text("folder_id").notNull(),
  name: text("name").notNull(),
  size: integer("size").notNull(),
  mimeType: text("mime_type").notNull(),
  storedName: text("stored_name").notNull(),
  blobUrl: text("blob_url"),
  uploadedBy: text("uploaded_by").notNull(),
  createdAt: text("created_at").notNull(),
  access: text("access"),
  allowedIds: jsonb("allowed_ids").$type<string[]>(),
})

export const activities = pgTable("activities", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  memberId: text("member_id").notNull(),
  memberName: text("member_name").notNull(),
  memberInitials: text("member_initials").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  time: text("time").notNull(),
  createdAt: text("created_at").notNull(),
  ref: jsonb("ref"),
})

export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  groupId: text("group_id"),
  groupName: text("group_name"),
  taskId: text("task_id"),
  taskTitle: text("task_title"),
  actorId: text("actor_id"),
  actorName: text("actor_name"),
  createdAt: text("created_at").notNull(),
  readAt: text("read_at"),
})
