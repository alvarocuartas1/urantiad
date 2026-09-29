import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createCustomer, listCustomers, updateCustomer } from '@/services/customers'
import type { CustomerCreate, CustomerListParams, CustomerUpdate } from '@/types/customer'

const customersKey = ['customers'] as const

export function useCustomers(params: CustomerListParams) {
  return useQuery({
    queryKey: [...customersKey, params],
    queryFn: () => listCustomers(params),
    placeholderData: keepPreviousData,
  })
}

export function useCreateCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CustomerCreate) => createCustomer(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customersKey }),
  })
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: CustomerUpdate }) => updateCustomer(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customersKey }),
  })
}
