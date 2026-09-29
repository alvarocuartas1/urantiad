import { ArrowUp } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useConfirmPurchase } from '@/hooks/usePurchases'
import type { Purchase } from '@/types/purchase'
import { UNIT_ABBREVIATIONS } from '@/utils/catalog'
import { getErrorMessage } from '@/utils/errors'
import { formatCurrency, formatQuantity } from '@/utils/format'

interface ConfirmPurchaseModalProps {
  /** The saved draft to confirm. */
  purchase: Purchase
  onConfirmed: (purchase: Purchase) => void
  onClose: () => void
}

/** Last check before a purchase moves inventory: what enters and for how much. */
export function ConfirmPurchaseModal({
  purchase,
  onConfirmed,
  onClose,
}: ConfirmPurchaseModalProps) {
  const mutation = useConfirmPurchase()

  return (
    <Modal title="Confirmar compra" onClose={onClose} size="lg">
      <div className="space-y-4">
        {mutation.isError && <Alert>{getErrorMessage(mutation.error)}</Alert>}
        <p className="text-sm text-slate-700">
          Se asignará el consecutivo y entrarán al inventario estos productos, al costo neto de cada
          línea. Después solo podrá anularse.
        </p>
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {purchase.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="font-medium text-slate-900">{item.product.name}</span>
              <span className="inline-flex items-center gap-1 whitespace-nowrap text-emerald-800">
                <ArrowUp aria-label="entran" className="size-4" />
                {formatQuantity(item.quantity)} {UNIT_ABBREVIATIONS[item.product.unit_of_measure]}
                <span className="text-slate-600">· {formatCurrency(item.net_unit_cost)} c/u</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-right text-base font-semibold text-slate-900">
          Total {formatCurrency(purchase.total)}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Volver
          </Button>
          <Button
            loading={mutation.isPending}
            onClick={() => mutation.mutate(purchase.id, { onSuccess: onConfirmed })}
          >
            Confirmar compra
          </Button>
        </div>
      </div>
    </Modal>
  )
}
