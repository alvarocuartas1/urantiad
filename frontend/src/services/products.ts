import type { Page } from '@/types/api'
import type {
  PriceHistoryEntry,
  Product,
  ProductCreate,
  ProductListParams,
  ProductUpdate,
} from '@/types/catalog'
import { apiRequest } from './apiClient'

export function listProducts(params: ProductListParams): Promise<Page<Product>> {
  return apiRequest<Page<Product>>('/products', { query: { ...params } })
}

export function getProduct(id: number): Promise<Product> {
  return apiRequest<Product>(`/products/${id}`)
}

export function createProduct(data: ProductCreate): Promise<Product> {
  return apiRequest<Product>('/products', { method: 'POST', body: data })
}

export function updateProduct(id: number, data: ProductUpdate): Promise<Product> {
  return apiRequest<Product>(`/products/${id}`, { method: 'PATCH', body: data })
}

export function listPriceHistory(
  id: number,
  params: { page: number; size: number },
): Promise<Page<PriceHistoryEntry>> {
  return apiRequest<Page<PriceHistoryEntry>>(`/products/${id}/price-history`, {
    query: { ...params },
  })
}
