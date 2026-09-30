import { keepPreviousData, type Query, useQuery } from '@tanstack/react-query'
import { getInventoryRotation, getSalesTrend, getTopProducts } from '@/services/statistics'
import type {
  RotationParams,
  SalesTrend,
  SalesTrendParams,
  TopProductsParams,
} from '@/types/statistics'

// Like reports, statistics reload when opened instead of being invalidated from every
// operation that changes sales or stock.
const statisticsOptions = { placeholderData: keepPreviousData, staleTime: 0 } as const

export function useSalesTrend(params: SalesTrendParams, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['statistics', 'sales-trend', params],
    queryFn: () => getSalesTrend(params),
    enabled,
    staleTime: 0,
    // Points of another granularity would be labeled as the new one while it loads.
    placeholderData: (
      previous: SalesTrend | undefined,
      previousQuery: Query<SalesTrend, Error, SalesTrend, readonly unknown[]> | undefined,
    ) => {
      const previousParams = previousQuery?.queryKey[2] as SalesTrendParams | undefined
      return previousParams?.granularity === params.granularity ? previous : undefined
    },
  })
}

export function useTopProducts(params: TopProductsParams, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['statistics', 'top-products', params],
    queryFn: () => getTopProducts(params),
    enabled,
    ...statisticsOptions,
  })
}

export function useInventoryRotation(params: RotationParams, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['statistics', 'inventory-rotation', params],
    queryFn: () => getInventoryRotation(params),
    enabled,
    ...statisticsOptions,
  })
}
