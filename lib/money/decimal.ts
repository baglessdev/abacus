// This file is the canonical home for monetary arithmetic; no arithmetic on monetary amounts outside lib/money/ (constitution Principle I, FR-016)

import { Prisma } from "@prisma/client"

/** Re-export of Prisma.Decimal as the project-native Money type (research.md R1). */
export const Money = Prisma.Decimal
export type Money = Prisma.Decimal

/** Add two monetary values. */
export function plus(a: Money, b: Money): Money {
  return a.plus(b)
}

/** Subtract b from a. */
export function minus(a: Money, b: Money): Money {
  return a.minus(b)
}

/**
 * Compare two monetary values.
 * Returns -1 if a < b, 0 if a === b, 1 if a > b.
 */
export function cmp(a: Money, b: Money): -1 | 0 | 1 {
  return a.comparedTo(b) as -1 | 0 | 1
}

/** Returns true if the amount is zero. */
export function isZero(a: Money): boolean {
  return a.isZero()
}

/** Returns true if the amount is negative (less than zero). */
export function isNegative(a: Money): boolean {
  return a.isNegative()
}

/**
 * Sum an array of monetary values without precision loss.
 * Empty array returns new Money(0).
 * Pure function — no Prisma dependency (FR-028, constitution Principle I).
 *
 * Usage: sumAmounts([new Money("100"), new Money("-50"), new Money("25")]) → new Money("75")
 */
export function sumAmounts(amounts: readonly Money[]): Money {
  return amounts.reduce((acc, a) => acc.plus(a), new Money(0))
}
