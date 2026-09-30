import { z } from 'zod'

export const MAX_SORT_ORDER = 1000

/** Mirrors `PaymentMethodCreate`/`PaymentMethodUpdate`: the order comes from a text input. */
export const paymentMethodSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Ingrese el nombre del método de pago.')
    .max(50, 'El nombre no puede superar 50 caracteres.'),
  sort_order: z
    .string()
    .trim()
    .regex(/^\d+$/, 'Ingrese un número entero (0 o mayor).')
    .transform(Number)
    .refine((value) => value <= MAX_SORT_ORDER, `El orden no puede superar ${MAX_SORT_ORDER}.`),
  is_active: z.boolean(),
})

/** Next free position: after the last method. */
export function nextSortOrder(orders: number[]): number {
  return Math.min(Math.max(0, ...orders) + 1, MAX_SORT_ORDER)
}
