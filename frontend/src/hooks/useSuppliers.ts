import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addSupplierProduct,
  createSupplier,
  listProductSuppliers,
  listSupplierProducts,
  listSuppliers,
  removeSupplierProduct,
  updateSupplier,
  updateSupplierProduct,
} from '@/services/suppliers'
import type {
  SupplierCreate,
  SupplierListParams,
  SupplierProductCreate,
  SupplierProductListParams,
  SupplierProductUpdate,
  SupplierUpdate,
} from '@/types/supplier'

const suppliersKey = ['suppliers'] as const
// Links are listed from both sides: supplier → products and product → suppliers.
const supplierProductsKey = ['supplier-products'] as const

export function useSuppliers(params: SupplierListParams) {
  return useQuery({
    queryKey: [...suppliersKey, params],
    queryFn: () => listSuppliers(params),
    placeholderData: keepPreviousData,
  })
}

/** Supplier changes (name, status) are also shown inside the links. */
function useInvalidateSuppliers() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: suppliersKey }),
      queryClient.invalidateQueries({ queryKey: supplierProductsKey }),
    ])
}

export function useCreateSupplier() {
  const invalidate = useInvalidateSuppliers()
  return useMutation({
    mutationFn: (data: SupplierCreate) => createSupplier(data),
    onSuccess: invalidate,
  })
}

export function useUpdateSupplier() {
  const invalidate = useInvalidateSuppliers()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: SupplierUpdate }) => updateSupplier(id, data),
    onSuccess: invalidate,
  })
}

export function useSupplierProducts(supplierId: number, params: SupplierProductListParams) {
  return useQuery({
    queryKey: [...supplierProductsKey, 'supplier', supplierId, params],
    queryFn: () => listSupplierProducts(supplierId, params),
    placeholderData: keepPreviousData,
  })
}

export function useProductSuppliers(productId: number) {
  return useQuery({
    queryKey: [...supplierProductsKey, 'product', productId],
    queryFn: () => listProductSuppliers(productId),
  })
}

function useInvalidateSupplierProducts() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: supplierProductsKey })
}

export function useAddSupplierProduct(supplierId: number) {
  const invalidate = useInvalidateSupplierProducts()
  return useMutation({
    mutationFn: (data: SupplierProductCreate) => addSupplierProduct(supplierId, data),
    onSuccess: invalidate,
  })
}

export function useUpdateSupplierProduct(supplierId: number) {
  const invalidate = useInvalidateSupplierProducts()
  return useMutation({
    mutationFn: ({ productId, data }: { productId: number; data: SupplierProductUpdate }) =>
      updateSupplierProduct(supplierId, productId, data),
    onSuccess: invalidate,
  })
}

export function useRemoveSupplierProduct(supplierId: number) {
  const invalidate = useInvalidateSupplierProducts()
  return useMutation({
    mutationFn: (productId: number) => removeSupplierProduct(supplierId, productId),
    onSuccess: invalidate,
  })
}
