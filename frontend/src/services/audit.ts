import type { Page } from '@/types/api'
import type { AuditLog, AuditLogListParams } from '@/types/audit'
import { apiRequest } from './apiClient'

export function listAuditLogs(params: AuditLogListParams): Promise<Page<AuditLog>> {
  return apiRequest<Page<AuditLog>>('/audit-logs', { query: { ...params } })
}
