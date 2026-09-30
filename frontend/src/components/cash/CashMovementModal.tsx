import { zodResolver } from '@hookform/resolvers/zod'
import { useId, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { Alert } from '@/components/ui/Alert'
import { FormActions } from '@/components/ui/FormActions'
import { TextField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { useCreateCashMovement } from '@/hooks/useCash'
import type { CashSession, ManualCashMovementType } from '@/types/cash'
import {
  CASH_MOVEMENT_CONCEPTS,
  buildCashMovementSchema,
  type CashMovementInput,
  type CashMovementValues,
} from '@/utils/cash'
import { getErrorMessage, isApiErrorCode } from '@/utils/errors'
import { formatCurrency } from '@/utils/format'

const TITLES: Record<ManualCashMovementType, string> = {
  income: 'Registrar ingreso',
  withdrawal: 'Registrar retiro',
}

interface CashMovementModalProps {
  session: CashSession
  type: ManualCashMovementType
  onClose: () => void
}

export function CashMovementModal({ session, type, onClose }: CashMovementModalProps) {
  const mutation = useCreateCashMovement(session.id)
  const conceptsId = useId()
  const expectedCash = session.summary.expected_cash
  const schema = useMemo(() => buildCashMovementSchema(type, expectedCash), [type, expectedCash])
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CashMovementInput, unknown, CashMovementValues>({
    resolver: zodResolver(schema),
    defaultValues: { amount: '', concept: '' },
  })

  const onSubmit = handleSubmit((values) => {
    mutation.mutate(
      { movement_type: type, ...values },
      {
        onSuccess: onClose,
        onError: (error) => {
          if (isApiErrorCode(error, 'INSUFFICIENT_CASH')) {
            setError('amount', { message: getErrorMessage(error) })
          }
        },
      },
    )
  })

  const hasFieldError = isApiErrorCode(mutation.error, 'INSUFFICIENT_CASH')

  return (
    <Modal title={TITLES[type]} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {mutation.isError && !hasFieldError && <Alert>{getErrorMessage(mutation.error)}</Alert>}
        <p className="text-sm text-slate-700">
          Efectivo en caja:{' '}
          <span className="font-medium text-slate-900">{formatCurrency(expectedCash)}</span>
        </p>
        <TextField
          label="Valor"
          inputMode="decimal"
          autoComplete="off"
          error={errors.amount?.message}
          {...register('amount')}
        />
        <div>
          <TextField
            label="Concepto"
            list={conceptsId}
            autoComplete="off"
            error={errors.concept?.message}
            {...register('concept')}
          />
          <datalist id={conceptsId}>
            {CASH_MOVEMENT_CONCEPTS[type].map((concept) => (
              <option key={concept} value={concept} />
            ))}
          </datalist>
        </div>
        <FormActions onClose={onClose} loading={mutation.isPending} submitLabel={TITLES[type]} />
      </form>
    </Modal>
  )
}
