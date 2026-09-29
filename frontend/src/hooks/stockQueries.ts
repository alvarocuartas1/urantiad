import type { QueryClient } from '@tanstack/react-query'

/** Query keys whose data depends on stock and costs. */
const STOCK_QUERY_KEYS = [['products'], ['inventory'], ['supplier-products']] as const

/**
 * Refresh everything a stock movement changes (adjustments, confirmed or cancelled purchases).
 * Queries on screen are refetched; the rest are dropped instead of refetched, so reopening a
 * list shows it loading rather than stale stock or costs, without extra requests now.
 */
export function refreshStockQueries(queryClient: QueryClient): Promise<unknown> {
  for (const queryKey of STOCK_QUERY_KEYS) {
    queryClient.removeQueries({ queryKey, type: 'inactive' })
  }
  return Promise.all(
    STOCK_QUERY_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  )
}
