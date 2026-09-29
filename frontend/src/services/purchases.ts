import type { Page } from '@/types/api'
import type {
  CostHistoryPage,
  Purchase,
  PurchaseInput,
  PurchaseListParams,
  PurchaseSummary,
} from '@/types/purchase'
import { apiRequest } from './apiClient'

export function listPurchases(params: PurchaseListParams): Promise<Page<PurchaseSummary>> {
  return apiRequest<Page<PurchaseSummary>>('/purchases', { query: { ...params } })
}

export function getPurchase(id: number): Promise<Purchase> {
  return apiRequest<Purchase>(`/purchases/${id}`)
}

export function createPurchase(data: PurchaseInput): Promise<Purchase> {
  return apiRequest<Purchase>('/purchases', { method: 'POST', body: data })
}

export function updatePurchase(id: number, data: PurchaseInput): Promise<Purchase> {
  return apiRequest<Purchase>(`/purchases/${id}`, { method: 'PUT', body: data })
}

export async function deletePurchase(id: number): Promise<void> {
  await apiRequest<null>(`/purchases/${id}`, { method: 'DELETE' })
}

export function confirmPurchase(id: number): Promise<Purchase> {
  return apiRequest<Purchase>(`/purchases/${id}/confirm`, { method: 'POST' })
}

export function cancelPurchase(id: number, reason: string): Promise<Purchase> {
  return apiRequest<Purchase>(`/purchases/${id}/cancel`, { method: 'POST', body: { reason } })
}

export function getCostHistory(
  productId: number,
  params: { page: number; size: number },
): Promise<CostHistoryPage> {
  return apiRequest<CostHistoryPage>(`/products/${productId}/cost-history`, {
    query: { ...params },
  })
}
