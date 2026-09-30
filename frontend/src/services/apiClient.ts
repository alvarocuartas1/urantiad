import type { ApiErrorBody } from '@/types/api'
import type { CurrentUser, TokenResponse } from '@/types/auth'

const API_URL = import.meta.env.VITE_API_URL
const REFRESH_PATH = '/auth/refresh'

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

type QueryValue = string | number | boolean | undefined | null

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, QueryValue>
  /** Retry once after refreshing the session when the API answers 401 (default true). */
  retryOnUnauthorized?: boolean
}

// The access token lives only in memory; the refresh token is an httpOnly cookie.
let accessToken: string | null = null
let refreshPromise: Promise<TokenResponse> | null = null
let sessionListener: ((user: CurrentUser | null) => void) | null = null

export function setAccessToken(token: string | null): void {
  accessToken = token
}

/** Notified with the new user after a refresh, or with null when the session ends. */
export function setSessionListener(listener: ((user: CurrentUser | null) => void) | null): void {
  sessionListener = listener
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ApiErrorBody).detail === 'string' &&
    typeof (value as ApiErrorBody).code === 'string'
  )
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.append(key, String(value))
  }
  const search = params.toString()
  return `${API_URL}${path}${search ? `?${search}` : ''}`
}

/** Send a request and return the response, or throw an `ApiError` if it failed. */
async function fetchApi(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  let response: Response
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'include',
    })
  } catch {
    throw new ApiError(0, {
      detail: 'No se pudo conectar con el servidor.',
      code: 'NETWORK_ERROR',
    })
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    throw new ApiError(
      response.status,
      isApiErrorBody(body)
        ? body
        : { detail: 'Error inesperado del servidor.', code: 'UNKNOWN_ERROR' },
    )
  }
  return response
}

async function send<T>(path: string, options: RequestOptions): Promise<T> {
  const response = await fetchApi(path, options)
  const body: unknown = response.status === 204 ? null : await response.json().catch(() => null)
  return body as T
}

/**
 * Renew the session with the refresh-token cookie. Concurrent callers share one request:
 * sending the same refresh token twice would look like token reuse and end every session.
 */
export function refreshSession(): Promise<TokenResponse> {
  refreshPromise ??= send<TokenResponse>(REFRESH_PATH, { method: 'POST' })
    .then((session) => {
      accessToken = session.access_token
      sessionListener?.(session.user)
      return session
    })
    .catch((error: unknown) => {
      accessToken = null
      sessionListener?.(null)
      throw error
    })
    .finally(() => {
      refreshPromise = null
    })
  return refreshPromise
}

/** Run `request`; after a 401, renew the session once and run it again. */
async function withSessionRetry<T>(
  path: string,
  options: RequestOptions,
  request: () => Promise<T>,
): Promise<T> {
  try {
    return await request()
  } catch (error) {
    const canRetry = options.retryOnUnauthorized !== false && path !== REFRESH_PATH
    if (!(error instanceof ApiError) || error.status !== 401 || !canRetry) throw error
  }
  await refreshSession()
  return request()
}

export function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return withSessionRetry(path, options, () => send<T>(path, options))
}

export interface DownloadedFile {
  blob: Blob
  filename: string
}

/** Name sent by the server in `Content-Disposition: attachment; filename="…"`. */
function attachmentName(header: string | null): string | undefined {
  return header?.match(/filename="?([^";]+)"?/)?.[1]
}

/** Download a file (e.g. a report export) with the same session handling as `apiRequest`. */
export function apiDownload(
  path: string,
  query?: RequestOptions['query'],
  fallbackName = 'descarga',
): Promise<DownloadedFile> {
  const options: RequestOptions = { query }
  return withSessionRetry(path, options, async () => {
    const response = await fetchApi(path, options)
    const filename = attachmentName(response.headers.get('Content-Disposition')) ?? fallbackName
    return { blob: await response.blob(), filename }
  })
}
