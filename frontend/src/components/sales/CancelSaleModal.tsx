import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Alert } from '@/components/ui/Alert'
import { FormActions } from '@/components/ui/FormActions'
import { TextField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { useCancelSale } from '@/hooks/useSales'
import type { Sale } from '@/types/sale'
import { fromCents, toCents } from '@/utils/decimal'
import { getErrorMessage } from '@/utils/errors'
import { formatCurrency } from '@/utils/format'

/** Mirrors `SaleCancel` in `app/schemas/sale.py`. */
const cancelSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, 'Indique el motivo (mínimo 3 caracteres).')
    .max(255, 'El motivo no puede superar 255 caracteres.'),
})

type CancelValues = z.infer<typeof cancelSchema>

interface CancelSaleModalProps {
  sale: Sale
  onClose: () => void
}

export function CancelSaleModal({ sale, onClose }: CancelSaleModalProps) {
  const mutation = useCancelSale()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CancelValues>({ resolver: zodResolver(cancelSchema), defaultValues: { reason: '' } })
  const cash = sale.payments
    .filter((payment) => payment.payment_method.is_cash)
    .reduce((sum, payment) => sum + toCents(payment.amount), 0n)

  const onSubmit = handleSubmit(({ reason }) =>
    mutation.mutate({ id: sale.id, reason }, { onSuccess: onClose }),
  )

  return (
    <Modal title={`Anular ${sale.number}`} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {mutation.isError && <Alert>{getErrorMessage(mutation.error)}</Alert>}
        <p className="text-sm text-slate-700">
          Los productos vuelven al inventario
          {cash > 0n &&
            ` y se retiran ${formatCurrency(fromCents(cash))} en efectivo de la caja de la venta (o de su caja abierta, si esa ya se cerró)`}
          . La venta queda registrada como anulada.
        </p>
        <TextField
          label="Motivo de la anulación"
          autoComplete="off"
          error={errors.reason?.message}
          {...register('reason')}
        />
        <FormActions onClose={onClose} loading={mutation.isPending} submitLabel="Anular venta" />
      </form>
    </Modal>
  )
}
