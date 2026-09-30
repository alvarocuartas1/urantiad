/**
 * Helpers for money and quantities, which the API exchanges as decimal strings with up to two
 * decimals. Values are compared as integer cents (bigint), never as floating point numbers.
 */

/** Digits with up to 2 decimals; "," or "." as decimal separator, no thousands separators. */
const DECIMAL_INPUT = /^\d{1,12}([.,]\d{1,2})?$/

export function isDecimalInput(value: string): boolean {
  return DECIMAL_INPUT.test(value.trim())
}

/** Canonical API form of a valid input: "2500,5" → "2500.5". */
export function normalizeDecimal(value: string): string {
  return value.trim().replace(',', '.')
}

/** Remove insignificant decimals for editing: "2500.00" → "2500", "12.50" → "12.5". */
export function trimDecimal(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value
}

/** Exact value in cents; accepts API values, which may be negative (e.g. "-2.50" stock). */
export function toCents(value: string): bigint {
  const normalized = normalizeDecimal(value)
  const negative = normalized.startsWith('-')
  const [integer = '0', fraction = ''] = normalized.replace(/^[-+]/, '').split('.')
  const cents = BigInt(integer || '0') * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2))
  return negative ? -cents : cents
}

/** Decimal string in the API format: 1050n → "10.50", -5n → "-0.05". */
export function fromCents(cents: bigint): string {
  const sign = cents < 0n ? '-' : ''
  const absolute = cents < 0n ? -cents : cents
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`
}

/** `numerator / denominator` rounded half up (like ROUND_HALF_UP); both non-negative. */
export function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (2n * numerator + denominator) / (2n * denominator)
}

/** Negative when a < b, zero when equal, positive when a > b. */
export function compareDecimals(a: string, b: string): number {
  const difference = toCents(a) - toCents(b)
  return difference === 0n ? 0 : difference < 0n ? -1 : 1
}
