import type { HealthStatus } from '@/types/api'
import { apiRequest } from './apiClient'

export function getHealth(): Promise<HealthStatus> {
  return apiRequest<HealthStatus>('/health')
}
