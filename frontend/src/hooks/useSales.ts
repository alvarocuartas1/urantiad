import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { cancelSale, createSale, getSale, listPaymentMethods, listSales } from '@/services/sales'
import type { Sale, SaleCreate, SaleListParams } from '@/types/sale'
import { refreshStockQueries } from './stockQueries'

const salesKey = ['sales'] as const

export function usePaymentMethods() {
  // A short catalog that rarely changes: loaded once per session.
  return useQuery({
    queryKey: ['payment-methods'],
    queryFn: listPaymentMethods,
    staleTime: Infinity,
  })
}

export function useSales(params: SaleListParams) {
  return useQuery({
    queryKey: [...salesKey, 'list', params],
    queryFn: () => listSales(params),
    placeholderData: keepPreviousData,
  })
}

export function useSale(id: number) {
  return useQuery({
    queryKey: [...salesKey, 'detail', id],
    queryFn: () => getSale(id),
  })
}

/** A sale or its cancellation moves stock and cash: refresh sales, stock and cash queries. */
function applySaleChange(queryClient: QueryClient, sale: Sale) {
  queryClient.setQueryData([...salesKey, 'detail', sale.id], sale)
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: [...salesKey, 'list'] }),
    queryClient.invalidateQueries({ queryKey: ['cash'] }),
    refreshStockQueries(queryClient),
  ])
}

export function useCreateSale() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: SaleCreate) => createSale(data),
    onSuccess: (sale) => applySaleChange(queryClient, sale),
  })
}

export function useCancelSale() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => cancelSale(id, reason),
    onSuccess: (sale) => applySaleChange(queryClient, sale),
  })
}
