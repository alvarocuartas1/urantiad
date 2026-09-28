const BUSINESS_TIME_ZONE = 'America/Bogota'

const dateTimeFormatter = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: BUSINESS_TIME_ZONE,
})

/** Format a UTC ISO timestamp from the API in the business time zone. */
export function formatDateTime(value: string | null): string {
  return value ? dateTimeFormatter.format(new Date(value)) : '—'
}

const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const quantityFormatter = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 })

// Intl formats decimal strings exactly, so amounts are never converted to floating point.
type DecimalString = Intl.StringNumericLiteral

/** Format a decimal string from the API as Colombian pesos ("2500.00" → "$ 2.500"). */
export function formatCurrency(value: string | null): string {
  return value === null ? '—' : currencyFormatter.format(value as DecimalString)
}

/** Format a decimal quantity ("12.50" → "12,5"). */
export function formatQuantity(value: string): string {
  return quantityFormatter.format(value as DecimalString)
}
