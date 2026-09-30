import { divideHalfUp, toCents } from './decimal'

/** Whole percentage of `total` that `part` represents (0 when the total is zero). */
export function sharePercent(part: string, total: string): number {
  const totalCents = toCents(total)
  if (totalCents <= 0n) return 0
  return Number(divideHalfUp(toCents(part) * 100n, totalCents))
}
