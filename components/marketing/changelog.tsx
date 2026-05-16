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
    <section
      id="changelog"
      className="mx-auto max-w-3xl px-6 pb-24"
      aria-labelledby="changelog-heading"
    >
      <div className="mb-8">
        <h2 id="changelog-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          What&apos;s new
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">A living log of what just shipped.</p>
      </div>
      <ol className="space-y-6 border-l border-border pl-6">
        {entries.map((entry) => (
          <li key={`${entry.date}-${entry.title}`} className="relative">
            {/*
              Bead-shaped dot: a short horizontal rod-stub + filled circle (bead).
              Geometry (research.md R17): line = horizontal rod; circle = the bead.
              Positioned to align with the border-l rail at the same offset as the
              previous plain circle (-left-[1.6875rem] top-2).
              currentColor is set via text-primary on the parent <li> context — the
              span inherits it so both the rod and the bead fill use the violet primary.
            */}
            <span className="absolute -left-[1.6875rem] top-2 text-primary" aria-hidden="true">
              <svg
                width="10"
                height="14"
                viewBox="0 0 10 14"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Rod stub — short horizontal line */}
                <line
                  x1="0"
                  y1="9"
                  x2="10"
                  y2="9"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                {/* Bead — filled circle centered above the rod */}
                <circle cx="5" cy="5" r="3" fill="currentColor" />
              </svg>
            </span>
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
