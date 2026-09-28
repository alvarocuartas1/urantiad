import type { ApiErrorBody } from '@/types/api'

const API_URL = import.meta.env.VITE_API_URL

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, body: ApiErrorBody) {
    super(body.detail)
    this.name = 'ApiError'
    this.status = status
    this.code = body.code
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ApiErrorBody).detail === 'string' &&
    typeof (value as ApiErrorBody).code === 'string'
  )
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch {
    throw new ApiError(0, {
      detail: 'No se pudo conectar con el servidor.',
      code: 'NETWORK_ERROR',
    })
  }

  const body: unknown = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(
      response.status,
      isApiErrorBody(body)
        ? body
        : { detail: 'Error inesperado del servidor.', code: 'UNKNOWN_ERROR' },
    )
  }
  return body as T
}
