import { SignupForm } from "@/app/(auth)/signup/signup-form"

type SearchParams = Promise<{ from?: string }>

export default async function SignupPage({ searchParams }: { searchParams: SearchParams }) {
  const { from } = await searchParams

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Create your Abacus account</h1>
        <p className="text-sm text-muted-foreground">
          Sign up to start tracking your accounts, transactions, and budgets.
        </p>
      </div>
      <SignupForm from={from} />
    </div>
  )
}
