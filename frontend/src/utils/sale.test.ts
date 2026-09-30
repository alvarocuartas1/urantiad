import type { PaymentMethod } from '@/types/sale'
import { fromCents } from './decimal'
import {
  allocateCents,
  buildPaymentsSchema,
  cartTotals,
  lineErrors,
  paymentProgress,
  stockWarning,
  type CartLine,
  type CartProduct,
} from './sale'

const WATER: CartProduct = {
  id: 1,
  type: 'product',
  sku: 'AGUA-1',
  name: 'Agua',
  unit_of_measure: 'unit',
  sale_price: '2000.00',
  tax_rate: '0.00',
  current_stock: '10.00',
}
const SODA: CartProduct = {
  ...WATER,
  id: 2,
  sku: 'GASEOSA-1',
  name: 'Gaseosa',
  sale_price: '5950.00',
  tax_rate: '19.00',
}

const line = (product: CartProduct, quantity: string, discount = ''): CartLine => ({
  product,
  quantity,
  discount,
})

const METHODS: PaymentMethod[] = [
  { id: 1, code: 'cash', name: 'Efectivo', is_cash: true },
  { id: 2, code: 'nequi', name: 'Nequi', is_cash: false },
]

describe('allocateCents', () => {
  it.each([
    [0n, [1000n, 2000n], [0n, 0n]],
    [1n, [1n, 1n, 1n], [1n, 0n, 0n]],
    [3n, [1n, 1n, 1n], [1n, 1n, 1n]],
    [10000n, [100n, 200n], [3333n, 6667n]],
    [500n, [0n, 1000n], [0n, 500n]],
  ])('splits %s over %s like the backend', (amount, weights, expected) => {
    const shares = allocateCents(amount, weights)
    expect(shares).toEqual(expected)
    expect(shares.reduce((sum, share) => sum + share, 0n)).toBe(amount)
  })
})

describe('cartTotals', () => {
  it('splits the sale discount among lines and computes the included tax', () => {
    // Same case as test_discounts_are_split_among_lines in the backend.
    const totals = cartTotals([line(WATER, '3', '500'), line(SODA, '1')], '1000')

    expect(totals.valid).toBe(true)
    expect(totals.lines.map((l) => fromCents(l.saleDiscountShare))).toEqual(['480.35', '519.65'])
    expect(totals.lines.map((l) => fromCents(l.total))).toEqual(['5019.65', '5430.35'])
    expect(fromCents(totals.subtotal)).toBe('11950.00')
    expect(fromCents(totals.discountTotal)).toBe('1500.00')
    expect(fromCents(totals.taxTotal)).toBe('867.03')
    expect(fromCents(totals.total)).toBe('10450.00')
  })

  it('is invalid when empty, with a bad line or a discount above the value', () => {
    expect(cartTotals([], '').valid).toBe(false)
    expect(cartTotals([line(WATER, '0')], '').valid).toBe(false)

    const excessive = cartTotals([line(WATER, '1')], '2000,01')
    expect(excessive.valid).toBe(false)
    expect(excessive.saleDiscountError).toMatch(/no puede superar/)
    expect(fromCents(excessive.total)).toBe('2000.00')
  })
})

describe('lineErrors and stockWarning', () => {
  it('requires whole quantities for countable units and caps the discount', () => {
    expect(lineErrors(line(WATER, '1.5')).quantity).toBe('Ingrese una cantidad entera.')
    expect(lineErrors(line(WATER, '2', '4000.01')).discount).toMatch(/no puede superar/)
    expect(lineErrors(line(WATER, '2', '4000'))).toEqual({})
  })

  it('warns when the stock does not cover the quantity, except for services', () => {
    expect(stockWarning(line(WATER, '11'))).toBe('Stock disponible: 10.')
    expect(stockWarning(line(WATER, '10'))).toBeNull()
    expect(stockWarning(line({ ...WATER, type: 'service' }, '50'))).toBeNull()
  })
})

describe('payments', () => {
  it('computes what is paid, missing and the cash change', () => {
    const progress = paymentProgress(
      [
        { payment_method_id: '2', amount: '3000', amount_tendered: '', reference: '' },
        { payment_method_id: '1', amount: '2950', amount_tendered: '5000', reference: '' },
      ],
      '5950.00',
      '1',
    )
    expect(progress).toEqual({ paid: 595000n, remaining: 0n, change: 205000n })
  })

  it('rejects payments that do not add up to the total or short cash', () => {
    const schema = buildPaymentsSchema('5950.00', METHODS)
    const short = schema.safeParse({
      payments: [{ payment_method_id: '1', amount: '5000', amount_tendered: '', reference: '' }],
    })
    expect(short.error?.issues[0]?.message).toMatch(/Los pagos suman/)

    const tendered = schema.safeParse({
      payments: [
        { payment_method_id: '1', amount: '5950', amount_tendered: '5000', reference: '' },
      ],
    })
    expect(tendered.error?.issues[0]?.message).toBe('El dinero recibido no alcanza.')

    const ok = schema.safeParse({
      payments: [
        { payment_method_id: '1', amount: '5950', amount_tendered: '10000', reference: '' },
      ],
    })
    expect(ok.success).toBe(true)
  })
})
