type ChangelogEntry = {
  date: string
  title: string
  description: string
}

const entries: ChangelogEntry[] = [
  {
    date: "2026-05-16",
    title: "Accounts",
    description:
      "Track checking, savings, credit cards, cash, and investment accounts in any of ~170 currencies. Archive accounts you no longer use without losing the data.",
  },
  {
    date: "2026-05-16",
    title: "Sign up & log in",
    description:
      "Create your own account in seconds and sign in securely from any device. Each user's data is fully isolated.",
  },
  {
    date: "2026-05-16",
    title: "Production deployment & CI",
    description:
      "Abacus is live on Vercel + Neon. Every change runs through automated checks before it ships.",
  },
  {
    date: "2026-05-16",
    title: "Dashboard shell & marketing home",
    description:
      "Sidebar on desktop, drawer on mobile, light and dark mode, and the page you're reading now.",
  },
  {
    date: "2026-05-16",
    title: "Project kickoff",
    description:
      "Built on a modern stack (Next.js, Prisma, shadcn) with money correctness baked in from day one.",
  },
]

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
})

function formatDate(iso: string): string {
  return dateFormatter.format(new Date(`${iso}T00:00:00Z`))
}

export function Changelog() {
  return (
    <section className="mx-auto max-w-3xl px-6 pb-24" aria-labelledby="changelog-heading">
      <div className="mb-8">
        <h2 id="changelog-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          What&apos;s new
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">A living log of what just shipped.</p>
      </div>
      <ol className="space-y-6 border-l border-border pl-6">
        {entries.map((entry) => (
          <li key={`${entry.date}-${entry.title}`} className="relative">
            <span
              className="absolute -left-[1.6875rem] top-2 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary"
              aria-hidden="true"
            />
            <time
              dateTime={entry.date}
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              {formatDate(entry.date)}
            </time>
            <h3 className="mt-1 text-base font-semibold">{entry.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{entry.description}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
