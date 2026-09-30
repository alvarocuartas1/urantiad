import { sharePercent } from './dashboard'

describe('sharePercent', () => {
  it('rounds the share half up to a whole percentage', () => {
    expect(sharePercent('9000.00', '10000.00')).toBe(90)
    expect(sharePercent('1.00', '8.00')).toBe(13)
    expect(sharePercent('10000.00', '10000.00')).toBe(100)
  })

  it('is zero when there is no total', () => {
    expect(sharePercent('0.00', '0.00')).toBe(0)
  })
})
