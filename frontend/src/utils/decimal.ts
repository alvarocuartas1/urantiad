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

export function toCents(value: string): bigint {
  const [integer = '0', fraction = ''] = normalizeDecimal(value).split('.')
  return BigInt(integer) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2))
}

/** Negative when a < b, zero when equal, positive when a > b. */
export function compareDecimals(a: string, b: string): number {
  const difference = toCents(a) - toCents(b)
  return difference === 0n ? 0 : difference < 0n ? -1 : 1
}
