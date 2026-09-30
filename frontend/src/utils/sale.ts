import { z } from 'zod'
import type { Product } from '@/types/catalog'
import type { PaymentMethod, SaleCreate, SalePaymentInput, SaleStatus } from '@/types/sale'
import { divideHalfUp, fromCents, isDecimalInput, normalizeDecimal, toCents } from './decimal'
import { formatCurrency, formatQuantity } from './format'
import { isCountableUnit } from './inventory'
import { DECIMAL_MESSAGE } from './validation'

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  completed: 'Completada',
  cancelled: 'Anulada',
}

/** Mirrors `MAX_ITEMS` in `app/schemas/sale.py`. */
export const MAX_SALE_ITEMS = 200

// --- Cart -------------------------------------------------------------------------------

export type CartProduct = Pick<
  Product,
  'id' | 'type' | 'sku' | 'name' | 'unit_of_measure' | 'sale_price' | 'tax_rate' | 'current_stock'
>

export interface CartLine {
  product: CartProduct
  /** As typed by the cashier (may be invalid while editing). */
  quantity: string
  /** Discount of the line as typed; empty means 0. */
  discount: string
}

export function toCartProduct(product: Product): CartProduct {
  const { id, type, sku, name, unit_of_measure, sale_price, tax_rate, current_stock } = product
  return { id, type, sku, name, unit_of_measure, sale_price, tax_rate, current_stock }
}

/** Optional money typed by the cashier: empty is 0; `null` when it is not a valid number. */
function optionalCents(value: string): bigint | null {
  const trimmed = value.trim()
  if (trimmed === '') return 0n
  return isDecimalInput(trimmed) ? toCents(trimmed) : null
}

/** Quantity × price with tax, rounded half up to cents (as the backend). */
function grossCents(quantity: string, price: string): bigint {
  return divideHalfUp(toCents(quantity) * toCents(price), 100n)
}

export interface LineErrors {
  quantity?: string
  discount?: string
}

/** Problems of a cart line that the backend would reject. */
export function lineErrors(line: CartLine): LineErrors {
  const errors: LineErrors = {}
  const quantity = line.quantity.trim()
  if (!isDecimalInput(quantity) || toCents(quantity) <= 0n) {
    errors.quantity = 'Ingrese una cantidad mayor que 0.'
  } else if (isCountableUnit(line.product.unit_of_measure) && toCents(quantity) % 100n !== 0n) {
    errors.quantity = 'Ingrese una cantidad entera.'
  }
  const discount = optionalCents(line.discount)
  if (discount === null) {
    errors.discount = DECIMAL_MESSAGE
  } else if (!errors.quantity && discount > grossCents(quantity, line.product.sale_price)) {
    errors.discount = 'El descuento no puede superar el valor de la línea.'
  }
  return errors
}

/** Warning (not an error: negative stock may be enabled) when the stock does not cover it. */
export function stockWarning(line: CartLine): string | null {
  if (line.product.type !== 'product' || !isDecimalInput(line.quantity.trim())) return null
  if (toCents(line.quantity.trim()) <= toCents(line.product.current_stock)) return null
  return `Stock disponible: ${formatQuantity(line.product.current_stock)}.`
}

/**
 * Split `amount` in proportion to `weights` in whole cents (largest remainder method), as
 * `sale_service.allocate`: the parts add up to `amount` and none exceeds its weight.
 */
export function allocateCents(amount: bigint, weights: bigint[]): bigint[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0n)
  if (amount === 0n || total === 0n) return weights.map(() => 0n)
  const parts = weights.map((weight, index) => ({
    index,
    share: (amount * weight) / total,
    remainder: (amount * weight) % total,
  }))
  const leftover = amount - parts.reduce((sum, part) => sum + part.share, 0n)
  // The cents left over go to the largest remainders (ties: the first line).
  const ranked = [...parts].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  )
  const extra = new Set(ranked.slice(0, Number(leftover)).map((part) => part.index))
  return parts.map((part) => part.share + (extra.has(part.index) ? 1n : 0n))
}

/** Tax included in a total with tax: total × rate / (100 + rate), half up. */
export function includedTaxCents(total: bigint, taxRate: string): bigint {
  const rate = toCents(taxRate) // 19 % → 1900
  return total > 0n ? divideHalfUp(total * rate, 10000n + rate) : 0n
}

export interface LineAmounts {
  gross: bigint
  discount: bigint
  saleDiscountShare: bigint
  total: bigint
  tax: bigint
}

export interface CartTotals {
  lines: LineAmounts[]
  subtotal: bigint
  linesDiscount: bigint
  saleDiscount: bigint
  discountTotal: bigint
  taxTotal: bigint
  total: bigint
  /** The cart can be charged: it has lines and every value is valid. */
  valid: boolean
  saleDiscountError?: string
}

/** Totals as the backend will compute them (preview only: the server is the source of
 * truth). Lines with invalid values count as 0 and make the cart invalid. */
export function cartTotals(lines: CartLine[], saleDiscountInput: string): CartTotals {
  let valid = lines.length > 0 && lines.length <= MAX_SALE_ITEMS
  const base = lines.map((line) => {
    const errors = lineErrors(line)
    if (errors.quantity || errors.discount) {
      valid = false
      return { line, gross: 0n, discount: 0n }
    }
    return {
      line,
      gross: grossCents(line.quantity.trim(), line.product.sale_price),
      discount: optionalCents(line.discount) ?? 0n,
    }
  })
  const netTotal = base.reduce((sum, { gross, discount }) => sum + gross - discount, 0n)

  let saleDiscount = optionalCents(saleDiscountInput)
  let saleDiscountError: string | undefined
  if (saleDiscount === null) {
    saleDiscountError = DECIMAL_MESSAGE
  } else if (saleDiscount > netTotal) {
    saleDiscountError = `El descuento no puede superar ${formatCurrency(fromCents(netTotal))}.`
  }
  if (saleDiscountError) {
    valid = false
    saleDiscount = 0n
  }

  const shares = allocateCents(
    saleDiscount ?? 0n,
    base.map(({ gross, discount }) => gross - discount),
  )
  const amounts = base.map(({ line, gross, discount }, index): LineAmounts => {
    const saleDiscountShare = shares[index] ?? 0n
    const total = gross - discount - saleDiscountShare
    return {
      gross,
      discount,
      saleDiscountShare,
      total,
      tax: includedTaxCents(total, line.product.tax_rate),
    }
  })
  const sum = (pick: (amounts: LineAmounts) => bigint) =>
    amounts.reduce((total, line) => total + pick(line), 0n)
  const subtotal = sum((line) => line.gross)
  const linesDiscount = sum((line) => line.discount)
  const discountTotal = linesDiscount + (saleDiscount ?? 0n)
  return {
    lines: amounts,
    subtotal,
    linesDiscount,
    saleDiscount: saleDiscount ?? 0n,
    discountTotal,
    taxTotal: sum((line) => line.tax),
    total: subtotal - discountTotal,
    valid,
    saleDiscountError,
  }
}

// --- Payments ---------------------------------------------------------------------------

const moneySchema = z
  .string()
  .trim()
  .refine(isDecimalInput, DECIMAL_MESSAGE)
  .transform(normalizeDecimal)
  .refine((value) => toCents(value) > 0n, 'El valor debe ser mayor que 0.')

const optionalMoneySchema = z
  .string()
  .trim()
  .refine((value) => value === '' || isDecimalInput(value), DECIMAL_MESSAGE)
  .transform((value) => (value ? normalizeDecimal(value) : null))

/**
 * Rules of the payments of `SaleCreate` for a sale of `total`: they must add up to the total,
 * each method once, and only cash records the amount handed over (not less than its part).
 */
export function buildPaymentsSchema(total: string, methods: PaymentMethod[]) {
  const isCash = (methodId: string) => methods.find((m) => String(m.id) === methodId)?.is_cash
  const payment = z
    .object({
      payment_method_id: z.string().min(1, 'Seleccione el método de pago.'),
      amount: moneySchema,
      amount_tendered: optionalMoneySchema,
      reference: z.string().trim().max(100, 'La referencia no puede superar 100 caracteres.'),
    })
    .superRefine((value, ctx) => {
      if (
        value.amount_tendered !== null &&
        isCash(value.payment_method_id) &&
        toCents(value.amount_tendered) < toCents(value.amount)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['amount_tendered'],
          message: 'El dinero recibido no alcanza.',
        })
      }
    })
  return z
    .object({ payments: z.array(payment).min(1, 'Agregue un método de pago.') })
    .superRefine(({ payments }, ctx) => {
      const ids = payments.map((p) => p.payment_method_id)
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['payments'],
          message: 'Cada método de pago puede usarse una sola vez.',
        })
      }
      const paid = payments.reduce((sum, p) => sum + toCents(p.amount), 0n)
      if (paid !== toCents(total)) {
        ctx.addIssue({
          code: 'custom',
          path: ['payments'],
          message: `Los pagos suman ${formatCurrency(fromCents(paid))} y el total es ${formatCurrency(total)}.`,
        })
      }
    })
}

type PaymentsSchema = ReturnType<typeof buildPaymentsSchema>
export type PaymentsFormInput = z.input<PaymentsSchema>
export type PaymentsFormValues = z.output<PaymentsSchema>
export type PaymentFormLine = PaymentsFormInput['payments'][number]

/** Summary of the payments being typed: paid so far, missing part and cash change. */
export function paymentProgress(payments: PaymentFormLine[], total: string, cashId: string) {
  let paid = 0n
  let change = 0n
  for (const payment of payments) {
    const amount = isDecimalInput(payment.amount.trim()) ? toCents(payment.amount.trim()) : 0n
    paid += amount
    const tendered = payment.amount_tendered.trim()
    if (payment.payment_method_id === cashId && isDecimalInput(tendered)) {
      const difference = toCents(tendered) - amount
      if (difference > 0n) change += difference
    }
  }
  return { paid, remaining: toCents(total) - paid, change }
}

/** Body of `POST /sales`. Only cash payments send the amount handed over. */
export function toSaleCreate(
  lines: CartLine[],
  saleDiscount: bigint,
  customerId: number | null,
  payments: PaymentsFormValues['payments'],
  methods: PaymentMethod[],
): SaleCreate {
  const cashIds = new Set(methods.filter((m) => m.is_cash).map((m) => String(m.id)))
  return {
    customer_id: customerId,
    items: lines.map((line) => ({
      product_id: line.product.id,
      quantity: normalizeDecimal(line.quantity),
      discount: fromCents(optionalCents(line.discount) ?? 0n),
    })),
    sale_discount: fromCents(saleDiscount),
    payments: payments.map((payment): SalePaymentInput => ({
      payment_method_id: Number(payment.payment_method_id),
      amount: payment.amount,
      amount_tendered: cashIds.has(payment.payment_method_id) ? payment.amount_tendered : null,
      reference: payment.reference || null,
    })),
    notes: null,
  }
}
