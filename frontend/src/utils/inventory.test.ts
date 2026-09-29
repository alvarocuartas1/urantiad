import {
  EMPTY_ADJUSTMENT,
  buildAdjustmentSchema,
  businessDayRange,
  resultingStock,
  toAdjustmentCreate,
} from './inventory'

describe('inventory helpers', () => {
  it('computes the stock after an adjustment exactly', () => {
    expect(resultingStock('10.00', 'in', '2,5')).toBe('12.50')
    expect(resultingStock('10.00', 'out', '12')).toBe('-2.00')
    expect(resultingStock('10.00', 'in', '2.500')).toBeNull()
  })

  it('builds whole business days in Bogota time, with an exclusive end', () => {
    expect(businessDayRange('2026-09-01', '2026-09-30')).toEqual({
      date_from: '2026-09-01T00:00:00-05:00',
      date_to: '2026-10-01T00:00:00-05:00',
    })
    expect(businessDayRange('', '2026-12-31')).toEqual({ date_to: '2027-01-01T00:00:00-05:00' })
    expect(businessDayRange('', '')).toEqual({})
  })

  it('requires whole quantities only for countable units', () => {
    const values = { ...EMPTY_ADJUSTMENT, quantity: '1,5', reason: 'Conteo' }

    expect(buildAdjustmentSchema('unit').safeParse(values).success).toBe(false)
    expect(buildAdjustmentSchema('kg').safeParse(values).success).toBe(true)
    expect(buildAdjustmentSchema('kg').safeParse({ ...values, quantity: '0' }).success).toBe(false)
  })

  it('sends the unit cost only for entries', () => {
    const values = { quantity: '5', unit_cost: '1800', reason: 'Conteo' }

    expect(toAdjustmentCreate(3, { ...values, direction: 'in' })).toEqual({
      product_id: 3,
      direction: 'in',
      quantity: '5',
      unit_cost: '1800',
      reason: 'Conteo',
    })
    expect(toAdjustmentCreate(3, { ...values, direction: 'out' })).not.toHaveProperty('unit_cost')
  })
})
