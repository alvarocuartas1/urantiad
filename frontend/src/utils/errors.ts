import { ApiError } from '@/services/apiClient'

export function getErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Ocurrió un error inesperado.'
}

export function isApiErrorCode(error: unknown, code: string): boolean {
  return error instanceof ApiError && error.code === code
}
