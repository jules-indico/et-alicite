"use client"

import { useMemo, useRef, useState } from "react"
import Link from "next/link"
import { AppShell } from "@/components/app-shell"
import { PageIntro } from "@/components/page-intro"
import { NewTaskModal } from "@/components/home-modals"
import { RemoveMemberDialog } from "@/components/remove-member-dialog"
import { TaskCard } from "@/components/task-card"
import { TaskSortDropdown, sortTaskList, TASK_SORT_KEYS, UNATTRIBUTED } from "@/components/tasks-flat-list"
import { useAuth } from "@/lib/auth-context"
import { fullNameOf } from "@/lib/names"
import { Avatar } from "@/components/primitives"
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
import { ListChecks, Plus, ArrowUpRight, Check, ChevronDown } from "lucide-react"

const STATUS_LINKS: Record<string, string> = {
  Total: "/tasks/total",
  Completed: "/tasks/completed",
  "In progress": "/tasks/in-progress",
  "To do": "/tasks/to-do",
}

function Stat({ label, value, tone, href }: { label: string; value: number; tone: string; href: string }) {
  return (
    <Link
      href={href}
      title={`View ${label.toLowerCase()} tasks`}
      aria-label={`View ${label.toLowerCase()} tasks`}
      className="flex flex-col rounded-2xl border border-border bg-card px-4 py-3 shadow-sm transition-colors hover:border-brand/40"
    >
      <span className={`text-2xl font-semibold tracking-tight ${tone}`}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </Link>
  )
}

/**
 * Full Tasks board (stat cards, per-assignee columns, creation + delete
 * flows). The stat cards link to dedicated pages (/tasks/total,
 * /tasks/completed, /tasks/in-progress, /tasks/to-do) which reuse the
 * shared flat task list instead of this board layout.
 */
export function TasksBoard() {
  const { currentUser } = useAuth()
  const { activeGroupId, activeGroup } = useActiveGroupId()
  // Group-scoped tasks: every member of the active group sees the same board.
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

  // Chapter multi-select filter (empty = no filtering, i.e. all chapters).
  // Same relationship/system as the Sources page: UNATTRIBUTED matches
  // tasks with no chapterId link.
  const [selectedChapters, setSelectedChapters] = useState<string[]>([])
  const [chapterMenuOpen, setChapterMenuOpen] = useState(false)
  const chapterMenuRef = useRef<HTMLDivElement>(null)
  useDismissOnOutsideClick({
    refs: chapterMenuRef,
    enabled: chapterMenuOpen,
    onDismiss: () => setChapterMenuOpen(false),
  })
  // Persisted sort on the shared "tasks" scope (same record as the Home
  // tasks sort, so the Task-name order syncs both ways).
  const [taskSort, setTaskSort] = useSectionSort(
    "tasks",
    { key: "updated", dir: "desc" },
    TASK_SORT_KEYS
  )

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

  // Page-scoped search (top-right pill): task name, assignee name, and
  // chapter, within the active group's already-loaded board.
  const [searchQuery, setSearchQuery] = useState("")
  const memberNameOf = (assigneeId: string): string =>
    people.find((m) => m.id === assigneeId)?.name ?? ""
  const searchedTasks = (() => {
    const inChapter = tasks.filter(matchesChapterFilter)
    const q = searchQuery.trim().toLowerCase()
    const matched = !q
      ? inChapter
      : inChapter.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            memberNameOf(t.assignee).toLowerCase().includes(q) ||
            t.chapter.toLowerCase().includes(q)
        )
    // Sort applies within each assignee column below.
    return sortTaskList(matched, taskSort)
  })()

  // Creation ("+ New task"): the exact panel used on Home.
  const [taskOpen, setTaskOpen] = useState(false)

  // Item being edited (null = creating): same edit/delete flow as Home.
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  // Pending delete awaiting confirmation (shared dialog).
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function handleConfirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await handleDeleteTask(pendingDelete)
      setPendingDelete(null)
    } catch {
      setDeleteError("Failed to delete. Please try again.")
    } finally {
      setDeleting(false)
    }
  }

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

  async function handleCreateTask(newT: Omit<Task, "id">) {
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

  const total = tasks.length
  const completed = tasks.filter((t) => t.status === "Completed").length
  const inProgress = tasks.filter((t) => t.status === "In progress").length
  const pending = tasks.filter((t) => t.status === "To do").length

  // Assignee-grouped columns: one per real group member plus Unassigned.
  // Status is badge-only now, so toggling never relocates a card; only an
  // assignee change moves it. Unassigned catches empty, departed, and legacy
  // assignees so every task appears exactly once.
  const rosterIds = new Set(people.map((m) => m.id))
  const boardColumns: { id: string; label: string; member: Member | null; items: Task[] }[] = [
    ...people.map((m) => ({
      id: m.id,
      label: m.name,
      member: m as Member | null,
      items: searchedTasks.filter((t) => t.assignee === m.id),
    })),
    {
      id: "__unassigned",
      label: "Unassigned",
      member: null,
      items: searchedTasks.filter((t) => !t.assignee || !rosterIds.has(t.assignee)),
    },
  ]

  return (
    <AppShell
      navSearch={{
        value: searchQuery,
        onChange: setSearchQuery,
        placeholder: "Search tasks…",
      }}
    >
      <PageIntro
        icon={ListChecks}
        eyebrow="Workload"
        title="Tasks"
        description="Track who is writing what, from background of the study to research instruments, across every chapter."
        action={
          isLeader ? (
            <button
              type="button"
              onClick={() => setTaskOpen(true)}
              disabled={!activeGroupId}
              title="Add task"
              aria-label="Add task"
              className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground shadow-sm transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="size-4" aria-hidden="true" />
              New task
            </button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total" value={total} tone="text-foreground" href={STATUS_LINKS.Total} />
        <Stat label="Completed" value={completed} tone="text-[oklch(0.45_0.12_155)]" href={STATUS_LINKS.Completed} />
        <Stat label="In progress" value={inProgress} tone="text-brand" href={STATUS_LINKS["In progress"]} />
        <Stat label="To do" value={pending} tone="text-muted-foreground" href={STATUS_LINKS["To do"]} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div ref={chapterMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setChapterMenuOpen((v) => !v)}
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
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading group tasks…</p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {boardColumns.map((col) => {
            const items = col.items
            return (
              <section
                key={col.id}
                className="flex min-w-64 flex-1 flex-col rounded-2xl border border-border bg-secondary/40 p-3"
                aria-labelledby={`col-${col.id}`}
              >
                <div className="mb-3 flex items-center gap-2 px-1">
                  {col.member ? (
                    <Link
                      href={`/users/${col.member.id}`}
                      title={`View ${col.member.name}'s profile`}
                      aria-label={`View ${col.member.name}'s profile`}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-lg"
                    >
                      <Avatar member={col.member} className="size-6 shrink-0 text-[0.6rem]" />
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground hover:text-brand hover:underline">{col.label}</span>
                    </Link>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{col.label}</span>
                  )}
                  <span id={`col-${col.id}`} className="text-xs font-medium text-muted-foreground">
                    {items.length}
                  </span>
                </div>
                <ul className="flex flex-col gap-2.5">
                  {items.length > 0 ? (
                    <>
                      {items.slice(0, 1).map((task) => (
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
                          onDelete={
                            isLeader
                              ? (id) => {
                                  setDeleteError(null)
                                  setPendingDelete(id)
                                }
                              : undefined
                          }
                        />
                      ))}
                      {items.length > 1 && (
                        <li>
                          <Link
                            href={`/tasks/${col.id}`}
                            className="flex items-center justify-center gap-1 rounded-xl border border-dashed border-border px-3 py-2 text-xs font-medium text-brand transition-colors hover:border-brand/50 hover:bg-brand/5"
                          >
                            View all <ArrowUpRight className="size-3.5" aria-hidden="true" />
                          </Link>
                        </li>
                      )}
                    </>
                  ) : (
                    <li className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                      No tasks
                    </li>
                  )}
                </ul>
              </section>
            )
          })}
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
        onCreate={handleCreateTask}
        initial={editingTask}
      />

      {/* Shared delete confirmation */}
      <RemoveMemberDialog
        open={Boolean(pendingDelete)}
        memberName={tasks.find((t) => t.id === pendingDelete)?.title ?? null}
        groupName={null}
        loading={deleting}
        error={deleteError}
        title="Delete Task"
        subtitle="This action cannot be undone."
        message={
          <>
            Delete{" "}
            <span className="font-semibold text-foreground">
              &ldquo;{tasks.find((t) => t.id === pendingDelete)?.title ?? "this task"}&rdquo;
            </span>
            ? This cannot be undone.
          </>
        }
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
