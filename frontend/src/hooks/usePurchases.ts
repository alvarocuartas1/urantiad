import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  cancelPurchase,
  confirmPurchase,
  createPurchase,
  deletePurchase,
  getCostHistory,
  getPurchase,
  listPurchases,
  updatePurchase,
} from '@/services/purchases'
import type { Purchase, PurchaseInput, PurchaseListParams } from '@/types/purchase'
import { refreshStockQueries } from './stockQueries'

const purchasesKey = ['purchases'] as const

export function usePurchases(params: PurchaseListParams) {
  return useQuery({
    queryKey: [...purchasesKey, 'list', params],
    queryFn: () => listPurchases(params),
    placeholderData: keepPreviousData,
  })
}

export function usePurchase(id: number) {
  return useQuery({
    queryKey: [...purchasesKey, 'detail', id],
    queryFn: () => getPurchase(id),
  })
}

export function useCostHistory(productId: number, page: number, size: number) {
  return useQuery({
    // Under `products` so any change of stock or cost refreshes it.
    queryKey: ['products', productId, 'cost-history', { page, size }],
    queryFn: () => getCostHistory(productId, { page, size }),
    placeholderData: keepPreviousData,
  })
}

/** Store the returned purchase and refresh the lists. */
function useUpdatePurchaseCache() {
  const queryClient = useQueryClient()
  return (purchase: Purchase) => {
    queryClient.setQueryData([...purchasesKey, 'detail', purchase.id], purchase)
    return queryClient.invalidateQueries({ queryKey: [...purchasesKey, 'list'] })
  }
}

export function useCreatePurchase() {
  const updateCache = useUpdatePurchaseCache()
  return useMutation({
    mutationFn: (data: PurchaseInput) => createPurchase(data),
    onSuccess: updateCache,
  })
}

export function useUpdatePurchase() {
  const updateCache = useUpdatePurchaseCache()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: PurchaseInput }) => updatePurchase(id, data),
    onSuccess: updateCache,
  })
}

export function useDeletePurchase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deletePurchase(id),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: [...purchasesKey, 'detail', id] })
      return queryClient.invalidateQueries({ queryKey: [...purchasesKey, 'list'] })
    },
  })
}

/**
 * Confirming or cancelling moves stock and costs and (on confirmation) supplier prices,
 * so inventory, products and supplier links are refreshed as well.
 */
function useInventoryChangingMutation<T>(mutationFn: (variables: T) => Promise<Purchase>) {
  const queryClient = useQueryClient()
  const updateCache = useUpdatePurchaseCache()
  return useMutation({
    mutationFn,
    onSuccess: (purchase: Purchase) =>
      Promise.all([updateCache(purchase), refreshStockQueries(queryClient)]),
  })
}

export function useConfirmPurchase() {
  return useInventoryChangingMutation((id: number) => confirmPurchase(id))
}

export function useCancelPurchase() {
  return useInventoryChangingMutation(({ id, reason }: { id: number; reason: string }) =>
    cancelPurchase(id, reason),
  )
}
