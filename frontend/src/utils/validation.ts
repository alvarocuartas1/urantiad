import { z } from 'zod'
import { isDecimalInput, normalizeDecimal } from './decimal'

export const DECIMAL_MESSAGE = 'Ingrese un número sin puntos de miles (máximo 2 decimales).'

/** Money or quantity typed by the user ("2500,5"), sent to the API as "2500.5". */
export const decimalSchema = z
  .string()
  .trim()
  .refine(isDecimalInput, DECIMAL_MESSAGE)
  .transform(normalizeDecimal)

/** Optional text: an empty value is sent as `null`. */
export function optionalTextSchema(max: number, label: string) {
  return z
    .string()
    .trim()
    .max(max, `${label} no puede superar ${max} caracteres.`)
    .transform((value) => value || null)
}

// Contact fields mirror the backend rules in `app/schemas/contact.py`.
export const documentTypeSchema = z.enum(['nit', 'cc', 'ce', 'passport', 'other'])

/** Stored without dots or spaces, as the backend does: "900.123.456-7" → "900123456-7". */
export const documentNumberSchema = z
  .string()
  .transform((value) => value.replace(/[.\s]/g, '').toUpperCase())
  .pipe(
    z
      .string()
      .min(1, 'Ingrese el número de documento.')
      .max(30, 'El documento no puede superar 30 caracteres.')
      .regex(/^[A-Z0-9][A-Z0-9-]*$/, 'Use solo letras, números y guion.'),
  )

export const phoneSchema = z
  .string()
  .trim()
  .max(30, 'El teléfono no puede superar 30 caracteres.')
  .regex(/^[0-9+() -]*$/, 'Use solo números, espacios y los signos + - ( ).')
  .transform((value) => value || null)

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(255, 'El correo no puede superar 255 caracteres.')
  .refine((value) => !value || z.email().safeParse(value).success, 'Ingrese un correo válido.')
  .transform((value) => value || null)

/** Mirrors the backend rules in `app/schemas/user.py`. */
export const newPasswordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres.')
  .max(128, 'La contraseña no puede superar 128 caracteres.')

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'El usuario debe tener al menos 3 caracteres.')
  .max(50, 'El usuario no puede superar 50 caracteres.')
  .regex(/^[a-z0-9._-]+$/, 'Use solo letras, números, punto, guion o guion bajo (sin espacios).')

export const fullNameSchema = z
  .string()
  .trim()
  .min(1, 'Ingrese el nombre completo.')
  .max(150, 'El nombre no puede superar 150 caracteres.')
