import { LoginForm } from "@/app/(auth)/login/login-form"

type SearchParams = Promise<{ from?: string; message?: string }>

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { from, message } = await searchParams

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to Abacus</h1>
        <p className="text-sm text-muted-foreground">Enter your email and password.</p>
      </div>
      <LoginForm from={from} message={message} />
    </div>
  )
}
