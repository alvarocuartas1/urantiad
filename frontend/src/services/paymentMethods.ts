import type {
  PaymentMethodCreate,
  PaymentMethodDetail,
  PaymentMethodUpdate,
} from '@/types/paymentMethod'
import { apiRequest } from './apiClient'

/** Every payment method, inactive ones included (requires `payment_methods.manage`). */
export function listAllPaymentMethods(): Promise<PaymentMethodDetail[]> {
  return apiRequest('/payment-methods', { query: { include_inactive: true } })
}

export function createPaymentMethod(data: PaymentMethodCreate): Promise<PaymentMethodDetail> {
  return apiRequest('/payment-methods', { method: 'POST', body: data })
}

export function updatePaymentMethod(
  id: number,
  data: PaymentMethodUpdate,
): Promise<PaymentMethodDetail> {
  return apiRequest(`/payment-methods/${id}`, { method: 'PATCH', body: data })
}
