"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Avatar, StatusBadge } from "@/components/primitives"
import { RowActionsMenu } from "@/components/row-actions-menu"
import { tasks as seedTasks, members as seedMembers, type Member, type Task } from "@/lib/research-data"
import { displayMember } from "@/lib/use-group-research"
import { ListChecks, ChevronDown, ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex flex-col rounded-xl bg-secondary/60 px-3 py-2">
      <span className={`text-lg font-semibold tracking-tight ${tone}`}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

const COLLAPSED_COUNT = 5

export function TaskProgress({
  tasks: tasksProp,
  members: membersProp,
  onToggleStatus,
  onEdit,
  onDelete,
}: {
  tasks?: typeof seedTasks
  members?: Member[]
  onToggleStatus?: (id: string) => void
  onEdit?: (task: Task) => void
  onDelete?: (id: string) => void
}) {
  // Group-scoped tasks passed by the page; fall back to seed data only when
  // the page renders without a group context.
  const tasks = tasksProp ?? seedTasks
  const people = membersProp ?? seedMembers
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const visibleTasks = expanded ? tasks : tasks.slice(0, COLLAPSED_COUNT)
  const hasMore = tasks.length > COLLAPSED_COUNT
  const completed = tasks.filter((t) => t.status === "Completed").length
  const inProgress = tasks.filter((t) => t.status === "In progress").length
  const pending = tasks.filter((t) => t.status === "To do").length

  return (
    <section className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm" aria-labelledby="tasks-heading">
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <ListChecks className="size-4" aria-hidden="true" />
        </span>
        <h2 id="tasks-heading" className="text-base font-semibold tracking-tight text-foreground">
          Research tasks
        </h2>
        <span className="ml-auto text-sm text-muted-foreground">{tasks.length} total</span>
        <Link
          href="/tasks"
          className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
        >
          View all <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Completed" value={completed} tone="text-[oklch(0.45_0.12_155)]" />
        <Stat label="In progress" value={inProgress} tone="text-brand" />
        <Stat label="To do" value={pending} tone="text-muted-foreground" />
      </div>

      <ul className="mt-4 flex flex-col divide-y divide-border">
        {visibleTasks.map((task) => {
          const m = displayMember(people, task.assignee)
          const openDetail = () => {
            if (window.getSelection()?.toString()) return
            router.push(`/tasks/${task.id}`)
          }
          return (
            <li
              key={task.id}
              onClick={openDetail}
              title="Open task details"
              className="flex items-center gap-3 py-2.5 cursor-pointer rounded-lg transition-colors hover:bg-secondary/50 px-2 -mx-2"
            >
              <Avatar member={m} className="ring-card" />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/tasks/${task.id}`}
                  onClick={(e) => e.stopPropagation()}
                  title="Open task details"
                  className="block truncate text-sm font-medium text-foreground hover:text-brand hover:underline"
                >
                  {task.title}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {task.chapter} · {m.name === "Unknown member" ? "Former member" : m.name}
                </p>
                {m.name === "Unknown member" && (
                  <p className="text-[0.65rem] font-medium text-amber-600 dark:text-amber-400">
                    Assignee no longer in group
                  </p>
                )}
              </div>
              {onToggleStatus ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleStatus?.(task.id)
                  }}
                  className="cursor-pointer transition-transform active:scale-95 text-left"
                  title="Click to change status"
                >
                  <StatusBadge status={task.status} />
                </button>
              ) : (
                <StatusBadge status={task.status} />
              )}
              {(onEdit || onDelete) && (
                <RowActionsMenu
                  onDelete={onDelete ? () => onDelete(task.id) : undefined}
                  deleteLabel="Delete task"
                  onEdit={onEdit ? () => onEdit(task) : undefined}
                  editLabel="Edit task"
                />
              )}
            </li>
          )
        })}
      </ul>

      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-3 flex items-center gap-1 text-sm font-medium text-brand transition-colors hover:underline"
        >
          {expanded ? "Show fewer tasks" : "View all tasks"}
          <ChevronDown
            className={cn("size-4 transition-transform", expanded && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      )}
    </section>
  )
}
