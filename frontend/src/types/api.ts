/** Uniform error body returned by the backend. */
export interface ApiErrorBody {
  detail: string
  code: string
}

export interface HealthStatus {
  status: 'ok' | 'degraded'
  database: 'ok' | 'unavailable'
}

/** Paginated list response (`Page[T]` in the backend). */
export interface Page<T> {
  items: T[]
  total: number
  page: number
  size: number
}
