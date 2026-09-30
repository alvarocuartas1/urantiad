import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Alert } from '@/components/ui/Alert'
import { FormActions } from '@/components/ui/FormActions'
import { TextField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { useCloseCashSession } from '@/hooks/useCash'
import type { CashSession } from '@/types/cash'
import {
  buildCloseSessionSchema,
  cashDifference,
  type CloseSessionInput,
  type CloseSessionValues,
} from '@/utils/cash'
import { getErrorMessage } from '@/utils/errors'
import { formatCurrency } from '@/utils/format'
import { CashDifferenceBadge } from './CashBadges'
import { CashSalesByMethod } from './CashSalesByMethod'

interface CloseSessionModalProps {
  session: CashSession
  onClose: () => void
  onClosed: (session: CashSession) => void
}

/** Cash count and closing: the counted cash is compared with the expected cash as it is typed. */
export function CloseSessionModal({ session, onClose, onClosed }: CloseSessionModalProps) {
  const mutation = useCloseCashSession(session.id)
  const { summary } = session
  const expectedCash = summary.expected_cash
  const schema = useMemo(() => buildCloseSessionSchema(expectedCash), [expectedCash])
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CloseSessionInput, unknown, CloseSessionValues>({
    resolver: zodResolver(schema),
    defaultValues: { counted_cash: '', closing_notes: '' },
  })
  const counted = useWatch({ control, name: 'counted_cash' })
  const difference = cashDifference(counted, expectedCash)

  const onSubmit = handleSubmit((values) => {
    // The expected cash seen here goes along: if it changed, the server rejects the closing
    // and the cash queries reload with the new figure. `mutateAsync` because closing the
    // current session unmounts this modal, and `mutate` skips its callbacks once unmounted.
    mutation
      .mutateAsync({ ...values, expected_cash: expectedCash })
      .then(onClosed)
      .catch(() => {
        // Shown from `mutation.error`.
      })
  })

  const breakdown = [
    { label: 'Dinero inicial', value: summary.opening_amount, sign: '' },
    { label: 'Ventas en efectivo', value: summary.total_cash_sales, sign: '+' },
    { label: 'Ingresos', value: summary.total_income, sign: '+' },
    { label: 'Retiros', value: summary.total_withdrawals, sign: '−' },
    { label: 'Anulaciones en efectivo', value: summary.total_cash_cancellations, sign: '−' },
  ]

  return (
    <Modal title={`Cerrar ${session.cash_register.name}`} size="lg" onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {mutation.isError && <Alert>{getErrorMessage(mutation.error)}</Alert>}

        <dl className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
          {breakdown.map(({ label, value, sign }) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="text-slate-600">
                {sign && <span aria-hidden="true">{sign} </span>}
                {label}
              </dt>
              <dd className="text-slate-900 tabular-nums">{formatCurrency(value)}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 text-base font-semibold">
            <dt className="text-slate-900">Efectivo esperado</dt>
            <dd className="text-slate-900 tabular-nums">{formatCurrency(expectedCash)}</dd>
          </div>
        </dl>

        <CashSalesByMethod sessionId={session.id} />

        <div className="grid items-start gap-4 sm:grid-cols-2">
          <TextField
            label="Efectivo contado"
            hint="Billetes y monedas que hay en la caja."
            inputMode="decimal"
            autoComplete="off"
            error={errors.counted_cash?.message}
            {...register('counted_cash')}
          />
          <div aria-live="polite" className="sm:pt-6">
            {difference !== null && <CashDifferenceBadge difference={difference} size="md" />}
          </div>
        </div>
        <TextField
          label="Observaciones"
          hint="Obligatorias si hay sobrante o faltante."
          autoComplete="off"
          error={errors.closing_notes?.message}
          {...register('closing_notes')}
        />
        <p className="text-sm text-slate-600">
          El cierre es definitivo: después no se pueden registrar ventas ni movimientos en esta
          apertura.
        </p>
        <FormActions onClose={onClose} loading={mutation.isPending} submitLabel="Cerrar caja" />
      </form>
    </Modal>
  )
}
