import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { listAuditLogs } from '@/services/audit'
import type { AuditLogListParams } from '@/types/audit'

/** Almost every mutation of the app adds audit records, so instead of invalidating this
 * query from all of them the page always reloads when it is opened. */
export function useAuditLogs(params: AuditLogListParams) {
  return useQuery({
    queryKey: ['audit-logs', params],
    queryFn: () => listAuditLogs(params),
    placeholderData: keepPreviousData,
    staleTime: 0,
  })
}
