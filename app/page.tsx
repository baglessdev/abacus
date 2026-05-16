import { ThemeToggle } from "@/components/theme-toggle"

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-end p-4">
        <ThemeToggle />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
        <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 text-center">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Abacus is running</h1>
          <p className="text-base text-muted-foreground sm:text-lg">
            Personal finance scaffold — feature 001
          </p>
        </div>
      </main>
    </div>
  )
}
