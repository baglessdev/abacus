export default function ShellLoading() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex flex-col items-center justify-center gap-3 px-6 py-12"
    >
      <div className="h-12 w-12 animate-pulse rounded-full bg-muted" />
      <div className="h-6 w-48 animate-pulse rounded bg-muted" />
      <div className="h-4 w-64 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-10 w-32 animate-pulse rounded bg-muted" />
    </div>
  )
}
