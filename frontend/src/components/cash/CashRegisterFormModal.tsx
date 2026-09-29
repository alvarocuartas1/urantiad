import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'
import { Alert } from '@/components/ui/Alert'
import { FormActions } from '@/components/ui/FormActions'
import { TextField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { useCreateCashRegister, useUpdateCashRegister } from '@/hooks/useCash'
import type { CashRegister } from '@/types/cash'
import { cashRegisterSchema } from '@/utils/cash'
import { getErrorMessage, isApiErrorCode } from '@/utils/errors'

type CashRegisterInput = z.input<typeof cashRegisterSchema>
type CashRegisterValues = z.output<typeof cashRegisterSchema>

interface CashRegisterFormModalProps {
  /** Register to edit; omit to create a new one. */
  register?: CashRegister
  onClose: () => void
}

export function CashRegisterFormModal({
  register: cashRegister,
  onClose,
}: CashRegisterFormModalProps) {
  const createMutation = useCreateCashRegister()
  const updateMutation = useUpdateCashRegister()
  const mutation = cashRegister ? updateMutation : createMutation
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CashRegisterInput, unknown, CashRegisterValues>({
    resolver: zodResolver(cashRegisterSchema),
    defaultValues: {
      name: cashRegister?.name ?? '',
      description: cashRegister?.description ?? '',
      is_active: cashRegister?.is_active ?? true,
    },
  })

  const onError = (error: Error) => {
    if (isApiErrorCode(error, 'CASH_REGISTER_NAME_TAKEN')) {
      setError('name', { message: getErrorMessage(error) })
    }
    if (isApiErrorCode(error, 'CASH_REGISTER_OPEN')) {
      setError('is_active', { message: getErrorMessage(error) })
    }
  }

  const onSubmit = handleSubmit(({ is_active, ...values }) => {
    if (cashRegister) {
      updateMutation.mutate(
        { id: cashRegister.id, data: { ...values, is_active } },
        { onSuccess: onClose, onError },
      )
    } else {
      createMutation.mutate(values, { onSuccess: onClose, onError })
    }
  })

  const hasFieldError = Boolean(errors.name ?? errors.is_active)

  return (
    <Modal title={cashRegister ? 'Editar caja' : 'Nueva caja'} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {mutation.isError && !hasFieldError && <Alert>{getErrorMessage(mutation.error)}</Alert>}
        <TextField
          label="Nombre"
          autoComplete="off"
          error={errors.name?.message}
          {...register('name')}
        />
        <TextField
          label="Descripción (opcional)"
          autoComplete="off"
          error={errors.description?.message}
          {...register('description')}
        />
        {cashRegister && (
          <div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="size-4 rounded border-slate-300"
                {...register('is_active')}
              />
              Caja activa
            </label>
            {errors.is_active && (
              <p className="mt-1 text-sm text-red-700">{errors.is_active.message}</p>
            )}
          </div>
        )}
        <FormActions onClose={onClose} loading={mutation.isPending} />
      </form>
    </Modal>
  )
}
