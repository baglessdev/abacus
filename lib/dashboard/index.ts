/**
 * lib/dashboard/index.ts
 *
 * Server-only barrel for the lib/dashboard module.
 * This module is consumed exclusively by server components and server actions.
 */
import "server-only"

export {
  computeNetWorthByCurrency,
  buildCashFlowShape,
  type PerCurrencyTotal,
  type PerCurrencyCashFlow,
} from "./aggregations"

export { computeCurrentMonthRange } from "./dates"
