import { ArrowLeftRight, PieChart, Wallet, type LucideIcon } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type Feature = {
  icon: LucideIcon
  title: string
  description: string
}

const features: Feature[] = [
  {
    icon: Wallet,
    title: "Track accounts",
    description: "Bring every account — checking, savings, credit cards — into one place.",
  },
  {
    icon: PieChart,
    title: "Set budgets",
    description: "Cap your spending by category and stay on top of the limits you set.",
  },
  {
    icon: ArrowLeftRight,
    title: "See where your money goes",
    description: "Transactions and categories at a glance, with the math always correct.",
  },
]

export function FeatureGrid() {
  return (
    <section className="mx-auto max-w-5xl px-6 pb-24">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {features.map((f) => (
          <Card key={f.title} className="p-2">
            <CardHeader>
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <CardTitle className="mt-3">{f.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{f.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
