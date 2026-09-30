"use client"

import { useMemo, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { AppShell } from "@/components/app-shell"
import { PageIntro } from "@/components/page-intro"
import { NewTaskModal } from "@/components/home-modals"
import { TaskCard } from "@/components/task-card"
import { Avatar } from "@/components/primitives"
import { useAuth } from "@/lib/auth-context"
import { fullNameOf } from "@/lib/names"
import { useDismissOnOutsideClick } from "@/lib/use-dismiss"
import { Z } from "@/lib/layers"
import { cn } from "@/lib/utils"
import { TASK_STATUSES, type Chapter, type Member, type Task, type TaskStatus } from "@/lib/research-data"
import { useSectionSort } from "@/lib/use-section-view"
import {
  useActiveGroupId,
  useGroupResearch,
  groupToMembers,
  isGroupLeader,
} from "@/lib/use-group-research"
import { ListChecks, ArrowLeft, Check, ChevronDown, Plus } from "lucide-react"

export type TaskActor = { name: string; initials: string }

/** Sentinel id for the "no chapter" option (tasks with no chapterId link). */
export const UNATTRIBUTED = "__unattributed"

/** Sortable columns for the task sort dropdown. */
export const TASK_SORT_KEYS = ["name", "created", "updated"] as const

export type TaskSortKey = (typeof TASK_SORT_KEYS)[number]

export function taskSortLabel(sort: { key: string; dir: "asc" | "desc" }): string {
  if (sort.key === "name") return `Task name ${sort.dir === "asc" ? "A–Z" : "Z–A"}`
  if (sort.key === "created")
    return `Entry created · ${sort.dir === "desc" ? "Newest" : "Oldest"}`
  return `Most recently updated · ${sort.dir === "desc" ? "Newest" : "Oldest"}`
}

/** Missing timestamps rank below all dated entries (reversibly). */
function taskStamp(iso?: string | null): number {
  const t = Date.parse(iso ?? "")
  return Number.isNaN(t) ? -1 : t
}

export function sortTaskList(
  list: Task[],
  sort: { key: string; dir: "asc" | "desc" }
): Task[] {
  const dir = sort.dir === "asc" ? 1 : -1
  return [...list].sort((a, b) => {
    if (sort.key === "name") return a.title.localeCompare(b.title) * dir
    if (sort.key === "created")
      return (taskStamp(a.createdAt) - taskStamp(b.createdAt)) * dir
    return (taskStamp(a.updatedAt) - taskStamp(b.updatedAt)) * dir
  })
}

/**
 * Self-contained task sort dropdown matching the Chapter filter styling.
 * Reselecting the active option flips direction; new options take their
 * natural default (A–Z for names, newest-first for dates).
 */
export function TaskSortDropdown({
  value,
  onChange,
}: {
  value: { key: string; dir: "asc" | "desc" }
  onChange: (next: { key: TaskSortKey; dir: "asc" | "desc" }) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismissOnOutsideClick({
    refs: ref,
    enabled: open,
    onDismiss: () => setOpen(false),
  })

  function select(key: TaskSortKey) {
    if (key === value.key) {
      onChange({ key, dir: value.dir === "asc" ? "desc" : "asc" })
    } else {
      onChange({ key, dir: key === "name" ? "asc" : "desc" })
    }
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Sort tasks, current: ${taskSortLabel(value)}`}
        className={cn(
          "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
          open
            ? "bg-brand text-brand-foreground shadow-sm"
            : "border border-border bg-card text-muted-foreground hover:text-foreground",
        )}
      >
        <span className="max-w-44 truncate">{taskSortLabel(value)}</span>
        <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="Sort tasks"
          className={`absolute left-0 ${Z.menu} mt-2 w-60 overflow-hidden rounded-2xl border border-border bg-popover p-1.5 shadow-xl`}
        >
          {(
            [
              { key: "name", label: "Task name" },
              { key: "created", label: "Entry created" },
              { key: "updated", label: "Most recently updated" },
            ] as const
          ).map((opt) => {
            const selected = value.key === opt.key
            return (
              <div
                key={opt.key}
                role="option"
                aria-selected={selected}
                onClick={() => select(opt.key)}
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
                      {taskSortLabel(value)}
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
  )
}

/**
 * Flat task list (one card per task, across all assignees): the same list
 * shown behind an assignee's "View all" link. Handles status toggling,
 * edit/delete flows, and — when allowCreate is set — creation with a
 * pre-filled (still changeable) status. Callers pre-filter `tasks`
 * (by assignee, by status, or not at all).
 */
export function TasksFlatList({
  tasks,
  people,
  chapters,
  actor,
  createTask,
  updateTask,
  deleteTask,
  logActivity,
  isLeader,
  allowCreate = false,
  defaultStatus = "To do",
  emptyTitle = "No tasks yet.",
  emptyHint,
  /** Optional left-side toolbar content (e.g. a filter dropdown + count
   * badge). Renders on the same row as the New-task button. */
  toolbar,
}: {
  tasks: Task[]
  people: Member[]
  chapters: Chapter[]
  actor: TaskActor
  createTask: (input: Omit<Task, "id">, actor: TaskActor) => Promise<unknown>
  updateTask: (id: string, patch: Partial<Omit<Task, "id">>) => Promise<Task | undefined>
  deleteTask: (id: string) => Promise<void>
  logActivity: (action: string, target: string, actor?: TaskActor) => Promise<void>
  isLeader: boolean
  allowCreate?: boolean
  defaultStatus?: TaskStatus
  emptyTitle?: string
  emptyHint?: string
  toolbar?: ReactNode
}) {
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [taskOpen, setTaskOpen] = useState(false)

  async function handleSaveTask(newT: Omit<Task, "id">) {
    try {
      if (editingTask) {
        const updated = await updateTask(editingTask.id, newT)
        if (updated) {
          await logActivity("edited task", updated.title, actor)
        }
        setEditingTask(null)
      } else {
        await createTask(newT, actor)
      }
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
    const statusCycle: TaskStatus[] = [...TASK_STATUSES]
    const task = tasks.find((t) => t.id === id)
    if (!task) return
    const currentIdx = statusCycle.indexOf(task.status)
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

  const showToolbar = toolbar !== undefined || (allowCreate && isLeader)

  return (
    <>
      {showToolbar && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {toolbar}
          {allowCreate && isLeader && (
            <span className="ml-auto">
              <button
                type="button"
                onClick={() => {
                  setEditingTask(null)
                  setTaskOpen(true)
                }}
                title="Add task"
                aria-label="Add task"
                className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground shadow-sm transition-colors hover:opacity-90"
              >
                <Plus className="size-4" aria-hidden="true" />
                New task
              </button>
            </span>
          )}
        </div>
      )}

      {tasks.length > 0 ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tasks.map((task) => (
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
              onDelete={isLeader ? handleDeleteTask : undefined}
            />
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 py-14 text-center">
          <p className="text-sm text-muted-foreground">{emptyTitle}</p>
          {emptyHint && <p className="max-w-sm text-xs text-muted-foreground">{emptyHint}</p>}
        </div>
      )}

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
        defaultStatus={defaultStatus}
      />
    </>
  )
}

/**
 * Dedicated per-status task page (plus the unfiltered "Total" page): the
 * same flat list across all assignees, filtered by status instead of by
 * assignee. The creation dialog pre-fills the page's status ("To do" on
 * the Total page).
 */
export function StatusTasksView({
  status,
  heading,
  description,
}: {
  status: TaskStatus | null
  heading: string
  description: string
}) {
  const { currentUser } = useAuth()
  const { activeGroupId, activeGroup } = useActiveGroupId()
  const {
    tasks,
    chapters,
    loading,
    createTask,
    updateTask,
    deleteTask,
    logActivity,
  } = useGroupResearch(activeGroupId)
  const people = useMemo(() => groupToMembers(activeGroup), [activeGroup])
  const isLeader = isGroupLeader(activeGroup, currentUser?.id)

  // Persisted per-page sort (independent saved sort per detail page,
  // matching the per-page chapter-filter state).
  const sortScope =
    status === null
      ? "tasks-total"
      : status === "Completed"
        ? "tasks-completed"
        : status === "In progress"
          ? "tasks-in-progress"
          : "tasks-to-do"
  const [taskSort, setTaskSort] = useSectionSort(
    sortScope,
    { key: "updated", dir: "desc" },
    TASK_SORT_KEYS
  )

  // Assignee filter: "all" (default, no filtering) or a member id.
  const [assigneeId, setAssigneeId] = useState<string>("all")
  const [assigneeMenuOpen, setAssigneeMenuOpen] = useState(false)
  const assigneeMenuRef = useRef<HTMLDivElement>(null)
  // Chapter multi-select filter (empty = no filtering, i.e. all chapters).
  // Same relationship/system as the Sources page: UNATTRIBUTED matches
  // tasks with no chapterId link.
  const [selectedChapters, setSelectedChapters] = useState<string[]>([])
  const [chapterMenuOpen, setChapterMenuOpen] = useState(false)
  const chapterMenuRef = useRef<HTMLDivElement>(null)
  useDismissOnOutsideClick({
    refs: [assigneeMenuRef, chapterMenuRef],
    enabled: assigneeMenuOpen || chapterMenuOpen,
    onDismiss: () => {
      setAssigneeMenuOpen(false)
      setChapterMenuOpen(false)
    },
  })
  const assigneeName =
    assigneeId === "all"
      ? "All members"
      : (people.find((m) => m.id === assigneeId)?.name ?? "All members")

  const actorName = (currentUser && fullNameOf(currentUser)) || "Someone"
  const actor: TaskActor = {
    name: actorName,
    initials: actorName
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 3)
      .toUpperCase(),
  }

  function toggleChapterFilter(id: string) {
    setSelectedChapters((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    )
  }

  function matchesChapterFilter(t: Task): boolean {
    if (selectedChapters.length === 0) return true
    if (!t.chapterId) return selectedChapters.includes(UNATTRIBUTED)
    return selectedChapters.includes(t.chapterId)
  }

  const filtered = useMemo(() => {
    const inStatus = status ? tasks.filter((t) => t.status === status) : tasks
    const inChapter = inStatus.filter(matchesChapterFilter)
    if (assigneeId === "all") return inChapter
    return inChapter.filter((t) => t.assignee === assigneeId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, status, assigneeId, selectedChapters])

  const sorted = useMemo(
    () => sortTaskList(filtered, taskSort),
    [filtered, taskSort]
  )

  return (
    <AppShell>
      <Link
        href="/tasks"
        className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to Tasks board
      </Link>

      <PageIntro
        icon={ListChecks}
        eyebrow="Workload"
        title={heading}
        description={description}
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading group tasks…</p>
      ) : (
        <TasksFlatList
          tasks={sorted}
          people={people}
          chapters={chapters}
          actor={actor}
          createTask={createTask}
          updateTask={updateTask}
          deleteTask={deleteTask}
          logActivity={logActivity}
          isLeader={isLeader}
          allowCreate
          defaultStatus={status ?? "To do"}
          emptyTitle={status ? `No ${status} tasks yet.` : "No tasks yet."}
          toolbar={
            <>
              <div ref={assigneeMenuRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setAssigneeMenuOpen((v) => !v)
                  setChapterMenuOpen(false)
                }}
                aria-expanded={assigneeMenuOpen}
                aria-haspopup="listbox"
                aria-label="Filter by assignee"
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                  assigneeId !== "all" || assigneeMenuOpen
                    ? "bg-brand text-brand-foreground shadow-sm"
                    : "border border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="max-w-40 truncate">{assigneeName}</span>
                <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
              </button>
              {assigneeMenuOpen && (
                <div
                  role="listbox"
                  aria-label="Filter by assignee"
                  className={`absolute left-0 ${Z.menu} mt-2 max-h-72 w-64 overflow-y-auto rounded-2xl border border-border bg-popover p-1.5 shadow-xl`}
                >
                  {[{ id: "all", name: "All members" } as Member, ...people].map((m) => {
                    const selected = assigneeId === m.id
                    return (
                      <div
                        key={m.id}
                        role="option"
                        aria-selected={selected}
                        onClick={() => {
                          setAssigneeId(m.id)
                          setAssigneeMenuOpen(false)
                        }}
                        className={cn(
                          "flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 transition-colors",
                          selected ? "bg-brand/5" : "hover:bg-secondary/40",
                        )}
                      >
                        {m.id !== "all" && (
                          <Avatar member={m} className="size-6 shrink-0 text-[0.6rem]" />
                        )}
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                          {m.name}
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
            <div ref={chapterMenuRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setChapterMenuOpen((v) => !v)
                  setAssigneeMenuOpen(false)
                }}
                aria-expanded={chapterMenuOpen}
                aria-haspopup="listbox"
                aria-label="Filter by chapter"
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                  selectedChapters.length > 0 || chapterMenuOpen
                    ? "bg-brand text-brand-foreground shadow-sm"
                    : "border border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                Chapter
                {selectedChapters.length > 0 && (
                  <span className="flex size-5 items-center justify-center rounded-full bg-brand-foreground/25 text-[0.7rem] font-semibold">
                    {selectedChapters.length}
                  </span>
                )}
                <ChevronDown className="size-3.5" aria-hidden="true" />
              </button>
              {chapterMenuOpen && (
                <div
                  role="listbox"
                  aria-label="Filter by chapter"
                  className={`absolute left-0 ${Z.menu} mt-2 max-h-72 w-64 overflow-y-auto rounded-2xl border border-border bg-popover p-1.5 shadow-xl`}
                >
                  {selectedChapters.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedChapters([])}
                      className="w-full rounded-xl px-3 py-2 text-left text-xs font-medium text-brand transition-colors hover:bg-secondary"
                    >
                      Clear selection
                    </button>
                  )}
                  {[{ id: UNATTRIBUTED, title: "General/unattributed", label: "Tasks with no chapter" } as Chapter,
                    ...chapters].map((c) => {
                    const checked = selectedChapters.includes(c.id)
                    const isGeneral = c.id === UNATTRIBUTED
                    return (
                      <div
                        key={c.id}
                        role="option"
                        aria-selected={checked}
                        onClick={() => toggleChapterFilter(c.id)}
                        className={cn(
                          "flex cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 transition-colors",
                          checked ? "bg-brand/5" : "hover:bg-secondary/40",
                        )}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-foreground">{c.title}</p>
                          {!isGeneral && (
                            <p className="truncate text-[0.68rem] text-muted-foreground">{c.label}</p>
                          )}
                        </div>
                        <div
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                            checked ? "border-brand bg-brand text-white" : "border-border bg-background",
                          )}
                        >
                          {checked && <Check className="size-3 stroke-[3]" />}
                        </div>
                      </div>
                    )
                  })}
                  {chapters.length === 0 && (
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                      No research chapters yet.
                    </p>
                  )}
                </div>
              )}
            </div>
            <TaskSortDropdown value={taskSort} onChange={setTaskSort} />
            <span
              title={`${filtered.length} task${filtered.length === 1 ? "" : "s"} shown`}
              className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-sm"
            >
              {filtered.length} shown
            </span>
            </>
          }
        />
      )}
    </AppShell>
  )
}
