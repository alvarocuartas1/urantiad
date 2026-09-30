import type { Dashboard } from '@/types/dashboard'
import { apiRequest } from './apiClient'

export function getDashboard(): Promise<Dashboard> {
  return apiRequest('/dashboard')
}
