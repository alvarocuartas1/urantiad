import { z } from 'zod'
import type { Product } from '@/types/catalog'
import type { Purchase, PurchaseInput, PurchaseStatus } from '@/types/purchase'
import type { SupplierProduct } from '@/types/supplier'
import {
  compareDecimals,
  fromCents,
  isDecimalInput,
  normalizeDecimal,
  toCents,
  trimDecimal,
} from './decimal'
import { isCountableUnit } from './inventory'
import { DECIMAL_MESSAGE, decimalSchema } from './validation'

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  draft: 'Borrador',
  confirmed: 'Confirmada',
  cancelled: 'Anulada',
}

/** Mirrors `MAX_ITEMS` in `app/schemas/purchase.py`. */
const MAX_ITEMS = 200

// --- Amounts (mirror `purchase_service`: half-up rounding to cents) ---------------------

/** `numerator / denominator` rounded half up; both non-negative. */
function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (2n * numerator + denominator) / (2n * denominator)
}

export interface LineAmounts {
  /** Quantity × unit cost, before discount and tax. */
  gross: bigint
  subtotal: bigint
  tax: bigint
  total: bigint
}

/** Amounts of a line in cents. Inputs are valid decimal strings. */
export function lineAmounts(
  quantity: string,
  unitCost: string,
  discount: string,
  taxRate: string,
): LineAmounts {
  // Cents × cents is in 1/10000: dividing by 100 gives cents.
  const gross = divideHalfUp(toCents(quantity) * toCents(unitCost), 100n)
  const subtotal = gross - toCents(discount || '0')
  // The rate in cents of a percent (19 % → 1900): subtotal × 1900 / 10000.
  const tax = subtotal > 0n ? divideHalfUp(subtotal * toCents(taxRate), 10000n) : 0n
  return { gross, subtotal, tax, total: subtotal + tax }
}

/** Cost per unit after the line discount, as the backend computes `net_unit_cost`. */
export function netUnitCost(quantity: string, subtotal: bigint): string {
  const quantityCents = toCents(quantity)
  if (quantityCents <= 0n || subtotal < 0n) return '0.00'
  return fromCents(divideHalfUp(subtotal * 100n, quantityCents))
}

// --- Form -------------------------------------------------------------------------------

export type LineProduct = Pick<Product, 'id' | 'sku' | 'name' | 'unit_of_measure'>

/** Optional money input: empty means 0. */
const optionalDecimal = z
  .string()
  .trim()
  .refine((value) => value === '' || isDecimalInput(value), DECIMAL_MESSAGE)
  .transform((value) => (value ? normalizeDecimal(value) : '0'))

const lineSchema = z
  .object({
    product: z.custom<LineProduct>(),
    quantity: decimalSchema.refine(
      (value) => toCents(value) > 0n,
      'La cantidad debe ser mayor que 0.',
    ),
    unit_cost: decimalSchema,
    discount: optionalDecimal,
    tax_rate: decimalSchema.refine(
      (value) => compareDecimals(value, '100') <= 0,
      'El IVA no puede superar 100 %.',
    ),
  })
  .superRefine((line, ctx) => {
    if (isCountableUnit(line.product.unit_of_measure) && toCents(line.quantity) % 100n !== 0n) {
      ctx.addIssue({
        code: 'custom',
        path: ['quantity'],
        message: 'Ingrese una cantidad entera para esta unidad de medida.',
      })
    }
    const { gross } = lineAmounts(line.quantity, line.unit_cost, '0', '0')
    if (toCents(line.discount) > gross) {
      ctx.addIssue({
        code: 'custom',
        path: ['discount'],
        message: 'El descuento no puede superar cantidad × costo.',
      })
    }
  })

/** Mirrors `PurchaseInput` in `app/schemas/purchase.py`. */
export const purchaseFormSchema = z
  .object({
    supplier_id: z.string().min(1, 'Seleccione el proveedor.'),
    supplier_invoice_number: z
      .string()
      .trim()
      .max(50, 'La factura no puede superar 50 caracteres.'),
    amount_paid: optionalDecimal,
    notes: z.string().trim().max(500, 'Las observaciones no pueden superar 500 caracteres.'),
    items: z.array(lineSchema).max(MAX_ITEMS, `Máximo ${MAX_ITEMS} productos por compra.`),
  })
  .superRefine((purchase, ctx) => {
    const total = purchase.items.reduce(
      (sum, line) =>
        sum + lineAmounts(line.quantity, line.unit_cost, line.discount, line.tax_rate).total,
      0n,
    )
    if (toCents(purchase.amount_paid) > total) {
      ctx.addIssue({
        code: 'custom',
        path: ['amount_paid'],
        message: 'El valor pagado no puede superar el total.',
      })
    }
  })

export type PurchaseFormInput = z.input<typeof purchaseFormSchema>
export type PurchaseFormValues = z.output<typeof purchaseFormSchema>
export type PurchaseLineInput = PurchaseFormInput['items'][number]

export const EMPTY_PURCHASE: PurchaseFormInput = {
  supplier_id: '',
  supplier_invoice_number: '',
  amount_paid: '',
  notes: '',
  items: [],
}

/** Editable form values of a saved draft. Zero discounts and payments are left blank. */
export function toPurchaseForm(purchase: Purchase): PurchaseFormInput {
  const blankIfZero = (value: string) => (toCents(value) === 0n ? '' : trimDecimal(value))
  return {
    supplier_id: String(purchase.supplier.id),
    supplier_invoice_number: purchase.supplier_invoice_number ?? '',
    amount_paid: blankIfZero(purchase.amount_paid),
    notes: purchase.notes ?? '',
    items: purchase.items.map((item) => ({
      product: item.product,
      quantity: trimDecimal(item.quantity),
      unit_cost: trimDecimal(item.unit_cost),
      discount: blankIfZero(item.discount),
      tax_rate: trimDecimal(item.tax_rate),
    })),
  }
}

export function toPurchaseInput(values: PurchaseFormValues): PurchaseInput {
  return {
    supplier_id: Number(values.supplier_id),
    supplier_invoice_number: values.supplier_invoice_number || null,
    amount_paid: values.amount_paid,
    notes: values.notes || null,
    items: values.items.map(({ product, ...line }) => ({ product_id: product.id, ...line })),
  }
}

/** New line for a scanned or selected product: one unit at the suggested cost. */
export function newLine(product: Product, unitCost: string): PurchaseLineInput {
  const { id, sku, name, unit_of_measure } = product
  return {
    product: { id, sku, name, unit_of_measure },
    quantity: '1',
    unit_cost: unitCost,
    discount: '',
    tax_rate: trimDecimal(product.tax_rate),
  }
}

/**
 * Cost to prefill: the selected supplier's price for the product, otherwise its last cost
 * (`null` when the user cannot see costs). Empty when neither is known.
 */
export function suggestUnitCost(
  links: SupplierProduct[],
  supplierId: number | null,
  lastCost: string | null,
): string {
  const price = links.find((link) => link.supplier.id === supplierId)?.purchase_price
  const cost = price ?? lastCost
  return cost && toCents(cost) > 0n ? trimDecimal(cost) : ''
}

// --- Live totals of the form ------------------------------------------------------------

function isValidLine(line: PurchaseLineInput): boolean {
  return (
    isDecimalInput(line.quantity) &&
    isDecimalInput(line.unit_cost) &&
    (line.discount.trim() === '' || isDecimalInput(line.discount)) &&
    isDecimalInput(line.tax_rate)
  )
}

/** Amounts of a form line, or `null` while any of its fields is not a valid number. */
export function formLineAmounts(line: PurchaseLineInput): LineAmounts | null {
  return isValidLine(line)
    ? lineAmounts(line.quantity, line.unit_cost, line.discount, line.tax_rate)
    : null
}

export interface PurchaseTotalsValues {
  subtotal: string
  discount_total: string
  tax_total: string
  total: string
  amount_paid: string
  balance_due: string
}

/** Totals of the form as the backend will compute them; lines being typed count as 0. */
export function formTotals(lines: PurchaseLineInput[], amountPaid: string): PurchaseTotalsValues {
  let gross = 0n
  let discount = 0n
  let tax = 0n
  for (const line of lines) {
    const amounts = formLineAmounts(line)
    if (!amounts) continue
    gross += amounts.gross
    discount += amounts.gross - amounts.subtotal
    tax += amounts.tax
  }
  const total = gross - discount + tax
  const paid = isDecimalInput(amountPaid) ? toCents(amountPaid) : 0n
  return {
    subtotal: fromCents(gross),
    discount_total: fromCents(discount),
    tax_total: fromCents(tax),
    total: fromCents(total),
    amount_paid: fromCents(paid),
    balance_due: fromCents(total - paid),
  }
}

/** Date shown for a purchase: its confirmation, or its creation while it is a draft. */
export function purchaseDate(purchase: {
  confirmed_at: string | null
  created_at: string
}): string {
  return purchase.confirmed_at ?? purchase.created_at
}
