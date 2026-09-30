import { currentMonthDates, formatDay, formatPercent } from './report'

describe('currentMonthDates', () => {
  it('uses the business day, not the UTC one', () => {
    // 03:00 UTC on October 1 is still September 30 in Bogotá.
    expect(currentMonthDates(new Date('2026-10-01T03:00:00Z'))).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    })
    expect(currentMonthDates(new Date('2026-10-01T05:00:00Z'))).toEqual({
      from: '2026-10-01',
      to: '2026-10-01',
    })
  })
})

describe('formatDay', () => {
  it('formats the local date key without shifting it', () => {
    expect(formatDay('2026-03-09')).toMatch(/9.*mar.*2026/)
  })
})

describe('formatPercent', () => {
  it('formats decimals with a comma and shows a dash when missing', () => {
    expect(formatPercent('40.43')).toBe('40,43 %')
    expect(formatPercent('-5.00')).toBe('-5 %')
    expect(formatPercent(null)).toBe('—')
  })
})
