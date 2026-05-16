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
