import type { Page } from '@/types/api'
import type { Category, CategoryCreate, CategoryListParams, CategoryUpdate } from '@/types/catalog'
import { apiRequest } from './apiClient'

export function listCategories(params: CategoryListParams): Promise<Page<Category>> {
  return apiRequest<Page<Category>>('/categories', { query: { ...params } })
}

export function createCategory(data: CategoryCreate): Promise<Category> {
  return apiRequest<Category>('/categories', { method: 'POST', body: data })
}

export function updateCategory(id: number, data: CategoryUpdate): Promise<Category> {
  return apiRequest<Category>(`/categories/${id}`, { method: 'PATCH', body: data })
}

export async function deleteCategory(id: number): Promise<void> {
  await apiRequest<null>(`/categories/${id}`, { method: 'DELETE' })
}
