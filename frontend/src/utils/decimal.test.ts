import {
  compareDecimals,
  fromCents,
  isDecimalInput,
  normalizeDecimal,
  toCents,
  trimDecimal,
} from './decimal'

describe('decimal helpers', () => {
  it.each(['0', '2500', '2500.5', '2500,50', ' 19 '])('accepts %j', (value) => {
    expect(isDecimalInput(value)).toBe(true)
  })

  // "2.500" is how a thousand separator looks in Colombia: rejected instead of read as 2.5.
  it.each(['', '-1', '2.500', '1.234,5', 'abc', '1e3'])('rejects %j', (value) => {
    expect(isDecimalInput(value)).toBe(false)
  })

  it('normalizes the decimal separator', () => {
    expect(normalizeDecimal(' 2500,5 ')).toBe('2500.5')
  })

  it('removes insignificant decimals for editing', () => {
    expect(trimDecimal('2500.00')).toBe('2500')
    expect(trimDecimal('12.50')).toBe('12.5')
    expect(trimDecimal('100')).toBe('100')
  })

  it('compares values exactly', () => {
    expect(toCents('10.5')).toBe(1050n)
    expect(compareDecimals('0.1', '0.10')).toBe(0)
    expect(compareDecimals('9.99', '10')).toBe(-1)
    expect(compareDecimals('20', '19,99')).toBe(1)
  })

  it('handles negative API values and converts back from cents', () => {
    expect(toCents('-2.50')).toBe(-250n)
    expect(toCents('-0.05')).toBe(-5n)
    expect(fromCents(1050n)).toBe('10.50')
    expect(fromCents(-5n)).toBe('-0.05')
    expect(fromCents(toCents('10') - toCents('12.5'))).toBe('-2.50')
  })
})
