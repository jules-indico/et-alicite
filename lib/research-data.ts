export type Member = {
  id: string
  name: string
  initials: string
  color: string
  /** Custom avatar image URL (uploaded on the Account page). Absent = initials. */
  avatarUrl?: string
  /** Split name fields (migrated from the legacy full-name value). */
  firstName?: string
  lastName?: string
}

/** List/grid view mode for a Home workspace section. */
export type ViewMode = "list" | "grid"

/** Home sections with an independent persisted list/grid choice. */
export type ViewSectionKey = "folders" | "chapters" | "tasks" | "sources"

export const VIEW_SECTIONS: ViewSectionKey[] = ["folders", "chapters", "tasks", "sources"]

/** Per-user UI preferences stored on the account (private, never public). */
export type UserPreferences = {
  views?: Partial<Record<ViewSectionKey, ViewMode>>
  sorts?: Partial<Record<SortScope, SectionSort>>
}

/** Persisted list sort: column key + direction, per section. */
export type SortDirection = "asc" | "desc"

export type SectionSort = {
  key: string
  dir: SortDirection
}

/**
 * Extra sort scopes for the per-status task pages. Each keeps an
 * independent saved sort (matching the per-page chapter-filter state);
 * the bare "tasks" scope stays shared with the Home tasks sort.
 */
export const TASK_PAGE_SORT_SCOPES = [
  "tasks-total",
  "tasks-completed",
  "tasks-in-progress",
  "tasks-to-do",
] as const

export type TaskPageSortScope = (typeof TASK_PAGE_SORT_SCOPES)[number]

/**
 * Extra sort scopes for the chapter detail sections and the per-folder
 * file list. Same pattern: one independent saved sort per control.
 */
export const EXTRA_SORT_SCOPES = [
  "chapter-sources",
  "chapter-tasks",
  "folder-files",
] as const

export type ExtraSortScope = (typeof EXTRA_SORT_SCOPES)[number]

export type SortScope = ViewSectionKey | TaskPageSortScope | ExtraSortScope

export const SORT_SCOPES: SortScope[] = [...VIEW_SECTIONS, ...TASK_PAGE_SORT_SCOPES, ...EXTRA_SORT_SCOPES]

export const members: Member[] = [
  { id: "m1", name: "Marian Bergado", initials: "MB", color: "bg-[oklch(0.58_0.16_260)]" },
  { id: "m2", name: "Michael Sabaybay", initials: "MS", color: "bg-[oklch(0.72_0.09_290)]" },
  { id: "m3", name: "Jules Indico", initials: "JI", color: "bg-[oklch(0.68_0.13_155)]" },
  { id: "m4", name: "Vincent Cuenca", initials: "VC", color: "bg-[oklch(0.8_0.08_240)]" },
  { id: "m5", name: "Faye Climaco", initials: "FC", color: "bg-[oklch(0.78_0.12_75)]" },
  { id: "m6", name: "JohnWayne Sanico", initials: "JS", color: "bg-[oklch(0.58_0.16_260)]" },
  { id: "m7", name: "Wade Nellasca", initials: "WN", color: "bg-[oklch(0.72_0.09_290)]" },
  { id: "m8", name: "Eizhenne Mendeja", initials: "EM", color: "bg-[oklch(0.68_0.13_155)]" },
  { id: "m9", name: "Cherielyn Nebreja", initials: "CN", color: "bg-[oklch(0.8_0.08_240)]" },
  { id: "m10", name: "Hannah Chloe Panibe", initials: "HCP", color: "bg-[oklch(0.78_0.12_75)]" },
  { id: "m11", name: "Alysa Doringo", initials: "AD", color: "bg-[oklch(0.78_0.12_75)]" },
]

export const project = {
  name: "et-alicite: Web-Based Application AI Assistant Organizer designed in supporting and developing efficient Research Papers",
  shortName: "et-alicite",
  progress: 67,
  lastUpdated: "2 hours ago",
  memberCount: members.length,
}

export type ChapterStatus = "In progress" | "Completed" | "Not started" | "Review"

export type ChapterFile = {
  name: string
  size: number
  /** Retrievable URL (present only when the bytes were actually uploaded). */
  url?: string
  /** Server-side stored filename backing `url`. */
  storedName?: string
}

export type Chapter = {
  id: string
  label: string
  title: string
  description?: string
  status: ChapterStatus
  progress: number
  sectionsComplete: number
  sectionsTotal: number
  sources: number
  assigned: string[] // member ids
  updated: string
  iconName?: string
  colorTag?: string
  files?: ChapterFile[]
  /** Attached URL (mutually exclusive with uploaded files). */
  attachmentUrl?: string
  createdAt?: string
  updatedAt?: string
}

/**
 * Open target for a chapter card: uploaded file wins, then attached URL,
 * else null (nothing to open — render as non-interactive).
 */
export function chapterAttachment(
  chapter: Pick<Chapter, "files" | "attachmentUrl">
): string | null {
  const file = chapter.files?.find((f) => f.url && f.url.trim().length > 0)
  if (file?.url) return file.url
  const url = chapter.attachmentUrl?.trim()
  return url ? url : null
}

export const chapters: Chapter[] = [
  {
    id: "c1",
    label: "Chapter 1",
    title: "The Problem and Its Background",
    status: "Completed",
    progress: 100,
    sectionsComplete: 4,
    sectionsTotal: 4,
    sources: 6,
    assigned: ["m1", "m3"],
    updated: "Yesterday",
  },
  {
    id: "c2",
    label: "Chapter 2",
    title: "Review of Related Literature",
    status: "In progress",
    progress: 60,
    sectionsComplete: 3,
    sectionsTotal: 5,
    sources: 12,
    assigned: ["m1", "m2", "m4"],
    updated: "2 hours ago",
  },
  {
    id: "c3",
    label: "Chapter 3",
    title: "Research Methodology",
    status: "In progress",
    progress: 35,
    sectionsComplete: 2,
    sectionsTotal: 6,
    sources: 4,
    assigned: ["m3", "m5"],
    updated: "3 days ago",
  },
  {
    id: "c4",
    label: "Research Draft",
    title: "Consolidated Working Draft",
    status: "Review",
    progress: 48,
    sectionsComplete: 0,
    sectionsTotal: 3,
    sources: 22,
    assigned: ["m1", "m2"],
    updated: "5 hours ago",
  },
  {
    id: "c5",
    label: "Literature & Sources",
    title: "Source Library",
    status: "In progress",
    progress: 70,
    sectionsComplete: 0,
    sectionsTotal: 0,
    sources: 24,
    assigned: ["m2", "m4", "m5"],
    updated: "2 hours ago",
  },
]

/** The only three task statuses tracked anywhere in the app. */
export const TASK_STATUSES = ["To do", "In progress", "Completed"] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]

/**
 * Map any legacy task status to the current three ("Not started",
 * "Pending" and "Assigned" all became "To do"). Unknown or missing
 * values also fall back to "To do" so no task is ever status-less.
 */
export function normalizeTaskStatus(status: string | null | undefined): TaskStatus {
  if (status === "In progress" || status === "Completed") return status
  return "To do"
}

export type Task = {
  id: string
  title: string
  chapter: string
  /** Linked chapter ID — the stable attribution key (chapter holds the title). */
  chapterId?: string
  status: TaskStatus
  assignee: string // member id
  dueDate?: string
  /** Optional free-text detail — shown only on the task detail page. */
  description?: string
  createdAt?: string
  updatedAt?: string
}

export const tasks: Task[] = [
  { id: "t1", title: "Background of the Study", chapter: "Chapter 1", status: "Completed", assignee: "m1" },
  { id: "t2", title: "Statement of the Problem", chapter: "Chapter 1", status: "Completed", assignee: "m3" },
  { id: "t3", title: "Related Studies", chapter: "Chapter 2", status: "Completed", assignee: "m2" },
  { id: "t4", title: "Related Literature", chapter: "Chapter 2", status: "In progress", assignee: "m1" },
  { id: "t5", title: "Conceptual Framework", chapter: "Chapter 2", status: "To do", assignee: "m4" },
  { id: "t6", title: "Research Instruments", chapter: "Chapter 3", status: "In progress", assignee: "m5" },
  { id: "t7", title: "Sampling Procedure", chapter: "Chapter 3", status: "To do", assignee: "m3" },
]

export const taskSummary = {
  total: tasks.length,
  completed: tasks.filter((t) => t.status === "Completed").length,
  inProgress: tasks.filter((t) => t.status === "In progress").length,
  pending: tasks.filter((t) => t.status === "To do").length,
}

export type Activity = {
  id: string
  memberId: string
  /** Display name — stored at log time so it survives member list changes */
  memberName?: string
  /** Initials — stored at log time for avatar rendering */
  memberInitials?: string
  action: string
  target: string
  time: string
  createdAt?: string
}

export const activities: Activity[] = [
  { id: "a1", memberId: "m1", action: "added 3 sources to", target: "Chapter 2", time: "2h ago" },
  { id: "a2", memberId: "m2", action: "completed", target: "Related Studies", time: "4h ago" },
  { id: "a3", memberId: "m3", action: "edited", target: "Chapter 1", time: "Yesterday" },
  { id: "a4", memberId: "m4", action: "added a citation to", target: "Theme 1", time: "Yesterday" },
  { id: "a5", memberId: "m5", action: "created task", target: "Research Instruments", time: "2 days ago" },
]

export const sourceSummary = {
  saved: 24,
  cited: 16,
  unused: 8,
}

export type Source = {
  id: string
  title: string
  author: string
  year: number
  tags: string[]
  usedIn: string[] // breadcrumb trail
  cited: boolean
  /** Reference link for the source itself (used by auto-fill and summaries). */
  url?: string
  /** Associated chapters (multi-select) — array of chapter IDs. */
  chapterIds?: string[]
  /**
   * Attached upload files (mutually exclusive with attachmentUrl).
   * Distinct from `url`: the group's own copies, served via /api/files.
   */
  files?: ChapterFile[]
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
  createdAt?: string
  updatedAt?: string
}

export const sources: Source[] = [
  {
    id: "s1",
    title: "AI-assisted learning environments and student research competencies",
    author: "Santos et al.",
    year: 2025,
    tags: ["AI in education", "Research skills"],
    usedIn: ["Chapter 2", "Related Literature", "Theme 1"],
    cited: true,
  },
  {
    id: "s2",
    title: "Self-regulated learning through intelligent tutoring systems",
    author: "Dela Cruz & Tan",
    year: 2024,
    tags: ["Self-regulation", "EdTech"],
    usedIn: ["Chapter 2", "Related Studies"],
    cited: true,
  },
  {
    id: "s3",
    title: "Digital literacy among undergraduate researchers: a meta-analysis",
    author: "Okafor",
    year: 2023,
    tags: ["Digital literacy"],
    usedIn: [],
    cited: false,
  },
]

export function membersByIds(ids: string[]): Member[] {
  return ids.map((id) => members.find((m) => m.id === id)).filter(Boolean) as Member[]
}

export function memberById(id: string): Member {
  return members.find((m) => m.id === id) ?? members[0]
}
