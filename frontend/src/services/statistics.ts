import type {
  RotationPage,
  RotationParams,
  SalesTrend,
  SalesTrendParams,
  TopProduct,
  TopProductsParams,
} from '@/types/statistics'
import { apiRequest } from './apiClient'

export function getSalesTrend(params: SalesTrendParams): Promise<SalesTrend> {
  return apiRequest('/statistics/sales-trend', { query: { ...params } })
}

export function getTopProducts(params: TopProductsParams): Promise<TopProduct[]> {
  return apiRequest('/statistics/top-products', { query: { ...params } })
}

export function getInventoryRotation(params: RotationParams): Promise<RotationPage> {
  return apiRequest('/statistics/inventory-rotation', { query: { ...params } })
}
