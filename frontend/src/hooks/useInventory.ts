import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createAdjustment, listMovements, listReplenishment } from '@/services/inventory'
import type {
  AdjustmentCreate,
  MovementListParams,
  ReplenishmentListParams,
} from '@/types/inventory'

const inventoryKey = ['inventory'] as const

export function useMovements(params: MovementListParams) {
  return useQuery({
    queryKey: [...inventoryKey, 'movements', params],
    queryFn: () => listMovements(params),
    placeholderData: keepPreviousData,
  })
}

export function useReplenishment(params: ReplenishmentListParams) {
  return useQuery({
    queryKey: [...inventoryKey, 'replenishment', params],
    queryFn: () => listReplenishment(params),
    placeholderData: keepPreviousData,
  })
}

/** An adjustment changes stock and costs, so product lists are refreshed too. */
export function useCreateAdjustment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: AdjustmentCreate) => createAdjustment(data),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: inventoryKey }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
      ]),
  })
}
