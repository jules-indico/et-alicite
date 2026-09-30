import Link from "next/link"
import { Avatar } from "@/components/primitives"
import { activities as seedActivities, type Activity, type Member } from "@/lib/research-data"
import { displayActivityActor, timeAgo, useNow, RECENT_ACTIVITY_LIMIT } from "@/lib/use-group-research"
import { Activity as ActivityIcon, ArrowUpRight } from "lucide-react"

export function RecentActivity({
  activities: activitiesProp,
  members: membersProp,
}: {
  activities?: Activity[]
  members?: Member[]
}) {
  // Group-scoped activity passed by the page; fall back to seed data only when
  // the page renders without a group context.
  const activities = activitiesProp ?? seedActivities
  // Tick so relative timestamps stay correct while open.
  useNow()
  return (
    <section className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm" aria-labelledby="activity-heading">
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-lavender/20 text-[oklch(0.48_0.1_290)]">
          <ActivityIcon className="size-4" aria-hidden="true" />
        </span>
        <h2 id="activity-heading" className="text-base font-semibold tracking-tight text-foreground">
          Recent activity
        </h2>
        <Link
          href="/activity"
          className="ml-auto flex items-center gap-1 text-xs font-medium text-brand hover:underline"
        >
          View all <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>

      <ul className="mt-4 flex flex-col gap-4">
        {activities.slice(0, RECENT_ACTIVITY_LIMIT).map((activity) => {
          // Snapshot stored at log time first, then the live roster, then
          // neutral — never a hardcoded unrelated person.
          const m = membersProp
            ? displayActivityActor(membersProp, activity)
            : displayActivityActor([], activity)
          return (
            <li key={activity.id} className="flex items-center gap-4">
              <Avatar member={m} className="size-7 shrink-0 text-[0.6rem]" />
              <span className="flex-1 min-w-0 text-sm text-muted-foreground leading-snug">
                <span className="font-medium text-foreground">{m.name.split(" ")[0]}</span> {activity.action}{" "}
                <span className="font-medium text-foreground">{activity.target}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {timeAgo(activity.createdAt) ?? activity.time}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
