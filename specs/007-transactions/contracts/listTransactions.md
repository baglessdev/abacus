# Server Action — `listTransactions`

Reads the session's user's transactions, filtered by date range, account, category, type, and archive state. The exclusive read surface for the transactions list page.

## Location

`lib/transactions/actions.ts`. Marked `"use server"`. Invoked from `/dashboard/transactions/page.tsx` (server component reading `searchParams`) AND from the client `<TransactionsList>` after every mutation (to refresh the list with the current filter state).

## Signature

```ts
async function listTransactions(
  filters: ListTransactionsFilters = {}
): Promise<ListTransactionsResult>

type ListTransactionsFilters = {
  dateFrom?: Date | null            // inclusive lower bound; null/undefined → today - 30 days
  dateTo?: Date | null              // inclusive upper bound; null/undefined → today
  accountId?: string | null         // null/undefined → all accounts
  categoryId?: string | "__uncategorized__" | null   // null/undefined → all; sentinel → categoryId IS NULL
  type?: "INCOME" | "EXPENSE" | "TRANSFER" | null    // null/undefined → all types
  includeArchived?: boolean         // default false
}

type ListTransactionsResult =
  | { data: { transactions: TransactionDTO[]; hasOlderMatches: boolean } }
  | { error: ErrorEnvelope }
```

Note: this action takes a **typed in-process options object**, NOT a `FormData`. The constitution Principle III "trust internally" rule applies — the caller (the page-level server component) parses URL `searchParams` via a small Zod schema (`listTransactionsFiltersSchema`) BEFORE calling this action. The action itself does not Zod-parse its input because the input is a typed object, not request-shaped.

## Input — typed options

| Key | Type | Default | Behavior |
|---|---|---|---|
| `dateFrom` | `Date \| null \| undefined` | `today - 30 days` (UTC midnight) | Inclusive lower bound on the `date` column. |
| `dateTo` | `Date \| null \| undefined` | `today` (UTC midnight) | Inclusive upper bound. |
| `accountId` | `string \| null \| undefined` | `null` (all accounts) | When non-null: `WHERE accountId = ?`. Cross-user references collapse to empty results (the `userId` filter ensures non-owned rows return nothing). |
| `categoryId` | `string \| "__uncategorized__" \| null \| undefined` | `null` (all) | The sentinel `"__uncategorized__"` filters `categoryId IS NULL`; a non-sentinel string filters `categoryId = ?`. |
| `type` | `"INCOME" \| "EXPENSE" \| "TRANSFER" \| null \| undefined` | `null` (all) | When non-null: `WHERE type = ?`. |
| `includeArchived` | `boolean` | `false` | When `false`: `WHERE archivedAt IS NULL`. When `true`: archived rows included. |

## Behavior

1. `const session = await auth()`. On missing → `{ error: { code: "unauthenticated", … } }`.
2. Resolve defaults:
   ```ts
   const dateFrom = filters.dateFrom ?? subDays(startOfUtcDay(new Date()), 30)
   const dateTo   = filters.dateTo   ?? startOfUtcDay(new Date())
   ```
3. Build the Prisma `where` clause:
   ```ts
   const where: Prisma.TransactionWhereInput = {
     userId: session.user.id,
     date: { gte: dateFrom, lte: dateTo },
     ...(filters.accountId ? { accountId: filters.accountId } : {}),
     ...(filters.categoryId === "__uncategorized__"
       ? { categoryId: null }
       : filters.categoryId
       ? { categoryId: filters.categoryId }
       : {}),
     ...(filters.type ? { type: filters.type } : {}),
     ...(filters.includeArchived ? {} : { archivedAt: null }),
   }
   ```
4. Run two parallel queries:
   ```ts
   const [rows, olderCount] = await Promise.all([
     prisma.transaction.findMany({
       where,
       orderBy: [{ date: "desc" }, { createdAt: "desc" }],
     }),
     prisma.transaction.count({
       where: {
         userId: session.user.id,
         date: { lt: dateFrom },
         // Same filters as above EXCEPT the date range — to know if "Load older" should appear
         ...(filters.accountId ? { accountId: filters.accountId } : {}),
         ...(filters.categoryId === "__uncategorized__"
           ? { categoryId: null }
           : filters.categoryId
           ? { categoryId: filters.categoryId }
           : {}),
         ...(filters.type ? { type: filters.type } : {}),
         ...(filters.includeArchived ? {} : { archivedAt: null }),
       },
     }),
   ])
   ```
5. Serialize each row via `serializeTransaction` and return `{ data: { transactions, hasOlderMatches: olderCount > 0 } }`.
6. On Prisma error → `{ error: { code: "internal_error", … } }`.

## Success — `data` shape

```ts
{
  data: {
    transactions: TransactionDTO[]   // sorted by (date DESC, createdAt DESC)
    hasOlderMatches: boolean         // true if there are rows older than dateFrom matching the other filters
  }
}
```

The `hasOlderMatches` flag drives the "Load older" affordance: when true, the UI renders a button that extends `dateFrom` backward by 30 days (updates the URL `from=` param).

## Errors

| Code | When | Extra fields |
|---|---|---|
| `unauthenticated` | No session | — |
| `internal_error` | Prisma threw on read | — |

No `validation_failed` from this action — the inputs are typed and the boundary validation happens at the page layer (URL `searchParams` → `listTransactionsFiltersSchema` → typed object → this action). Per constitution Principle III, this action trusts its typed inputs.

## Side effects

None. Read-only.

## Atomicity

Read-only; no atomicity concerns. The two parallel queries can theoretically observe slightly different DB states under heavy concurrent writes, but at personal-finance scale this is not a real risk; the `hasOlderMatches` flag is advisory (drives a UI affordance), not load-bearing for correctness.

## Performance notes

- The primary `findMany` uses `@@index([userId, date])` (or `[userId, accountId, date]` when `accountId` is set) for both the `userId` equality and the `date` range + `ORDER BY date DESC`. Postgres satisfies both filter and sort from one index scan.
- The category filter is supported by `@@index([userId, categoryId])` when set.
- The archive filter is a partial-row predicate; Postgres handles it efficiently against the date index.
- A user with thousands of transactions in a 30-day range will still render in milliseconds locally. Cursor pagination is deferred per `research.md` R10.

## URL filter encoding

The page layer encodes filters as URL `searchParams`:

```
/dashboard/transactions?from=2026-05-01&to=2026-05-31&account=<id>&category=<id>&type=EXPENSE&archived=1
```

The page parses via `listTransactionsFiltersSchema` (a Zod object that validates each param and returns a typed `ListTransactionsFilters`), then calls `listTransactions(filters)`. The action is the same whether called from page-load (with URL-derived filters) or from client-side re-fetch after a mutation (with in-memory filter state).

## Applicable FRs

FR-001, FR-002, FR-003, FR-013, FR-019, FR-019a, FR-020, FR-022, FR-026, FR-026a, FR-027, FR-028, FR-031.

## Applicable SCs

SC-007, SC-010, SC-011, SC-013, SC-014, SC-015.
