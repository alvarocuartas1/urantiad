import type { TrendPoint } from '@/types/statistics'
import {
  addDays,
  bestPeriod,
  defaultPeriod,
  formatCompactCurrency,
  formatDays,
  formatPeriod,
  formatRotation,
} from './statistics'

// Wednesday, September 30 2026 at 10:00 in Bogotá.
const NOW = new Date('2026-09-30T15:00:00Z')

function point(period_start: string, total: string): TrendPoint {
  return { period_start, sales_count: 1, total, net_total: total, gross_margin: null }
}

describe('defaultPeriod', () => {
  it('covers the last 30 days by day', () => {
    expect(defaultPeriod('day', NOW)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
  })

  it('starts 12 whole weeks back on a Monday by week', () => {
    expect(defaultPeriod('week', NOW)).toEqual({ from: '2026-07-13', to: '2026-09-30' })
  })

  it('starts on the 1st, 11 months back, by month', () => {
    expect(defaultPeriod('month', NOW)).toEqual({ from: '2025-10-01', to: '2026-09-30' })
  })

  it('uses the business day, not the UTC one', () => {
    // 03:00 UTC on October 1 is still September 30 in Bogotá.
    const lateNight = new Date('2026-10-01T03:00:00Z')
    expect(defaultPeriod('day', lateNight).to).toBe('2026-09-30')
  })
})

describe('addDays', () => {
  it('crosses months and years', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('formatPeriod', () => {
  it('labels each granularity', () => {
    expect(formatPeriod('2026-09-07', 'day', 'short')).toBe('7 de sept')
    expect(formatPeriod('2026-09-07', 'week', 'short')).toBe('7 de sept')
    expect(formatPeriod('2026-09-07', 'week')).toBe('Semana del 7 de sept de 2026')
    expect(formatPeriod('2026-09-01', 'month')).toBe('septiembre de 2026')
    expect(formatPeriod('2026-09-01', 'month', 'short')).toBe('sept de 2026')
  })
})

describe('bestPeriod', () => {
  it('returns the first period with the highest total', () => {
    const points = [
      point('2026-09-01', '0.00'),
      point('2026-09-02', '10000.50'),
      point('2026-09-03', '9999.99'),
      point('2026-09-04', '10000.50'),
    ]
    expect(bestPeriod(points)?.period_start).toBe('2026-09-02')
  })

  it('is null when nothing was sold', () => {
    expect(bestPeriod([point('2026-09-01', '0.00')])).toBeNull()
  })
})

describe('formatting', () => {
  it('abbreviates axis amounts', () => {
    expect(formatCompactCurrency(0)).toBe('$ 0')
    expect(formatCompactCurrency(7_500)).toBe('$ 7,5 mil')
    expect(formatCompactCurrency(125_000)).toBe('$ 125 mil')
    expect(formatCompactCurrency(1_250_000)).toBe('$ 1,3 M')
  })

  it('formats rotation and days, with a dash when they do not apply', () => {
    expect(formatRotation('0.50')).toBe('0,5 veces')
    expect(formatRotation('1.00')).toBe('1 vez')
    expect(formatRotation(null)).toBe('—')
    expect(formatDays('15.00')).toBe('15 días')
    expect(formatDays('1257.22')).toBe('1.257 días')
    expect(formatDays('1.20')).toBe('1 día')
    expect(formatDays('0.40')).toBe('menos de 1 día')
    expect(formatDays(null)).toBe('—')
  })
})
