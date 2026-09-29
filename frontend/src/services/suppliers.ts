import type { Page } from '@/types/api'
import type {
  Supplier,
  SupplierCreate,
  SupplierListParams,
  SupplierProduct,
  SupplierProductCreate,
  SupplierProductListParams,
  SupplierProductUpdate,
  SupplierUpdate,
} from '@/types/supplier'
import { apiRequest } from './apiClient'

export function listSuppliers(params: SupplierListParams): Promise<Page<Supplier>> {
  return apiRequest<Page<Supplier>>('/suppliers', { query: { ...params } })
}

export function createSupplier(data: SupplierCreate): Promise<Supplier> {
  return apiRequest<Supplier>('/suppliers', { method: 'POST', body: data })
}

export function updateSupplier(id: number, data: SupplierUpdate): Promise<Supplier> {
  return apiRequest<Supplier>(`/suppliers/${id}`, { method: 'PATCH', body: data })
}

export function listSupplierProducts(
  supplierId: number,
  params: SupplierProductListParams,
): Promise<Page<SupplierProduct>> {
  return apiRequest<Page<SupplierProduct>>(`/suppliers/${supplierId}/products`, {
    query: { ...params },
  })
}

export function addSupplierProduct(
  supplierId: number,
  data: SupplierProductCreate,
): Promise<SupplierProduct> {
  return apiRequest<SupplierProduct>(`/suppliers/${supplierId}/products`, {
    method: 'POST',
    body: data,
  })
}

export function updateSupplierProduct(
  supplierId: number,
  productId: number,
  data: SupplierProductUpdate,
): Promise<SupplierProduct> {
  return apiRequest<SupplierProduct>(`/suppliers/${supplierId}/products/${productId}`, {
    method: 'PATCH',
    body: data,
  })
}

export async function removeSupplierProduct(supplierId: number, productId: number): Promise<void> {
  await apiRequest<null>(`/suppliers/${supplierId}/products/${productId}`, { method: 'DELETE' })
}

export function listProductSuppliers(productId: number): Promise<SupplierProduct[]> {
  return apiRequest<SupplierProduct[]>(`/products/${productId}/suppliers`)
}
