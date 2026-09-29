import { zodResolver } from '@hookform/resolvers/zod'
import { LockOpen } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { SelectField, TextField } from '@/components/ui/FormField'
import { useCashRegisters, useOpenCashSession } from '@/hooks/useCash'
import { getErrorMessage, isApiErrorCode } from '@/utils/errors'
import { openSessionSchema, type OpenSessionInput, type OpenSessionValues } from '@/utils/cash'

/** API errors shown next to the register field. */
const REGISTER_ERRORS = ['CASH_REGISTER_BUSY', 'CASH_REGISTER_INACTIVE']

// A business has a handful of registers; one page is enough.
const REGISTERS_PARAMS = { page: 1, size: 100, is_active: true }

export function OpenSessionForm() {
  const registers = useCashRegisters(REGISTERS_PARAMS)
  const mutation = useOpenCashSession()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<OpenSessionInput, unknown, OpenSessionValues>({
    resolver: zodResolver(openSessionSchema),
    defaultValues: { cash_register_id: '', opening_amount: '', opening_notes: '' },
  })

  const onSubmit = handleSubmit((values) => {
    mutation.mutate(values, {
      onError: (error) => {
        if (REGISTER_ERRORS.some((code) => isApiErrorCode(error, code))) {
          setError('cash_register_id', { message: getErrorMessage(error) })
        }
      },
    })
  })

  const hasFieldError = REGISTER_ERRORS.some((code) => isApiErrorCode(mutation.error, code))
  const items = registers.data?.items ?? []

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="max-w-xl space-y-4 rounded-xl border border-slate-200 bg-white p-5"
    >
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Abrir caja</h2>
        <p className="text-sm text-slate-600">
          No tiene una caja abierta. Registre el dinero inicial para empezar a operar.
        </p>
      </div>
      {mutation.isError && !hasFieldError && <Alert>{getErrorMessage(mutation.error)}</Alert>}
      {registers.isError && <Alert>{getErrorMessage(registers.error)}</Alert>}

      <SelectField
        label="Caja"
        autoFocus
        error={errors.cash_register_id?.message}
        {...register('cash_register_id')}
      >
        <option value="">{registers.isPending ? 'Cargando cajas…' : 'Seleccione una caja'}</option>
        {items.map((item) => (
          <option key={item.id} value={item.id} disabled={item.open_session !== null}>
            {item.open_session
              ? `${item.name} (abierta por ${item.open_session.user.full_name})`
              : item.name}
          </option>
        ))}
      </SelectField>
      <TextField
        label="Dinero inicial"
        hint="Efectivo con el que empieza la caja (base)."
        inputMode="decimal"
        autoComplete="off"
        error={errors.opening_amount?.message}
        {...register('opening_amount')}
      />
      <TextField
        label="Observaciones (opcional)"
        autoComplete="off"
        error={errors.opening_notes?.message}
        {...register('opening_notes')}
      />
      <div className="flex justify-end">
        <Button type="submit" loading={mutation.isPending}>
          <LockOpen aria-hidden="true" className="size-4" />
          Abrir caja
        </Button>
      </div>
    </form>
  )
}
