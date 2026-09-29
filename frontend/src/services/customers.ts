import type { Page } from '@/types/api'
import type { Customer, CustomerCreate, CustomerListParams, CustomerUpdate } from '@/types/customer'
import { apiRequest } from './apiClient'

export function listCustomers(params: CustomerListParams): Promise<Page<Customer>> {
  return apiRequest<Page<Customer>>('/customers', { query: { ...params } })
}

export function createCustomer(data: CustomerCreate): Promise<Customer> {
  return apiRequest<Customer>('/customers', { method: 'POST', body: data })
}

export function updateCustomer(id: number, data: CustomerUpdate): Promise<Customer> {
  return apiRequest<Customer>(`/customers/${id}`, { method: 'PATCH', body: data })
}
