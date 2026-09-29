import type { SupplierProduct } from '@/types/supplier'
import {
  formTotals,
  lineAmounts,
  netUnitCost,
  purchaseFormSchema,
  suggestUnitCost,
  type PurchaseFormInput,
  type PurchaseLineInput,
} from './purchase'

const drink = { id: 1, sku: 'BEB-1', name: 'Gaseosa', unit_of_measure: 'unit' as const }
const rice = { id: 2, sku: 'GRA-1', name: 'Arroz', unit_of_measure: 'kg' as const }

function line(fields: Partial<PurchaseLineInput> = {}): PurchaseLineInput {
  return {
    product: drink,
    quantity: '10',
    unit_cost: '1500',
    discount: '',
    tax_rate: '19',
    ...fields,
  }
}

function form(fields: Partial<PurchaseFormInput> = {}): PurchaseFormInput {
  return {
    supplier_id: '3',
    supplier_invoice_number: '',
    amount_paid: '',
    notes: '',
    items: [line()],
    ...fields,
  }
}

describe('purchase amounts (same rounding as the backend)', () => {
  it('computes a line with discount and tax', () => {
    expect(lineAmounts('10', '1500', '1000', '19')).toEqual({
      gross: 1500000n,
      subtotal: 1400000n,
      tax: 266000n,
      total: 1666000n,
    })
  })

  it('rounds half up to cents', () => {
    // 1.5 × 333.33 = 499.995 → 500.00; 19 % of 0.05 = 0.0095 → 0.01.
    expect(lineAmounts('1.5', '333.33', '0', '0').gross).toBe(50000n)
    expect(lineAmounts('1', '0.05', '0', '19').tax).toBe(1n)
  })

  it('computes the net unit cost that enters inventory', () => {
    expect(netUnitCost('1.5', 49950n)).toBe('333.00')
    expect(netUnitCost('3', 100n)).toBe('0.33')
  })

  it('adds up the form, skipping lines still being typed', () => {
    const totals = formTotals(
      [line({ discount: '1000' }), line({ product: rice, quantity: '', unit_cost: '10' })],
      '5000',
    )

    expect(totals).toEqual({
      subtotal: '15000.00',
      discount_total: '1000.00',
      tax_total: '2660.00',
      total: '16660.00',
      amount_paid: '5000.00',
      balance_due: '11660.00',
    })
  })
})

describe('purchaseFormSchema', () => {
  const messages = (input: PurchaseFormInput) =>
    purchaseFormSchema.safeParse(input).error?.issues.map((issue) => issue.message) ?? []

  it('converts a valid form for the API', () => {
    const result = purchaseFormSchema.parse(form({ items: [line({ unit_cost: '1500,5' })] }))

    expect(result.items[0]).toMatchObject({ unit_cost: '1500.5', discount: '0' })
    expect(result.amount_paid).toBe('0')
  })

  it('requires whole quantities for countable units only', () => {
    expect(messages(form({ items: [line({ quantity: '1.5' })] }))).toContain(
      'Ingrese una cantidad entera para esta unidad de medida.',
    )
    expect(messages(form({ items: [line({ product: rice, quantity: '1.5' })] }))).toEqual([])
  })

  it('rejects a discount above the line value and a payment above the total', () => {
    expect(messages(form({ items: [line({ discount: '15000.01' })] }))).toContain(
      'El descuento no puede superar cantidad × costo.',
    )
    // Total: 15000 + 19 % = 17850.
    expect(messages(form({ amount_paid: '17850.01' }))).toContain(
      'El valor pagado no puede superar el total.',
    )
    expect(messages(form({ amount_paid: '17850' }))).toEqual([])
  })

  it('requires a supplier', () => {
    expect(messages(form({ supplier_id: '' }))).toContain('Seleccione el proveedor.')
  })
})

describe('suggestUnitCost', () => {
  const link = (supplierId: number, price: string | null) =>
    ({ supplier: { id: supplierId }, purchase_price: price }) as SupplierProduct

  it("prefers the selected supplier's price, then the last cost", () => {
    const links = [link(4, '900.00'), link(3, '1800.50')]

    expect(suggestUnitCost(links, 3, '1700.00')).toBe('1800.5')
    expect(suggestUnitCost(links, 7, '1700.00')).toBe('1700')
    expect(suggestUnitCost([link(3, null)], 3, '1700.00')).toBe('1700')
  })

  it('leaves the cost empty when nothing is known', () => {
    expect(suggestUnitCost([], null, null)).toBe('')
    expect(suggestUnitCost([], null, '0.00')).toBe('')
  })
})
