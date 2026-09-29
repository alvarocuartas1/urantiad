import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createProduct, listPriceHistory, listProducts, updateProduct } from '@/services/products'
import type { ProductCreate, ProductListParams, ProductUpdate } from '@/types/catalog'

const productsKey = ['products'] as const

export function useProducts(params: ProductListParams, { enabled = true } = {}) {
  return useQuery({
    queryKey: [...productsKey, params],
    queryFn: () => listProducts(params),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function usePriceHistory(productId: number, page: number, size: number) {
  return useQuery({
    queryKey: [...productsKey, productId, 'price-history', { page, size }],
    queryFn: () => listPriceHistory(productId, { page, size }),
    placeholderData: keepPreviousData,
  })
}

export function useCreateProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: ProductCreate) => createProduct(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: productsKey }),
  })
}

export function useUpdateProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ProductUpdate }) => updateProduct(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: productsKey }),
  })
}
