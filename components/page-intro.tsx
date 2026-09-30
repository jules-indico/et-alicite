import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

export function PageIntro({
  icon: Icon,
  eyebrow,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  eyebrow: string
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <section className="relative rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl" aria-hidden="true">
        <div className="absolute -right-16 -top-24 size-72 rounded-full bg-gradient-to-br from-brand/25 to-lavender/25 blur-3xl" />
      </div>
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
            <Icon className="size-3.5" aria-hidden="true" />
            {eyebrow}
          </span>
          <h1 className="mt-3 text-pretty text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
            {title}
          </h1>
          <p className="mt-2 text-pretty text-sm text-muted-foreground">{description}</p>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </section>
  )
}
