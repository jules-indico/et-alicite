"use client"

import { useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { ProgressBar } from "@/components/primitives"
import { RowActionsMenu } from "@/components/row-actions-menu"
import { NewChapterModal, NewTaskModal, NewSourceModal } from "@/components/home-modals"
import { RemoveMemberDialog } from "@/components/remove-member-dialog"
import { ChapterOpenDialog } from "@/components/chapter-open-dialog"
import { TaskCard } from "@/components/task-card"
import { SourceListRow } from "@/components/source-row"
import { TaskSortDropdown, sortTaskList, TASK_SORT_KEYS } from "@/components/tasks-flat-list"
import { useSectionSort } from "@/lib/use-section-view"
import { useDismissOnOutsideClick } from "@/lib/use-dismiss"
import { Z } from "@/lib/layers"
import { useAuth } from "@/lib/auth-context"
import { fullNameOf } from "@/lib/names"
import { chapterAttachment, type Chapter, type Source, type Task } from "@/lib/research-data"
import {
  useActiveGroupId,
  useGroupResearch,
  groupToMembers,
  chapterTaskProgress,
  isGroupLeader,
} from "@/lib/use-group-research"
import { cn } from "@/lib/utils"
import { Folder, FileText, BookMarked, ArrowLeft, ArrowRight, Paperclip, Check, ChevronDown } from "lucide-react"

const PREVIEW_LIMIT = 5

type PendingDelete = { kind: "chapter" | "task" | "source"; id: string; name: string } | null

type SourceFilter = "all" | "cited" | "unused"

const SOURCE_FILTERS: { id: SourceFilter; label: string }[] = [
  { id: "all", label: "All sources" },
  { id: "cited", label: "Cited" },
  { id: "unused", label: "Not used" },
]

type SourceSortKey = "title" | "created" | "updated"

const CHAPTER_SOURCE_SORT_KEYS: readonly SourceSortKey[] = ["title", "created", "updated"]

function sourceSortLabel(sort: { key: string; dir: "asc" | "desc" }): string {
  if (sort.key === "title") return `Title ${sort.dir === "asc" ? "A–Z" : "Z–A"}`
  if (sort.key === "created")
    return `Entry created · ${sort.dir === "desc" ? "Newest" : "Oldest"}`
  return `Most recently updated · ${sort.dir === "desc" ? "Newest" : "Oldest"}`
}

type TaskFilter = "all" | "completed" | "in-progress" | "todo"

const TASK_FILTERS: { id: TaskFilter; label: string; status: Task["status"] | null }[] = [
  { id: "all", label: "All tasks", status: null },
  { id: "completed", label: "Completed", status: "Completed" },
  { id: "in-progress", label: "In progress", status: "In progress" },
  { id: "todo", label: "To do", status: "To do" },
]

function chapterIcon(chapter: Chapter) {
  if (chapter.id === "c5") return BookMarked
  if (chapter.id === "c4") return FileText
  return Folder
}

export default function ChapterDetailPage() {
  const params = useParams()
  const rawId = params.chapterId
  const chapterId = Array.isArray(rawId) ? rawId[0] : (rawId as string)
  const { authState, currentUser } = useAuth()
  const router = useRouter()
  const { activeGroupId, activeGroup } = useActiveGroupId()
  // Same group-scoped source of truth as every list page.
  const {
    chapters,
    tasks,
    sources,
    loading,
    updateChapter,
    deleteChapter,
    updateTask,
    deleteTask,
    updateSource,
    deleteSource,
    logActivity,
    reload,
  } = useGroupResearch(activeGroupId)
  const people = useMemo(() => groupToMembers(activeGroup), [activeGroup])
  const isLeader = isGroupLeader(activeGroup, currentUser?.id)

  const chapter = chapters.find((c) => c.id === chapterId) ?? null
  const tp = chapter ? chapterTaskProgress(chapter.id, tasks) : null
  const chapterSources = useMemo(
    () => (chapter ? sources.filter((s) => (s.chapterIds ?? []).includes(chapter.id)) : []),
    [sources, chapter]
  )
  const chapterTasks = useMemo(
    () => (chapter ? tasks.filter((t) => t.chapterId === chapter.id) : []),
    [tasks, chapter]
  )

  // Chapter edit panel (same modal as Home/Research — edit only here).
  const [chapterOpen, setChapterOpen] = useState(false)
  // Attachment confirmation (same dialog, now triggered by button press).
  const [attachOpen, setAttachOpen] = useState(false)
  // Task/source edit panels (same modals as their pages — edit only here).
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [taskOpen, setTaskOpen] = useState(false)
  const [editingSource, setEditingSource] = useState<Source | null>(null)
  const [sourceOpen, setSourceOpen] = useState(false)

  // Sources-section controls (same dropdown patterns as the Sources page;
  // sort persisted per user under the chapter-sources scope).
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all")
  const [sourceStatusMenuOpen, setSourceStatusMenuOpen] = useState(false)
  const [sourceSort, setSourceSort] = useSectionSort(
    "chapter-sources",
    { key: "title", dir: "asc" },
    CHAPTER_SOURCE_SORT_KEYS
  )
  const [sourceSortMenuOpen, setSourceSortMenuOpen] = useState(false)
  const sourceStatusMenuRef = useRef<HTMLDivElement>(null)
  const sourceSortMenuRef = useRef<HTMLDivElement>(null)

  // Tasks-section controls (status dropdown mirrors the Sources style;
  // sort reuses the shared Tasks-page dropdown, persisted under
  // the chapter-tasks scope).
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all")
  const [taskStatusMenuOpen, setTaskStatusMenuOpen] = useState(false)
  const [taskSort, setTaskSort] = useSectionSort(
    "chapter-tasks",
    { key: "updated", dir: "desc" },
    TASK_SORT_KEYS
  )
  const taskStatusMenuRef = useRef<HTMLDivElement>(null)

  useDismissOnOutsideClick({
    refs: [sourceStatusMenuRef, sourceSortMenuRef, taskStatusMenuRef],
    enabled: sourceStatusMenuOpen || sourceSortMenuOpen || taskStatusMenuOpen,
    onDismiss: () => {
      setSourceStatusMenuOpen(false)
      setSourceSortMenuOpen(false)
      setTaskStatusMenuOpen(false)
    },
  })

  function selectSourceSort(key: SourceSortKey) {
    // Reselecting the active option flips direction (same toggle pattern
    // as the Sources page); new columns take their natural default.
    if (key === sourceSort.key) {
      setSourceSort({ key, dir: sourceSort.dir === "asc" ? "desc" : "asc" })
    } else {
      setSourceSort({ key, dir: key === "title" ? "asc" : "desc" })
    }
  }

  const visibleSources = useMemo(() => {
    const stamp = (iso?: string | null): number => {
      const t = Date.parse(iso ?? "")
      return Number.isNaN(t) ? -1 : t
    }
    const dir = sourceSort.dir === "asc" ? 1 : -1
    return [...chapterSources]
      .filter((s) => {
        if (sourceFilter === "cited" && !s.cited) return false
        if (sourceFilter === "unused" && s.cited) return false
        return true
      })
      .sort((a, b) => {
        if (sourceSort.key === "title") return a.title.localeCompare(b.title) * dir
        if (sourceSort.key === "created")
          return (stamp(a.createdAt) - stamp(b.createdAt)) * dir
        return (stamp(a.updatedAt) - stamp(b.updatedAt)) * dir
      })
  }, [chapterSources, sourceFilter, sourceSort])

  const visibleTasks = useMemo(() => {
    const wanted = TASK_FILTERS.find((f) => f.id === taskFilter)?.status ?? null
    const filtered =
      wanted === null ? chapterTasks : chapterTasks.filter((t) => t.status === wanted)
    return sortTaskList(filtered, taskSort)
  }, [chapterTasks, taskFilter, taskSort])

  // Shared delete confirmation (chapters, tasks, sources).
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const actorName = (currentUser && fullNameOf(currentUser)) || "Someone"
  const actor = {
    name: actorName,
    initials: actorName
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 3)
      .toUpperCase(),
  }

  function requestDelete(kind: "chapter" | "task" | "source", id: string) {
    const name =
      kind === "chapter"
        ? (chapters.find((c) => c.id === id)?.title ?? "this chapter")
        : kind === "task"
          ? (tasks.find((t) => t.id === id)?.title ?? "this task")
          : (sources.find((s) => s.id === id)?.title ?? "this source")
    setDeleteError(null)
    setPendingDelete({ kind, id, name })
  }

  async function handleDeleteChapter(id: string) {
    const target = chapters.find((c) => c.id === id)
    try {
      await deleteChapter(id)
      if (target) {
        await logActivity("deleted chapter", target.title, actor)
      }
      // Deleting a chapter unlinks it from sources server-side — refresh.
      await reload()
    } catch (err) {
      console.error("Failed to delete chapter:", err)
    }
  }

  async function handleSaveChapter(newCh: Omit<Chapter, "id">) {
    if (!chapter) return
    try {
      const updated = await updateChapter(chapter.id, {
        ...newCh,
        updated: "Just now",
      })
      if (updated) {
        await logActivity("edited chapter", updated.title, actor)
      }
    } catch (err) {
      console.error("Failed to save chapter:", err)
    }
  }

  async function handleSaveTask(newT: Omit<Task, "id">) {
    if (!editingTask) return
    try {
      const updated = await updateTask(editingTask.id, newT)
      if (updated) {
        await logActivity("edited task", updated.title, actor)
      }
      setEditingTask(null)
    } catch (err) {
      console.error("Failed to save task:", err)
    }
  }

  async function handleDeleteTask(id: string) {
    const target = tasks.find((t) => t.id === id)
    try {
      await deleteTask(id)
      if (target) {
        await logActivity("deleted task", target.title, actor)
      }
    } catch (err) {
      console.error("Failed to delete task:", err)
    }
  }

  async function handleToggleTaskStatus(id: string) {
    const statusCycle = ["To do", "In progress", "Completed"] as const
    const task = tasks.find((t) => t.id === id)
    if (!task) return
    const currentIdx = statusCycle.indexOf(task.status as (typeof statusCycle)[number])
    const nextStatus = statusCycle[(currentIdx + 1) % statusCycle.length]
    try {
      await updateTask(id, { status: nextStatus })
      if (nextStatus === "Completed") {
        await logActivity("completed task", task.title, actor)
      }
    } catch (err) {
      console.error("Failed to update task:", err)
    }
  }

  async function handleSaveSource(newS: Omit<Source, "id">) {
    if (!editingSource) return
    try {
      const updated = await updateSource(editingSource.id, newS)
      if (updated) {
        await logActivity("edited source", updated.title, actor)
      }
      setEditingSource(null)
    } catch (err) {
      console.error("Failed to save source:", err)
    }
  }

  async function handleDeleteSource(id: string) {
    const target = sources.find((s) => s.id === id)
    try {
      await deleteSource(id)
      if (target) {
        await logActivity("deleted source", target.title, actor)
      }
    } catch (err) {
      console.error("Failed to delete source:", err)
    }
  }

  async function handleToggleSourceStatus(id: string) {
    const source = sources.find((s) => s.id === id)
    if (!source) return
    const nextCited = !source.cited
    try {
      await updateSource(id, { cited: nextCited })
      await logActivity(nextCited ? "cited source" : "uncited source", source.title, actor)
    } catch (err) {
      console.error("Failed to update source:", err)
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      if (pendingDelete.kind === "chapter") {
        await handleDeleteChapter(pendingDelete.id)
        setPendingDelete(null)
        router.push("/research")
        return
      } else if (pendingDelete.kind === "task") await handleDeleteTask(pendingDelete.id)
      else await handleDeleteSource(pendingDelete.id)
      setPendingDelete(null)
    } catch {
      setDeleteError("Failed to delete. Please try again.")
    } finally {
      setDeleting(false)
    }
  }

  function deleteTitle() {
    if (!pendingDelete) return "Delete"
    if (pendingDelete.kind === "chapter") return "Delete Chapter"
    if (pendingDelete.kind === "task") return "Delete Task"
    return "Delete Source"
  }

  function deleteMessage() {
    if (!pendingDelete) return null
    const name = <span className="font-semibold text-foreground">&ldquo;{pendingDelete.name}&rdquo;</span>
    if (pendingDelete.kind === "chapter") {
      const n = tasks.filter((t) => t.chapterId === pendingDelete.id).length
      return (
        <>
          Delete {name}? Its {n} attributed task{n === 1 ? "" : "s"} will be unassigned from this
          chapter, and linked sources will be kept but unlinked. This cannot be undone.
        </>
      )
    }
    return <>Delete {name}? This cannot be undone.</>
  }

  if (authState.status === "unauthenticated") {
    router.replace("/login")
    return null
  }
  if (authState.status !== "authenticated") return null

  if (loading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading chapter…</p>
      </AppShell>
    )
  }

  if (!activeGroupId) {
    return (
      <AppShell>
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 py-14 text-center">
          <p className="text-sm font-medium text-foreground">No active research group</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Join or create a research group to view this chapter.
          </p>
        </div>
      </AppShell>
    )
  }

  if (!chapter || !tp) {
    return (
      <AppShell>
        <div className="flex items-center gap-3">
          <Link
            href="/research"
            className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to Research
          </Link>
        </div>
        <div className="mt-4 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 py-14 text-center">
          <p className="text-sm font-medium text-foreground">Chapter not found</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            This chapter doesn&apos;t exist in your active research group.
          </p>
        </div>
      </AppShell>
    )
  }

  const Icon = chapterIcon(chapter)
  const hasAttachment = !!chapterAttachment(chapter)
  const description = chapter.description?.trim() ?? ""

  return (
    <AppShell>
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/research"
          className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to Research
        </Link>
        <button
          type="button"
          onClick={() => window.history.back()}
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
        >
          Back
        </button>
      </div>

      <section
        aria-labelledby="chapter-detail-title"
        className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand/20 to-lavender/20 text-brand">
            <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <h1
            id="chapter-detail-title"
            className="min-w-0 flex-1 pt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
          >
            {chapter.title}
          </h1>
          <span className="flex shrink-0 items-center gap-1.5">
            <RowActionsMenu
              onDelete={() => requestDelete("chapter", chapter.id)}
              deleteLabel="Delete chapter"
              onEdit={() => setChapterOpen(true)}
              editLabel="Edit chapter"
            />
          </span>
        </div>

        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 pl-[52px] text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{chapter.label}</span>
          <span aria-hidden="true">·</span>
          {tp.percent === null ? (
            <span>No tasks yet</span>
          ) : (
            <span>
              {tp.completed}/{tp.total} tasks · {tp.percent}% complete
            </span>
          )}
          <span aria-hidden="true">·</span>
          <span>
            {chapterSources.length} source{chapterSources.length === 1 ? "" : "s"}
          </span>
        </p>

        <hr className="my-4 border-border" />

        {description ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {description}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No description yet.</p>
        )}

        <div className="mt-4">
          {tp.percent === null ? (
            <p className="text-xs font-medium text-muted-foreground">No tasks yet</p>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>Task completion</span>
                <span>{tp.percent}%</span>
              </div>
              <ProgressBar value={tp.percent} />
            </>
          )}
        </div>

        <div className="mt-4">
          {hasAttachment ? (
            <button
              type="button"
              onClick={() => setAttachOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-lavender px-4 py-2 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            >
              <Paperclip className="size-3.5" aria-hidden="true" />
              Open attachment
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-muted-foreground">No file or link attached.</p>
              <button
                type="button"
                onClick={() => setChapterOpen(true)}
                className="text-xs font-medium text-brand hover:underline"
              >
                Attach something
              </button>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="chapter-sources-heading">
        <div className="mb-3 flex items-center gap-2">
          <h2 id="chapter-sources-heading" className="text-sm font-semibold text-foreground">
            Sources &amp; citations
          </h2>
          <span className="text-xs font-medium text-muted-foreground">
            {chapterSources.length}
          </span>
        </div>
        {chapterSources.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 py-10 text-center">
            <p className="text-sm text-muted-foreground">No sources linked to this chapter yet.</p>
          </div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div ref={sourceStatusMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setSourceStatusMenuOpen((v) => !v)
                    setSourceSortMenuOpen(false)
                  }}
                  aria-expanded={sourceStatusMenuOpen}
                  aria-haspopup="listbox"
                  aria-label="Filter by cited status"
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                    sourceFilter !== "all" || sourceStatusMenuOpen
                      ? "bg-brand text-brand-foreground shadow-sm"
                      : "border border-border bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  {SOURCE_FILTERS.find((f) => f.id === sourceFilter)?.label ?? "All sources"}
                  <ChevronDown className="size-3.5" aria-hidden="true" />
                </button>
                {sourceStatusMenuOpen && (
                  <div
                    role="listbox"
                    aria-label="Filter by cited status"
                    className={`absolute left-0 ${Z.menu} mt-2 w-48 overflow-hidden rounded-2xl border border-border bg-popover p-1.5 shadow-xl`}
                  >
                    {SOURCE_FILTERS.map((f) => {
                      const selected = sourceFilter === f.id
                      return (
                        <div
                          key={f.id}
                          role="option"
                          aria-selected={selected}
                          onClick={() => {
                            setSourceFilter(f.id)
                            setSourceStatusMenuOpen(false)
                          }}
                          className={cn(
                            "flex cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 transition-colors",
                            selected ? "bg-brand/5" : "hover:bg-secondary/40",
                          )}
                        >
                          <span className="truncate text-xs font-medium text-foreground">{f.label}</span>
                          <div
                            className={cn(
                              "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                              selected ? "border-brand bg-brand text-white" : "border-border bg-background",
                            )}
                          >
                            {selected && <Check className="size-3 stroke-[3]" />}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              <div ref={sourceSortMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setSourceSortMenuOpen((v) => !v)
                    setSourceStatusMenuOpen(false)
                  }}
                  aria-expanded={sourceSortMenuOpen}
                  aria-haspopup="listbox"
                  aria-label={`Sort sources, current: ${sourceSortLabel(sourceSort)}`}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                    sourceSortMenuOpen
                      ? "bg-brand text-brand-foreground shadow-sm"
                      : "border border-border bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="max-w-44 truncate">{sourceSortLabel(sourceSort)}</span>
                  <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
                </button>
                {sourceSortMenuOpen && (
                  <div
                    role="listbox"
                    aria-label="Sort sources"
                    className={`absolute left-0 ${Z.menu} mt-2 w-60 overflow-hidden rounded-2xl border border-border bg-popover p-1.5 shadow-xl`}
                  >
                    {(
                      [
                        { key: "title", label: "Title" },
                        { key: "created", label: "Entry created" },
                        { key: "updated", label: "Most recently updated" },
                      ] as const
                    ).map((opt) => {
                      const selected = sourceSort.key === opt.key
                      return (
                        <div
                          key={opt.key}
                          role="option"
                          aria-selected={selected}
                          onClick={() => {
                            selectSourceSort(opt.key)
                            setSourceSortMenuOpen(false)
                          }}
                          className={cn(
                            "flex cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 transition-colors",
                            selected ? "bg-brand/5" : "hover:bg-secondary/40",
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-medium text-foreground">
                              {opt.label}
                            </span>
                            {selected && (
                              <span className="block text-[0.68rem] text-muted-foreground">
                                {sourceSortLabel(sourceSort)}
                              </span>
                            )}
                          </span>
                          <div
                            className={cn(
                              "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                              selected ? "border-brand bg-brand text-white" : "border-border bg-background",
                            )}
                          >
                            {selected && <Check className="size-3 stroke-[3]" />}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
            <ul className="divide-y divide-border/60 px-2 py-1">
              {visibleSources.slice(0, PREVIEW_LIMIT).map((source) => (
                <SourceListRow
                  key={source.id}
                  source={source}
                  chapters={chapters}
                  onToggleStatus={handleToggleSourceStatus}
                  onEdit={(s) => {
                    setEditingSource(s)
                    setSourceOpen(true)
                  }}
                  onDelete={(id) => requestDelete("source", id)}
                />
              ))}
              {chapterSources.length > PREVIEW_LIMIT && (
                <li>
                  <Link
                    href="/sources"
                    title="View all sources"
                    aria-label="View all sources"
                    className="flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-brand"
                  >
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </li>
              )}
            </ul>
          </div>
          </>
        )}
      </section>

      <section aria-labelledby="chapter-tasks-heading">
        <div className="mb-3 flex items-center gap-2">
          <h2 id="chapter-tasks-heading" className="text-sm font-semibold text-foreground">
            Research tasks
          </h2>
          <span className="text-xs font-medium text-muted-foreground">
            {chapterTasks.length}
          </span>
        </div>
        {chapterTasks.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 py-10 text-center">
            <p className="text-sm text-muted-foreground">No tasks attributed to this chapter yet.</p>
          </div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div ref={taskStatusMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setTaskStatusMenuOpen((v) => !v)}
                  aria-expanded={taskStatusMenuOpen}
                  aria-haspopup="listbox"
                  aria-label="Filter by task status"
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                    taskFilter !== "all" || taskStatusMenuOpen
                      ? "bg-brand text-brand-foreground shadow-sm"
                      : "border border-border bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  {TASK_FILTERS.find((f) => f.id === taskFilter)?.label ?? "All tasks"}
                  <ChevronDown className="size-3.5" aria-hidden="true" />
                </button>
                {taskStatusMenuOpen && (
                  <div
                    role="listbox"
                    aria-label="Filter by task status"
                    className={`absolute left-0 ${Z.menu} mt-2 w-48 overflow-hidden rounded-2xl border border-border bg-popover p-1.5 shadow-xl`}
                  >
                    {TASK_FILTERS.map((f) => {
                      const selected = taskFilter === f.id
                      return (
                        <div
                          key={f.id}
                          role="option"
                          aria-selected={selected}
                          onClick={() => {
                            setTaskFilter(f.id)
                            setTaskStatusMenuOpen(false)
                          }}
                          className={cn(
                            "flex cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 transition-colors",
                            selected ? "bg-brand/5" : "hover:bg-secondary/40",
                          )}
                        >
                          <span className="truncate text-xs font-medium text-foreground">{f.label}</span>
                          <div
                            className={cn(
                              "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                              selected ? "border-brand bg-brand text-white" : "border-border bg-background",
                            )}
                          >
                            {selected && <Check className="size-3 stroke-[3]" />}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              <TaskSortDropdown value={taskSort} onChange={setTaskSort} />
            </div>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibleTasks.slice(0, PREVIEW_LIMIT).map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  members={people}
                  onToggleStatus={handleToggleTaskStatus}
                  onEdit={
                    isLeader
                      ? (t) => {
                          setEditingTask(t)
                          setTaskOpen(true)
                        }
                      : undefined
                  }
                  onDelete={isLeader ? (id) => requestDelete("task", id) : undefined}
                />
              ))}
            </ul>
            {chapterTasks.length > PREVIEW_LIMIT && (
              <Link
                href="/tasks"
                title="View all tasks"
                aria-label="View all tasks"
                className={cn(
                  "mt-3 flex min-h-[4rem] items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 text-muted-foreground transition-colors",
                  "hover:border-brand/50 hover:bg-card hover:text-brand"
                )}
              >
                <ArrowRight className="size-5" aria-hidden="true" />
              </Link>
            )}
          </>
        )}
      </section>

      <NewChapterModal
        open={chapterOpen}
        onClose={() => setChapterOpen(false)}
        onCreate={handleSaveChapter}
        initial={chapter}
      />

      <NewTaskModal
        open={taskOpen}
        onClose={() => {
          setTaskOpen(false)
          setEditingTask(null)
        }}
        chapters={chapters}
        members={people}
        onCreate={handleSaveTask}
        initial={editingTask}
      />

      <NewSourceModal
        open={sourceOpen}
        onClose={() => {
          setSourceOpen(false)
          setEditingSource(null)
        }}
        onCreate={handleSaveSource}
        initial={editingSource}
        chapters={chapters}
      />

      {/* Attachment confirmation (shared dialog, unchanged behavior) */}
      <ChapterOpenDialog
        chapter={attachOpen ? chapter : null}
        onClose={() => setAttachOpen(false)}
        onAttach={() => {
          setAttachOpen(false)
          setChapterOpen(true)
        }}
      />

      {/* Shared delete confirmation (chapters, tasks, sources) */}
      <RemoveMemberDialog
        open={Boolean(pendingDelete)}
        memberName={pendingDelete?.name ?? null}
        groupName={null}
        loading={deleting}
        error={deleteError}
        title={deleteTitle()}
        subtitle="This action cannot be undone."
        message={deleteMessage()}
        confirmLabel="Delete"
        confirmingLabel="Deleting..."
        onClose={() => {
          if (!deleting) {
            setPendingDelete(null)
            setDeleteError(null)
          }
        }}
        onConfirm={handleConfirmDelete}
      />
    </AppShell>
  )
}
