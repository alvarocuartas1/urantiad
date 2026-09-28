import { formatCurrency, formatQuantity } from './format'

describe('formatCurrency', () => {
  it('formats decimal strings as Colombian pesos', () => {
    // Intl uses a non-breaking space between the symbol and the amount.
    expect(formatCurrency('2500.00').replace(/\s/g, ' ')).toBe('$ 2.500')
    expect(formatCurrency('1234567.5').replace(/\s/g, ' ')).toBe('$ 1.234.567,5')
  })

  it('keeps full precision for large amounts', () => {
    expect(formatCurrency('999999999999.99').replace(/\s/g, ' ')).toBe('$ 999.999.999.999,99')
  })

  it('shows a dash for hidden values', () => {
    expect(formatCurrency(null)).toBe('—')
  })
})

describe('formatQuantity', () => {
  it('drops trailing zeros', () => {
    expect(formatQuantity('12.00')).toBe('12')
    expect(formatQuantity('0.50')).toBe('0,5')
  })
})
