import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from '@/services/categories'
import type { CategoryCreate, CategoryListParams, CategoryUpdate } from '@/types/catalog'

const categoriesKey = ['categories'] as const

export function useCategories(params: CategoryListParams) {
  return useQuery({
    queryKey: [...categoriesKey, params],
    queryFn: () => listCategories(params),
    placeholderData: keepPreviousData,
  })
}

/** Active categories for selectors (the API page limit is 100). */
export function useActiveCategories() {
  const query = useCategories({ page: 1, size: 100, is_active: true })
  return { ...query, categories: query.data?.items ?? [] }
}

/** Category changes also affect how products are displayed. */
function useInvalidateCatalog() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: categoriesKey }),
      queryClient.invalidateQueries({ queryKey: ['products'] }),
    ])
}

export function useCreateCategory() {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: (data: CategoryCreate) => createCategory(data),
    onSuccess: invalidate,
  })
}

export function useUpdateCategory() {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: CategoryUpdate }) => updateCategory(id, data),
    onSuccess: invalidate,
  })
}

export function useDeleteCategory() {
  const invalidate = useInvalidateCatalog()
  return useMutation({ mutationFn: (id: number) => deleteCategory(id), onSuccess: invalidate })
}
