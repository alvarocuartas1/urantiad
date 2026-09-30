import type { Page } from '@/types/api'
import type { PaymentMethod, Sale, SaleCreate, SaleListParams, SaleSummary } from '@/types/sale'
import { apiRequest } from './apiClient'

export function listPaymentMethods(): Promise<PaymentMethod[]> {
  return apiRequest<PaymentMethod[]>('/payment-methods')
}

export function listSales(params: SaleListParams): Promise<Page<SaleSummary>> {
  return apiRequest<Page<SaleSummary>>('/sales', { query: { ...params } })
}

export function getSale(id: number): Promise<Sale> {
  return apiRequest<Sale>(`/sales/${id}`)
}

export function createSale(data: SaleCreate): Promise<Sale> {
  return apiRequest<Sale>('/sales', { method: 'POST', body: data })
}

export function cancelSale(id: number, reason: string): Promise<Sale> {
  return apiRequest<Sale>(`/sales/${id}/cancel`, { method: 'POST', body: { reason } })
}
