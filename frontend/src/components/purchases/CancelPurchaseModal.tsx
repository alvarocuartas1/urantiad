import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Alert } from '@/components/ui/Alert'
import { FormActions } from '@/components/ui/FormActions'
import { TextField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { useCancelPurchase } from '@/hooks/usePurchases'
import type { Purchase } from '@/types/purchase'
import { getErrorMessage } from '@/utils/errors'

/** Mirrors `PurchaseCancel` in `app/schemas/purchase.py`. */
const cancelSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, 'Indique el motivo (mínimo 3 caracteres).')
    .max(255, 'El motivo no puede superar 255 caracteres.'),
})

type CancelValues = z.infer<typeof cancelSchema>

interface CancelPurchaseModalProps {
  purchase: Purchase
  onClose: () => void
}

export function CancelPurchaseModal({ purchase, onClose }: CancelPurchaseModalProps) {
  const mutation = useCancelPurchase()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CancelValues>({ resolver: zodResolver(cancelSchema), defaultValues: { reason: '' } })

  const onSubmit = handleSubmit(({ reason }) =>
    mutation.mutate({ id: purchase.id, reason }, { onSuccess: onClose }),
  )

  return (
    <Modal title={`Anular ${purchase.number ?? 'compra'}`} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {mutation.isError && <Alert>{getErrorMessage(mutation.error)}</Alert>}
        <p className="text-sm text-slate-700">
          Se registrarán salidas de inventario por las cantidades compradas y el costo promedio se
          recalculará sin esta compra. Si las unidades ya se vendieron, no podrá anularse.
        </p>
        <TextField
          label="Motivo de la anulación"
          autoComplete="off"
          error={errors.reason?.message}
          {...register('reason')}
        />
        <FormActions onClose={onClose} loading={mutation.isPending} submitLabel="Anular compra" />
      </form>
    </Modal>
  )
}
