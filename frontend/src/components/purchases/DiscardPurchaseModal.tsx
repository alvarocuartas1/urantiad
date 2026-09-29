import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useDeletePurchase } from '@/hooks/usePurchases'
import { getErrorMessage } from '@/utils/errors'

interface DiscardPurchaseModalProps {
  purchaseId: number
  onDiscarded: () => void
  onClose: () => void
}

export function DiscardPurchaseModal({
  purchaseId,
  onDiscarded,
  onClose,
}: DiscardPurchaseModalProps) {
  const mutation = useDeletePurchase()

  return (
    <Modal title="Descartar borrador" onClose={onClose}>
      <div className="space-y-4">
        {mutation.isError && <Alert>{getErrorMessage(mutation.error)}</Alert>}
        <p className="text-sm text-slate-700">
          El borrador se eliminará. No afectó el inventario ni consumió consecutivo.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            loading={mutation.isPending}
            onClick={() => mutation.mutate(purchaseId, { onSuccess: onDiscarded })}
          >
            Descartar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
