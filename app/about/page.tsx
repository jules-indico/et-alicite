import { AppShell } from "@/components/app-shell"
import { PageIntro } from "@/components/page-intro"
import { BrandMark } from "@/components/primitives"
import { Info, Target, ShieldCheck, FileText, Lock, Mail } from "lucide-react"

function Card({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Info
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-brand">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
      </div>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}

export default function AboutPage() {
  return (
    <AppShell>
      <PageIntro
        icon={Info}
        eyebrow="About"
        title="About et-alicite"
        description="A collaborative research workspace built to help student teams plan, write, and cite academic work together — with an AI research guide alongside them."
      />

      <Card icon={Target} title="Our purpose">
        <p>
          <BrandMark className="text-foreground" /> et-alicite exists to make academic research approachable for
          student groups. It brings chapters, sources, citations, tasks, and teammates into one calm workspace so a
          research team can see the whole project at a glance and keep momentum from the problem statement all the way
          to the final draft.
        </p>
        <p>
          Instead of scattering work across documents and chat threads, et-alicite keeps every chapter, source, and
          task connected — and pairs it with an AI research guide that helps summarize sources, draft sections, and
          check citations.
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card icon={Lock} title="Privacy policy">
          <p>
            We collect only what is needed to run your workspace: your account details, the research content you
            create, and basic usage information that keeps the product reliable.
          </p>
          <p>
            Your research content belongs to you and your group. We do not sell personal data, and we never use your
            private research to train third-party models without your explicit consent.
          </p>
        </Card>

        <Card icon={FileText} title="Terms &amp; conditions">
          <p>
            By using et-alicite you agree to use the platform for lawful academic work and to respect the intellectual
            property of the sources you cite. You are responsible for the accuracy and originality of the work you
            produce.
          </p>
          <p>
            Accounts may not be used to plagiarize, misrepresent authorship, or upload content you do not have the
            right to share. Misuse may result in suspension of access.
          </p>
        </Card>

        <Card icon={ShieldCheck} title="Academic integrity">
          <p>
            The AI research guide is a support tool, not a substitute for your own scholarship. Suggestions, summaries,
            and drafts should always be reviewed, verified against original sources, and cited appropriately.
          </p>
          <p>Always follow your institution&apos;s guidelines on the acceptable use of AI in research and writing.</p>
        </Card>

        <Card icon={Mail} title="Contact">
          <p>
            Questions about your data, these policies, or the platform? Reach the team at{" "}
            <span className="font-medium text-foreground">support@et-alicite.edu</span>.
          </p>
          <p className="text-xs text-muted-foreground/70">
            et-alicite is a student research workspace. Last updated September 2026.
          </p>
        </Card>
      </div>
    </AppShell>
  )
}
