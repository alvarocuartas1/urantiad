import { z } from 'zod'

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
