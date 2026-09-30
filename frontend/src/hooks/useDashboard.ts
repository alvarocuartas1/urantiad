import { useQuery } from '@tanstack/react-query'
import { getDashboard } from '@/services/dashboard'

const REFRESH_INTERVAL_MS = 60_000

/** Today's snapshot. Like reports, it reloads when opened instead of being invalidated from
 * every operation, and refreshes every minute while the tab is visible. */
export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: getDashboard,
    staleTime: 0,
    refetchInterval: REFRESH_INTERVAL_MS,
  })
}
