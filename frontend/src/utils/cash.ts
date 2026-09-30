import { z } from 'zod'
import type { CashMovementType, CashSessionStatus, ManualCashMovementType } from '@/types/cash'
import { fromCents, isDecimalInput, toCents } from './decimal'
import { formatCurrency } from './format'
import { decimalSchema, optionalTextSchema } from './validation'

export const CASH_MOVEMENT_TYPE_LABELS: Record<CashMovementType, string> = {
  income: 'Ingreso',
  withdrawal: 'Retiro',
  sale: 'Venta',
  sale_cancellation: 'Anulación de venta',
}

/** Mirrors `INBOUND_CASH_MOVEMENT_TYPES` in `app/models/cash.py`. */
export function isInboundCashMovement(type: CashMovementType): boolean {
  return type === 'income' || type === 'sale'
}

export const CASH_SESSION_STATUS_LABELS: Record<CashSessionStatus, string> = {
  open: 'Abierta',
  closed: 'Cerrada',
}

/** Frequent concepts offered as suggestions; any other text is accepted. */
export const CASH_MOVEMENT_CONCEPTS: Record<ManualCashMovementType, readonly string[]> = {
  income: ['Cambio en monedas', 'Ajuste de base', 'Reintegro de gastos'],
  withdrawal: [
    'Pago a proveedor',
    'Consignación bancaria',
    'Gastos del local',
    'Pago de domicilio',
  ],
}

/** Mirrors `CashRegisterCreate` in `app/schemas/cash.py`. */
export const cashRegisterSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Ingrese el nombre de la caja.')
    .max(100, 'El nombre no puede superar 100 caracteres.'),
  description: optionalTextSchema(255, 'La descripción'),
  is_active: z.boolean(),
})

/** Mirrors `CashSessionOpen`: the register comes from a `<select>` as a string. */
export const openSessionSchema = z.object({
  cash_register_id: z
    .string()
    .min(1, 'Seleccione una caja.')
    .transform((value) => Number(value)),
  opening_amount: decimalSchema,
  opening_notes: optionalTextSchema(500, 'Las observaciones'),
})

export type OpenSessionInput = z.input<typeof openSessionSchema>
export type OpenSessionValues = z.output<typeof openSessionSchema>

/**
 * Rules of `CashMovementCreate`. A withdrawal cannot exceed `expectedCash` (the backend checks
 * it again with the session locked).
 */
export function buildCashMovementSchema(type: ManualCashMovementType, expectedCash: string) {
  return z.object({
    amount: decimalSchema
      .refine((value) => toCents(value) > 0n, 'El valor debe ser mayor que 0.')
      .refine(
        (value) => type !== 'withdrawal' || toCents(value) <= toCents(expectedCash),
        `El retiro no puede superar el efectivo en caja (${formatCurrency(expectedCash)}).`,
      ),
    concept: z
      .string()
      .trim()
      .min(3, 'Indique el concepto (mínimo 3 caracteres).')
      .max(255, 'El concepto no puede superar 255 caracteres.'),
  })
}

type CashMovementSchema = ReturnType<typeof buildCashMovementSchema>
export type CashMovementInput = z.input<CashMovementSchema>
export type CashMovementValues = z.output<CashMovementSchema>

export type CashDifferenceKind = 'balanced' | 'surplus' | 'shortage'

export const CASH_DIFFERENCE_LABELS: Record<CashDifferenceKind, string> = {
  balanced: 'Cuadrada',
  surplus: 'Sobrante',
  shortage: 'Faltante',
}

export function cashDifferenceKind(difference: string): CashDifferenceKind {
  const cents = toCents(difference)
  return cents === 0n ? 'balanced' : cents > 0n ? 'surplus' : 'shortage'
}

/** Counted − expected, as the backend computes it; `null` while the count is not a valid
 * amount. */
export function cashDifference(counted: string, expected: string): string | null {
  if (!isDecimalInput(counted)) return null
  return fromCents(toCents(counted) - toCents(expected))
}

/** Rules of `CashSessionClose`: with a surplus or shortage the notes are required (the
 * backend checks it again against the expected cash of the locked session). */
export function buildCloseSessionSchema(expectedCash: string) {
  return z
    .object({
      counted_cash: decimalSchema,
      closing_notes: optionalTextSchema(500, 'Las observaciones'),
    })
    .superRefine((values, context) => {
      const difference = toCents(values.counted_cash) - toCents(expectedCash)
      if (difference !== 0n && values.closing_notes === null) {
        context.addIssue({
          code: 'custom',
          path: ['closing_notes'],
          message: 'Explique el sobrante o faltante.',
        })
      }
    })
}

type CloseSessionSchema = ReturnType<typeof buildCloseSessionSchema>
export type CloseSessionInput = z.input<CloseSessionSchema>
export type CloseSessionValues = z.output<CloseSessionSchema>
