"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { PageIntro } from "@/components/page-intro"
import { NewTaskModal } from "@/components/home-modals"
import { TasksFlatList } from "@/components/tasks-flat-list"
import { RowActionsMenu } from "@/components/row-actions-menu"
import { useAuth } from "@/lib/auth-context"
import { fullNameOf } from "@/lib/names"
import { Avatar } from "@/components/primitives"
import { TASK_STATUSES, type Task, type TaskStatus, type Member, type Chapter } from "@/lib/research-data"
import {
  useActiveGroupId,
  useGroupResearch,
  groupToMembers,
  displayMember,
  isGroupLeader,
} from "@/lib/use-group-research"
import { ListChecks, ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"

const UNASSIGNED_ID = "__unassigned"
const STATUS_CYCLE: TaskStatus[] = [...TASK_STATUSES]

type Actor = { name: string; initials: string }

// ─── Member workload view (previously the [memberId] route) ─────────────────

function MemberView({
  memberId,
  people,
  tasks,
  chapters,
  activeGroup,
  actor,
  createTask,
  updateTask,
  deleteTask,
  logActivity,
  isLeader,
}: {
  memberId: string
  people: Member[]
  tasks: Task[]
  chapters: Chapter[]
  activeGroup: any | null
  actor: Actor
  createTask: (input: Omit<Task, "id">, actor: Actor) => Promise<unknown>
  updateTask: (id: string, patch: Partial<Omit<Task, "id">>) => Promise<Task | undefined>
  deleteTask: (id: string) => Promise<void>
  logActivity: (action: string, target: string, actor?: Actor) => Promise<void>
  isLeader: boolean
}) {
  const isUnassigned = memberId === UNASSIGNED_ID
  const member: Member | null = isUnassigned
    ? null
    : (people.find((m) => m.id === memberId) ?? null)
  const rosterIds = useMemo(() => new Set(people.map((m) => m.id)), [people])
  const memberTasks = useMemo(() => {
    if (isUnassigned) return tasks.filter((t) => !t.assignee || !rosterIds.has(t.assignee))
    if (!member) return []
    return tasks.filter((t) => t.assignee === member.id)
  }, [tasks, isUnassigned, member, rosterIds])
  const leaderId = activeGroup ? activeGroup.leader || activeGroup.ownerId : null

  return (
    <>
      <Link
        href="/tasks"
        className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to Tasks board
      </Link>

      <PageIntro
        icon={ListChecks}
        eyebrow="Member workload"
        title={isUnassigned ? "Unassigned" : (member?.name ?? "Member")}
        description={
          member || isUnassigned
            ? `All ${memberTasks.length} research task${memberTasks.length === 1 ? "" : "s"} ${isUnassigned ? "without an assignee" : `assigned to ${member?.name}`} in ${activeGroup?.name ?? "this group"}.`
            : "This member is not part of your active research group."
        }
        action={
          member && !isUnassigned ? (
            <span className="flex items-center gap-2">
              <Avatar member={displayMember(people, member.id)} className="size-9 text-xs" />
              {member.id === leaderId && (
                <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[0.65rem] font-semibold text-brand">
                  Leader
                </span>
              )}
            </span>
          ) : undefined
        }
      />

      {member || isUnassigned ? (
        <TasksFlatList
          tasks={memberTasks}
          people={people}
          chapters={chapters}
          actor={actor}
          createTask={createTask}
          updateTask={updateTask}
          deleteTask={deleteTask}
          logActivity={logActivity}
          isLeader={isLeader}
          emptyTitle="No tasks assigned yet."
        />
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 py-14 text-center">
          <p className="text-sm font-medium text-foreground">Member not found in this group</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            This page only shows tasks for members of your active research group.
          </p>
        </div>
      )}

    </>
  )
}

// ─── Task detail view ────────────────────────────────────────────────────────

/** "2026-09-28" → "Sep 28, 2026", parsed as a local date (no timezone shift). */
function formatDueDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const d = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

function TaskDetailView({
  task,
  people,
  chapters,
  actor,
  updateTask,
  logActivity,
  isLeader,
}: {
  task: Task
  people: Member[]
  chapters: Chapter[]
  actor: Actor
  updateTask: (id: string, patch: Partial<Omit<Task, "id">>) => Promise<Task | undefined>
  logActivity: (action: string, target: string, actor?: Actor) => Promise<void>
  isLeader: boolean
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [statusSaving, setStatusSaving] = useState(false)
  const [statusError, setStatusError] = useState("")

  const member = displayMember(people, task.assignee)
  const assigneeName = member.name === "Unknown member" ? "Former member" : member.name

  // Status changes are frequent — applied immediately without the edit panel.
  async function handleStatusChange(next: TaskStatus) {
    if (next === task.status || statusSaving) return
    setStatusError("")
    setStatusSaving(true)
    try {
      const updated = await updateTask(task.id, { status: next })
      if (updated) {
        await logActivity(
          next === "Completed" ? "completed task" : "edited task",
          updated.title,
          actor
        )
      }
    } catch (err) {
      console.error("Failed to update task status:", err)
      setStatusError("Failed to update status. Please try again.")
    } finally {
      setStatusSaving(false)
    }
  }

  // All other edits go through the shared Create/Edit panel (same modal as
  // the Tasks board and member pages — no separate form here).
  async function handleSaveTask(newT: Omit<Task, "id">) {
    try {
      const updated = await updateTask(task.id, newT)
      if (updated) {
        await logActivity("edited task", updated.title, actor)
      }
    } catch (err) {
      console.error("Failed to save task:", err)
    }
  }

  const description = task.description?.trim() ?? ""

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/tasks"
          className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to Tasks board
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
        aria-labelledby="task-detail-title"
        className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
            <ListChecks className="size-5" aria-hidden="true" />
          </span>
          <h1
            id="task-detail-title"
            className="min-w-0 flex-1 pt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
          >
            {task.title}
          </h1>
          <span className="flex shrink-0 items-center gap-1.5">
            <select
              value={task.status}
              disabled={statusSaving}
              onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
              title="Change status"
              aria-label="Change task status"
              className="cursor-pointer rounded-full border border-border bg-secondary/80 px-2.5 py-1 text-xs font-medium text-foreground outline-none transition-colors hover:bg-secondary disabled:cursor-wait disabled:opacity-60"
            >
              {STATUS_CYCLE.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {isLeader && (
              <RowActionsMenu onEdit={() => setEditOpen(true)} editLabel="Edit task" />
            )}
          </span>
        </div>

        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 pl-[52px] text-xs text-muted-foreground">
          <Avatar member={member} className="size-4 text-[0.45rem] ring-1" />
          <span className="font-medium text-foreground">{assigneeName}</span>
          <span aria-hidden="true">·</span>
          <span>{task.chapter}</span>
          {task.dueDate && (
            <>
              <span aria-hidden="true">·</span>
              <span>Due {formatDueDate(task.dueDate)}</span>
            </>
          )}
        </p>

        <hr className="my-4 border-border" />

        {description ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {description}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No description yet.</p>
        )}

        {statusError && (
          <p className="mt-3 text-xs text-destructive">{statusError}</p>
        )}
      </section>

      <NewTaskModal
        open={editOpen && isLeader}
        onClose={() => setEditOpen(false)}
        chapters={chapters}
        members={people}
        onCreate={handleSaveTask}
        initial={task}
      />
    </>
  )
}

export default function TaskRoutePage() {
  const params = useParams()
  const rawId = params.id
  const id = Array.isArray(rawId) ? rawId[0] : (rawId as string)
  const { currentUser } = useAuth()
  const { activeGroupId, activeGroup } = useActiveGroupId()
  // Same underlying task data as Home, Research, Tasks board, and member views.
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
    const task = tasks.find((t) => t.id === id)
    if (!task) return
    const currentIdx = STATUS_CYCLE.indexOf(task.status)
    const nextStatus = STATUS_CYCLE[(currentIdx + 1) % STATUS_CYCLE.length]
    try {
      await updateTask(id, { status: nextStatus })
      if (nextStatus === "Completed") {
        await logActivity("completed task", task.title, actor)
      }
    } catch (err) {
      console.error("Failed to update task:", err)
    }
  }

  const isUnassigned = id === UNASSIGNED_ID
  const member = !isUnassigned ? (people.find((m) => m.id === id) ?? null) : null
  const task = !member && !isUnassigned ? (tasks.find((t) => t.id === id) ?? null) : null

  // Cross-group fallback: the id may belong to a task in one of the user's
  // OTHER groups (e.g. opened from the Account task list). Resolve its group,
  // then load that group's data through a second shared-hook instance so
  // editing/logging stay scoped to the owning group.
  const [foreignGroupId, setForeignGroupId] = useState<string | null>(null)
  const [foreignGroup, setForeignGroup] = useState<any | null>(null)
  const [foreignChecked, setForeignChecked] = useState(false)
  useEffect(() => {
    if (member || isUnassigned || task || loading || foreignGroupId || foreignChecked) return
    let cancelled = false
    async function locate() {
      try {
        const [assignedRes, groupsRes] = await Promise.all([
          fetch("/api/tasks/assigned", { cache: "no-store" }),
          fetch("/api/groups", { cache: "no-store" }),
        ])
        const assigned = await assignedRes.json().catch(() => ({}))
        const groups = await groupsRes.json().catch(() => ({}))
        if (cancelled) return
        const found = (assigned.tasks ?? []).find(
          (t: { id: string; groupId: string }) => t.id === id
        )
        if (found) {
          setForeignGroupId(found.groupId)
          setForeignGroup(
            (groups.groups ?? []).find((g: { id: string }) => g.id === found.groupId) ?? null
          )
        }
      } catch {
        // Falls through to the not-found state below.
      } finally {
        if (!cancelled) setForeignChecked(true)
      }
    }
    locate()
    return () => {
      cancelled = true
    }
  }, [member, isUnassigned, task, loading, foreignGroupId, foreignChecked, id])
  const foreign = useGroupResearch(foreignGroupId)
  const foreignTask =
    foreignGroupId && !foreign.loading
      ? (foreign.tasks.find((t) => t.id === id) ?? null)
      : null
  const foreignPeople = useMemo(() => groupToMembers(foreignGroup), [foreignGroup])

  const resolvingForeign =
    !member &&
    !isUnassigned &&
    !task &&
    !!activeGroupId &&
    (!foreignChecked || (!!foreignGroupId && foreign.loading))

  return (
    <AppShell>
      {loading || resolvingForeign ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !activeGroupId ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 py-14 text-center">
          <p className="text-sm font-medium text-foreground">No active research group</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Join or create a research group to view this page.
          </p>
        </div>
      ) : member || isUnassigned ? (
        <MemberView
          memberId={id}
          people={people}
          tasks={tasks}
          chapters={chapters}
          activeGroup={activeGroup}
          actor={actor}
          createTask={createTask}
          updateTask={updateTask}
          deleteTask={handleDeleteTask}
          logActivity={logActivity}
          isLeader={isGroupLeader(activeGroup, currentUser?.id)}
        />
      ) : task ? (
        <TaskDetailView
          task={task}
          people={people}
          chapters={chapters}
          actor={actor}
          updateTask={updateTask}
          logActivity={logActivity}
          isLeader={isGroupLeader(activeGroup, currentUser?.id)}
        />
      ) : foreignTask ? (
        <TaskDetailView
          task={foreignTask}
          people={foreignPeople}
          chapters={foreign.chapters}
          actor={actor}
          updateTask={foreign.updateTask}
          logActivity={foreign.logActivity}
          isLeader={isGroupLeader(foreignGroup, currentUser?.id)}
        />
      ) : (
        <>
          <Link
            href="/tasks"
            className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to Tasks board
          </Link>
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 py-14 text-center">
            <p className="text-sm font-medium text-foreground">Task not found</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              This task doesn&apos;t exist in any of your research groups.
            </p>
          </div>
        </>
      )}
    </AppShell>
  )
}
