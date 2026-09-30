import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import type { PaymentMethod } from '@/types/sale'
import { fromCents, trimDecimal } from '@/utils/decimal'
import { formatCurrency } from '@/utils/format'
import {
  buildPaymentsSchema,
  paymentProgress,
  type PaymentsFormInput,
  type PaymentsFormValues,
} from '@/utils/sale'

const INPUT_CLASS =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums focus:outline-2 focus:outline-slate-900 aria-invalid:border-red-500'

interface PaymentModalProps {
  total: string
  methods: PaymentMethod[]
  loading: boolean
  /** Error of the last attempt (already translated), shown above the form. */
  error: string | null
  onSubmit: (payments: PaymentsFormValues['payments']) => void
  onClose: () => void
}

/**
 * Charge the sale: cash by default for the whole total (the cashier types what the customer
 * hands over and sees the change), or several methods that must add up to the total.
 */
export function PaymentModal({
  total,
  methods,
  loading,
  error,
  onSubmit,
  onClose,
}: PaymentModalProps) {
  const cash = methods.find((method) => method.is_cash)
  const cashId = cash ? String(cash.id) : ''
  const schema = useMemo(() => buildPaymentsSchema(total, methods), [total, methods])
  const {
    control,
    register,
    handleSubmit,
    setFocus,
    formState: { errors },
  } = useForm<PaymentsFormInput, unknown, PaymentsFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      payments: [
        {
          payment_method_id: cashId || String(methods[0]?.id ?? ''),
          amount: trimDecimal(total),
          amount_tendered: '',
          reference: '',
        },
      ],
    },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'payments' })
  const payments = useWatch({ control, name: 'payments' })
  const progress = paymentProgress(payments, total, cashId)

  useEffect(() => {
    // After the modal's own focus (child effects run first): the cash handed over.
    setFocus(cashId ? 'payments.0.amount_tendered' : 'payments.0.amount')
  }, [setFocus, cashId])

  const addPayment = () => {
    const used = new Set(payments.map((payment) => payment.payment_method_id))
    const next = methods.find((method) => !used.has(String(method.id)))
    if (!next) return
    append({
      payment_method_id: String(next.id),
      amount: progress.remaining > 0n ? trimDecimal(fromCents(progress.remaining)) : '',
      amount_tendered: '',
      reference: '',
    })
  }

  const listError = errors.payments?.message ?? errors.payments?.root?.message

  return (
    <Modal title={`Cobrar ${formatCurrency(total)}`} onClose={onClose} size="lg">
      <form
        onSubmit={handleSubmit((values) => onSubmit(values.payments))}
        noValidate
        className="space-y-4"
      >
        {error && <Alert>{error}</Alert>}

        <ul className="space-y-3">
          {fields.map((field, index) => {
            const isCash = payments[index]?.payment_method_id === cashId
            const lineErrors = errors.payments?.[index]
            const methodId = `payment-${field.id}-method`
            const amountId = `payment-${field.id}-amount`
            const extraId = `payment-${field.id}-extra`
            return (
              <li
                key={field.id}
                className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-start"
              >
                <div>
                  <label
                    htmlFor={methodId}
                    className="mb-1 block text-xs font-medium text-slate-700"
                  >
                    Método
                  </label>
                  <select
                    id={methodId}
                    className={INPUT_CLASS}
                    {...register(`payments.${index}.payment_method_id`)}
                  >
                    {methods.map((method) => (
                      <option key={method.id} value={method.id}>
                        {method.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor={amountId}
                    className="mb-1 block text-xs font-medium text-slate-700"
                  >
                    Valor
                  </label>
                  <input
                    id={amountId}
                    inputMode="decimal"
                    autoComplete="off"
                    aria-invalid={lineErrors?.amount ? true : undefined}
                    className={INPUT_CLASS}
                    {...register(`payments.${index}.amount`)}
                  />
                  {lineErrors?.amount && (
                    <p className="mt-1 text-xs text-red-700">{lineErrors.amount.message}</p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor={extraId}
                    className="mb-1 block text-xs font-medium text-slate-700"
                  >
                    {isCash ? 'Recibido' : 'Referencia (opcional)'}
                  </label>
                  <input
                    id={extraId}
                    inputMode={isCash ? 'decimal' : 'text'}
                    autoComplete="off"
                    placeholder={isCash ? 'Exacto' : ''}
                    aria-invalid={
                      (isCash ? lineErrors?.amount_tendered : lineErrors?.reference)
                        ? true
                        : undefined
                    }
                    className={INPUT_CLASS}
                    {...register(
                      isCash ? `payments.${index}.amount_tendered` : `payments.${index}.reference`,
                    )}
                  />
                  {isCash && lineErrors?.amount_tendered && (
                    <p className="mt-1 text-xs text-red-700">
                      {lineErrors.amount_tendered.message}
                    </p>
                  )}
                  {!isCash && lineErrors?.reference && (
                    <p className="mt-1 text-xs text-red-700">{lineErrors.reference.message}</p>
                  )}
                </div>
                <div className="sm:pt-6">
                  {fields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      aria-label="Quitar pago"
                      className="rounded-md p-2 text-slate-500 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        {fields.length < methods.length && (
          <Button variant="ghost" onClick={addPayment}>
            <Plus aria-hidden="true" className="size-4" />
            Agregar otro método de pago
          </Button>
        )}

        {listError && <Alert>{listError}</Alert>}

        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">Pagado</dt>
            <dd className="text-base font-medium text-slate-900 tabular-nums">
              {formatCurrency(fromCents(progress.paid))}
            </dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">
              {progress.remaining >= 0n ? 'Falta por pagar' : 'Pagos de más'}
            </dt>
            <dd className="text-base font-medium text-slate-900 tabular-nums">
              {formatCurrency(
                fromCents(progress.remaining >= 0n ? progress.remaining : -progress.remaining),
              )}
            </dd>
          </div>
          <div className="rounded-lg bg-emerald-700 p-3 text-white">
            <dt className="text-xs text-emerald-100">Cambio</dt>
            <dd className="text-xl font-bold tabular-nums">
              {formatCurrency(fromCents(progress.change))}
            </dd>
          </div>
        </dl>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={loading}>
            Confirmar venta
          </Button>
        </div>
      </form>
    </Modal>
  )
}
