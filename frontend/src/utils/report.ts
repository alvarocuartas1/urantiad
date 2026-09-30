import { PERMISSIONS } from '@/types/auth'
import type { CashGroupBy, PurchasesGroupBy, SalesGroupBy } from '@/types/report'

export type ReportTab = 'ventas' | 'compras' | 'inventario' | 'caja'

/** Each report requires the permission that already opens the listings of its area. */
export const REPORT_TAB_PERMISSIONS = {
  ventas: PERMISSIONS.salesReadAll,
  compras: PERMISSIONS.purchasesRead,
  inventario: PERMISSIONS.inventoryRead,
  caja: PERMISSIONS.cashSupervise,
} as const satisfies Record<ReportTab, string>

/** Any of them opens the reports section. */
export const REPORT_PERMISSIONS = Object.values(REPORT_TAB_PERMISSIONS)

export const SALES_GROUP_LABELS: Record<SalesGroupBy, string> = {
  day: 'Día',
  user: 'Cajero',
  cash_register: 'Caja',
  product: 'Producto',
  category: 'Categoría',
  payment_method: 'Método de pago',
}

export const PURCHASES_GROUP_LABELS: Record<PurchasesGroupBy, string> = {
  supplier: 'Proveedor',
  product: 'Producto',
  category: 'Categoría',
  day: 'Día',
}

export const CASH_GROUP_LABELS: Record<CashGroupBy, string> = {
  day: 'Día',
  cash_register: 'Caja',
  user: 'Cajero',
}

const BUSINESS_TIME_ZONE = 'America/Bogota'
// en-CA formats dates as "YYYY-MM-DD", the value of `<input type="date">`.
const isoDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE })

/** First day of the current month and today, in the business time zone ("YYYY-MM-DD"). */
export function currentMonthDates(now: Date = new Date()): { from: string; to: string } {
  const today = isoDateFormatter.format(now)
  return { from: `${today.slice(0, 8)}01`, to: today }
}

const dayFormatter = new Intl.DateTimeFormat('es-CO', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/** Format a local date key from the API ("2026-09-30" → "mar, 30 sept 2026"). */
export function formatDay(key: string): string {
  // The key is already a local calendar date: format it as is, without shifting zones.
  return dayFormatter.format(new Date(`${key}T00:00:00Z`))
}

const percentFormatter = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 })

/** "40.43" → "40,43 %"; null → "—". */
export function formatPercent(value: string | null): string {
  return value === null ? '—' : `${percentFormatter.format(value as Intl.StringNumericLiteral)} %`
}
