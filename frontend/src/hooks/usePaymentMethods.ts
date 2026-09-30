import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createPaymentMethod,
  listAllPaymentMethods,
  updatePaymentMethod,
} from '@/services/paymentMethods'
import type { PaymentMethodCreate, PaymentMethodUpdate } from '@/types/paymentMethod'

// Shares the prefix of the POS list (`usePaymentMethods`), so a change reloads both.
const paymentMethodsKey = ['payment-methods'] as const

export function useAllPaymentMethods() {
  return useQuery({
    queryKey: [...paymentMethodsKey, 'all'],
    queryFn: listAllPaymentMethods,
  })
}

export function useCreatePaymentMethod() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: PaymentMethodCreate) => createPaymentMethod(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: paymentMethodsKey }),
  })
}

export function useUpdatePaymentMethod() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: PaymentMethodUpdate }) =>
      updatePaymentMethod(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: paymentMethodsKey }),
  })
}
