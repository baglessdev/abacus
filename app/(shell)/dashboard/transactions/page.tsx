import { EmptyState } from "@/components/shell/empty-state"
import { TransactionsIllustration } from "@/components/illustrations/transactions-illustration"
import { Money } from "@/components/money/money"

export default function TransactionsPage() {
  return (
    <EmptyState
      illustration={<TransactionsIllustration className="h-32 w-32 text-primary" />}
      title="Transactions are coming soon"
      description="Track every dollar in and out of your accounts, categorise them, and see where your money goes."
      preview={
        <div className="mt-12 w-full max-w-md opacity-40">
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr>
                <th className="py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Date
                </th>
                <th className="py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Description
                </th>
                <th className="py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 text-left">May 16</td>
                <td className="py-2 text-left">Coffee Shop</td>
                <td className="py-2">
                  <Money amount="-4.50" currency="USD" align="right" />
                </td>
              </tr>
              <tr>
                <td className="py-2 text-left">May 15</td>
                <td className="py-2 text-left">Salary</td>
                <td className="py-2">
                  <Money amount="3200.00" currency="USD" align="right" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      }
    />
  )
}
