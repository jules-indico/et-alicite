"use client"

import { useMemo } from "react"
import Link from "next/link"
import { AppShell } from "@/components/app-shell"
import { PageIntro } from "@/components/page-intro"
import { Avatar } from "@/components/primitives"
import type { Member } from "@/lib/research-data"
import {
  useActiveGroupId,
  useGroupResearch,
  groupToMembers,
  displayActivityActor,
  timeAgo,
  useNow,
} from "@/lib/use-group-research"
import { Activity as ActivityIcon, ArrowLeft } from "lucide-react"

export default function ActivityPage() {
  const { activeGroupId, activeGroup } = useActiveGroupId()
  // Tick so relative activity timestamps stay correct while open.
  useNow()
  // Group-scoped activity: every member of the active group sees the same
  // timeline. Full history (up to the storage cap) — relocated here from
  // the removed Research Workspace page; the home strip shows only the
  // latest entries and links here.
  const { activities, loading } = useGroupResearch(activeGroupId, {
    activityLimit: 100,
  })
  const people: Member[] = useMemo(() => groupToMembers(activeGroup), [activeGroup])

  return (
    <AppShell>
      <Link
        href="/research"
        className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to Research
      </Link>

      <PageIntro
        icon={ActivityIcon}
        eyebrow="Activity"
        title="Recent activity"
        description="A full timeline of research activity from your group, newest first."
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading group activity…</p>
      ) : (
        <section
          className="rounded-2xl border border-border bg-card p-6 shadow-sm"
          aria-labelledby="all-activity-heading"
        >
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-lavender/20 text-[oklch(0.48_0.1_290)]">
              <ActivityIcon className="size-4" aria-hidden="true" />
            </span>
            <h2 id="all-activity-heading" className="text-base font-semibold tracking-tight text-foreground">
              All research activity
            </h2>
            <span className="ml-auto text-sm text-muted-foreground">{activities.length} updates</span>
          </div>
          <ul className="mt-4 flex flex-col gap-4">
            {activities.map((activity) => {
              const m = displayActivityActor(people, activity)
              return (
                <li key={activity.id} className="flex items-start gap-3">
                  <Avatar member={m} />
                  <div className="min-w-0 flex-1 text-sm leading-snug text-muted-foreground">
                    <span className="font-medium text-foreground">{m.name}</span> {activity.action}{" "}
                    <span className="font-medium text-foreground">{activity.target}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground/70">{timeAgo(activity.createdAt) ?? activity.time}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </AppShell>
  )
}
