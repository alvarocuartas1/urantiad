import { PERMISSIONS } from '@/types/auth'
import type { Granularity, TrendPoint } from '@/types/statistics'
import { toCents } from './decimal'
import { formatQuantity } from './format'
import { businessToday, formatDay } from './report'

/** Sales statistics need `sales.read_all`; rotation, `inventory.read`. Either opens the page. */
export const STATISTICS_PERMISSIONS = [PERMISSIONS.salesReadAll, PERMISSIONS.inventoryRead]

export const GRANULARITY_LABELS: Record<Granularity, string> = {
  day: 'Día',
  week: 'Semana',
  month: 'Mes',
}

/** Days are "YYYY-MM-DD" calendar dates: compute on them in UTC so no zone shifts them. */
function toDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`)
}

function toDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addDays(day: string, days: number): string {
  const date = toDate(day)
  date.setUTCDate(date.getUTCDate() + days)
  return toDay(date)
}

/** Default period of each granularity, up to today: 30 days, 12 weeks from Monday or 12
 * months from the 1st. */
export function defaultPeriod(
  granularity: Granularity,
  now: Date = new Date(),
): { from: string; to: string } {
  const today = businessToday(now)
  switch (granularity) {
    case 'day':
      return { from: addDays(today, -29), to: today }
    case 'week': {
      const daysSinceMonday = (toDate(today).getUTCDay() + 6) % 7
      return { from: addDays(today, -daysSinceMonday - 7 * 11), to: today }
    }
    case 'month': {
      const date = toDate(`${today.slice(0, 8)}01`)
      date.setUTCMonth(date.getUTCMonth() - 11)
      return { from: toDay(date), to: today }
    }
  }
}

const shortDayFormatter = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
const longDayFormatter = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})
const shortMonthFormatter = new Intl.DateTimeFormat('es-CO', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})
const longMonthFormatter = new Intl.DateTimeFormat('es-CO', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

/** Label of the period that starts on `start`: short for the chart axis, long elsewhere. */
export function formatPeriod(
  start: string,
  granularity: Granularity,
  style: 'short' | 'long' = 'long',
): string {
  const date = toDate(start)
  switch (granularity) {
    case 'day':
      return style === 'short' ? shortDayFormatter.format(date) : formatDay(start)
    case 'week':
      return style === 'short'
        ? shortDayFormatter.format(date)
        : `Semana del ${longDayFormatter.format(date)}`
    case 'month':
      return (style === 'short' ? shortMonthFormatter : longMonthFormatter).format(date)
  }
}

/** "Del 7 sept 2026 al 4 oct 2026": the whole periods a trend covers. */
export function formatRange(from: string, to: string): string {
  return `Del ${longDayFormatter.format(toDate(from))} al ${longDayFormatter.format(toDate(to))}`
}

/** The period with the highest total; null when nothing was sold. */
export function bestPeriod(points: TrendPoint[]): TrendPoint | null {
  let best: TrendPoint | null = null
  for (const point of points) {
    if (toCents(point.total) > (best ? toCents(best.total) : 0n)) best = point
  }
  return best
}

const compactNumberFormatter = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 })

/** Short amount for chart axes ("$ 2,5 mil", "$ 1,3 M"). Only for display: never for
 * arithmetic. Intl's compact notation in es-CO mixes "K" and "k" and its spacing. */
export function formatCompactCurrency(value: number): string {
  const [amount, suffix] =
    Math.abs(value) >= 1_000_000
      ? [value / 1_000_000, ' M']
      : Math.abs(value) >= 1_000
        ? [value / 1_000, ' mil']
        : [value, '']
  return `$ ${compactNumberFormatter.format(amount)}${suffix}`
}

/** "0.50" → "0,5 veces"; null (no stock) → "—". */
export function formatRotation(value: string | null): string {
  return value === null ? '—' : `${formatQuantity(value)} ${value === '1.00' ? 'vez' : 'veces'}`
}

const daysFormatter = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })

/** Whole days: "15.40" → "15 días", "0.40" → "menos de 1 día"; null (no sales) → "—". */
export function formatDays(value: string | null): string {
  if (value === null) return '—'
  if (Number(value) > 0 && Number(value) < 1) return 'menos de 1 día'
  const days = daysFormatter.format(value as Intl.StringNumericLiteral)
  return `${days} ${days === '1' ? 'día' : 'días'}`
}
