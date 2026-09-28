/** Uniform error body returned by the backend. */
export interface ApiErrorBody {
  detail: string
  code: string
}

export interface HealthStatus {
  status: 'ok' | 'degraded'
  database: 'ok' | 'unavailable'
}
