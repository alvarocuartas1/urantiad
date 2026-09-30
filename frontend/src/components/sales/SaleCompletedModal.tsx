import { CircleCheck } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import type { Sale } from '@/types/sale'
import { formatCurrency } from '@/utils/format'

interface SaleCompletedModalProps {
  sale: Sale
  /** Start the next sale (Enter, or closing the modal). */
  onNext: () => void
}

/** Confirmation of a registered sale, with the change to give back in large type. */
export function SaleCompletedModal({ sale, onNext }: SaleCompletedModalProps) {
  const nextRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // In an effect, not `autoFocus`: the payment modal closing in the same render gives the
    // focus back to the scanner in its cleanup, which runs after `autoFocus`.
    nextRef.current?.focus()
  }, [])

  return (
    <Modal title={`Venta ${sale.number} registrada`} onClose={onNext}>
      <div className="space-y-4">
        <p className="inline-flex items-center gap-2 text-sm font-medium text-emerald-800">
          <CircleCheck aria-hidden="true" className="size-5" />
          Venta completada por {formatCurrency(sale.total)}
        </p>
        <div className="rounded-xl bg-emerald-700 p-4 text-center text-white">
          <p className="text-sm text-emerald-100">Cambio a devolver</p>
          <p className="text-4xl font-bold tabular-nums">{formatCurrency(sale.change_amount)}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Link
            to={`/ventas/${sale.id}`}
            className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Ver venta
          </Link>
          <Button ref={nextRef} onClick={onNext}>
            Nueva venta
          </Button>
        </div>
      </div>
    </Modal>
  )
}
