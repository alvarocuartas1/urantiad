import { z } from 'zod'
import type { UnitOfMeasure } from '@/types/catalog'
import type { AdjustmentCreate, AdjustmentDirection, MovementType } from '@/types/inventory'
import { fromCents, isDecimalInput, normalizeDecimal, toCents } from './decimal'
import { DECIMAL_MESSAGE, decimalSchema } from './validation'

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  purchase_entry: 'Entrada por compra',
  sale: 'Venta',
  adjustment_in: 'Ajuste positivo',
  adjustment_out: 'Ajuste negativo',
  purchase_return: 'Devolución de compra',
  purchase_cancellation: 'Anulación de compra',
  sale_return: 'Devolución de venta',
  sale_cancellation: 'Anulación de venta',
}

/** Mirrors `INBOUND_MOVEMENT_TYPES` in `app/models/inventory.py`. */
const INBOUND_TYPES: ReadonlySet<MovementType> = new Set([
  'purchase_entry',
  'adjustment_in',
  'sale_return',
  'sale_cancellation',
])

export function isInbound(type: MovementType): boolean {
  return INBOUND_TYPES.has(type)
}

/** Units sold whole (mirrors `COUNTABLE_UNITS` in the backend). */
const COUNTABLE_UNITS: ReadonlySet<UnitOfMeasure> = new Set(['unit', 'pack', 'box', 'page'])

export function isCountableUnit(unit: UnitOfMeasure): boolean {
  return COUNTABLE_UNITS.has(unit)
}

/** Frequent reasons offered as suggestions; any other text is accepted. */
export const ADJUSTMENT_REASONS = [
  'Carga inicial de inventario',
  'Conteo físico',
  'Producto vencido',
  'Producto dañado',
  'Consumo interno',
] as const

/** Adjustment form rules for a product measured in `unit` (mirrors `AdjustmentCreate`). */
export function buildAdjustmentSchema(unit: UnitOfMeasure) {
  return z.object({
    direction: z.enum(['in', 'out']),
    quantity: decimalSchema
      .refine((value) => toCents(value) > 0n, 'La cantidad debe ser mayor que 0.')
      .refine(
        (value) => !isCountableUnit(unit) || toCents(value) % 100n === 0n,
        'Ingrese una cantidad entera para esta unidad de medida.',
      ),
    unit_cost: z
      .string()
      .trim()
      .refine((value) => value === '' || isDecimalInput(value), DECIMAL_MESSAGE)
      .transform((value) => (value ? normalizeDecimal(value) : null)),
    reason: z
      .string()
      .trim()
      .min(3, 'Indique el motivo (mínimo 3 caracteres).')
      .max(255, 'El motivo no puede superar 255 caracteres.'),
  })
}

type AdjustmentSchema = ReturnType<typeof buildAdjustmentSchema>
export type AdjustmentFormInput = z.input<AdjustmentSchema>
export type AdjustmentFormValues = z.output<AdjustmentSchema>

export const EMPTY_ADJUSTMENT: AdjustmentFormInput = {
  direction: 'in',
  quantity: '',
  unit_cost: '',
  reason: '',
}

/** Body for `POST /inventory/adjustments`: the cost is sent only for entries. */
export function toAdjustmentCreate(
  productId: number,
  values: AdjustmentFormValues,
): AdjustmentCreate {
  const body: AdjustmentCreate = {
    product_id: productId,
    direction: values.direction,
    quantity: values.quantity,
    reason: values.reason,
  }
  return values.direction === 'in' && values.unit_cost !== null
    ? { ...body, unit_cost: values.unit_cost }
    : body
}

/** Stock after applying the adjustment, or `null` while the quantity is not valid yet. */
export function resultingStock(
  currentStock: string,
  direction: AdjustmentDirection,
  quantity: string,
): string | null {
  if (!isDecimalInput(quantity)) return null
  const change = toCents(quantity)
  return fromCents(toCents(currentStock) + (direction === 'in' ? change : -change))
}

// Colombia has no daylight saving time, so its offset is always -05:00.
const BUSINESS_UTC_OFFSET = '-05:00'

/**
 * API range for whole business days: `from` at 00:00 (inclusive) to the day after `to`
 * (exclusive). Dates are "YYYY-MM-DD" values from `<input type="date">`.
 */
export function businessDayRange(
  from: string,
  to: string,
): { date_from?: string; date_to?: string } {
  const range: { date_from?: string; date_to?: string } = {}
  if (from) range.date_from = `${from}T00:00:00${BUSINESS_UTC_OFFSET}`
  if (to) {
    const nextDay = new Date(`${to}T00:00:00Z`)
    nextDay.setUTCDate(nextDay.getUTCDate() + 1)
    range.date_to = `${nextDay.toISOString().slice(0, 10)}T00:00:00${BUSINESS_UTC_OFFSET}`
  }
  return range
}
