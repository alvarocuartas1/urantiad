import { zodResolver } from '@hookform/resolvers/zod'
import { useId } from 'react'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'
import { Alert } from '@/components/ui/Alert'
import { FormActions } from '@/components/ui/FormActions'
import { TextField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { useCreatePaymentMethod, useUpdatePaymentMethod } from '@/hooks/usePaymentMethods'
import type { PaymentMethodDetail } from '@/types/paymentMethod'
import { getErrorMessage, isApiErrorCode } from '@/utils/errors'
import { paymentMethodSchema } from '@/utils/paymentMethod'

type PaymentMethodInput = z.input<typeof paymentMethodSchema>
type PaymentMethodValues = z.output<typeof paymentMethodSchema>

interface PaymentMethodFormModalProps {
  /** Method to edit; omit to create a new one. */
  method?: PaymentMethodDetail
  /** Order proposed for a new method (after the last one). */
  defaultSortOrder: number
  onClose: () => void
}

export function PaymentMethodFormModal({
  method,
  defaultSortOrder,
  onClose,
}: PaymentMethodFormModalProps) {
  const activeHintId = useId()
  const createMutation = useCreatePaymentMethod()
  const updateMutation = useUpdatePaymentMethod()
  const mutation = method ? updateMutation : createMutation
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<PaymentMethodInput, unknown, PaymentMethodValues>({
    resolver: zodResolver(paymentMethodSchema),
    defaultValues: {
      name: method?.name ?? '',
      sort_order: String(method?.sort_order ?? defaultSortOrder),
      is_active: method?.is_active ?? true,
    },
  })

  const onError = (error: Error) => {
    if (isApiErrorCode(error, 'PAYMENT_METHOD_NAME_TAKEN')) {
      setError('name', { message: getErrorMessage(error) })
    }
  }

  const onSubmit = handleSubmit(({ is_active, ...values }) => {
    if (method) {
      updateMutation.mutate(
        // The cash method is always active: never send it (the API rejects deactivating it).
        { id: method.id, data: method.is_cash ? values : { ...values, is_active } },
        { onSuccess: onClose, onError },
      )
    } else {
      createMutation.mutate(values, { onSuccess: onClose, onError })
    }
  })

  return (
    <Modal title={method ? 'Editar método de pago' : 'Nuevo método de pago'} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {mutation.isError && !errors.name && <Alert>{getErrorMessage(mutation.error)}</Alert>}
        <TextField
          label="Nombre"
          autoComplete="off"
          error={errors.name?.message}
          {...register('name')}
        />
        <TextField
          label="Orden en el POS"
          inputMode="numeric"
          autoComplete="off"
          hint="Los de menor número aparecen primero."
          error={errors.sort_order?.message}
          {...register('sort_order')}
        />
        {method && (
          <div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="size-4 rounded border-slate-300"
                disabled={method.is_cash}
                aria-describedby={method.is_cash ? activeHintId : undefined}
                {...register('is_active')}
              />
              Método activo
            </label>
            {method.is_cash && (
              <p id={activeHintId} className="mt-1 text-xs text-slate-500">
                El efectivo no se puede desactivar: es el método que mueve la caja.
              </p>
            )}
          </div>
        )}
        <FormActions onClose={onClose} loading={mutation.isPending} />
      </form>
    </Modal>
  )
}
