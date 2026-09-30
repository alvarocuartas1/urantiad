import { Plus } from 'lucide-react'
import { useState } from 'react'
import { PaymentMethodFormModal } from '@/components/paymentMethods/PaymentMethodFormModal'
import { PaymentMethodsTable } from '@/components/paymentMethods/PaymentMethodsTable'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { useAllPaymentMethods } from '@/hooks/usePaymentMethods'
import type { PaymentMethodDetail } from '@/types/paymentMethod'
import { getErrorMessage } from '@/utils/errors'
import { nextSortOrder } from '@/utils/paymentMethod'

type ModalState = { type: 'create' } | { type: 'edit'; method: PaymentMethodDetail } | null

/** Payment methods the POS offers: add, rename, order, activate or deactivate them. */
function PaymentMethodsPage() {
  const { data, isPending, isError, error } = useAllPaymentMethods()
  const [modal, setModal] = useState<ModalState>(null)
  const closeModal = () => setModal(null)
  const defaultSortOrder = nextSortOrder(data?.map((method) => method.sort_order) ?? [])

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Métodos de pago</h1>
        <Button onClick={() => setModal({ type: 'create' })}>
          <Plus aria-hidden="true" className="size-4" />
          Nuevo método
        </Button>
      </div>
      <p className="text-sm text-slate-600">
        Los métodos inactivos no aparecen en el punto de venta; las ventas ya pagadas con ellos no
        cambian. Los cajeros ven los cambios al recargar la página.
      </p>

      {isError && <Alert>{getErrorMessage(error)}</Alert>}
      {isPending && <p className="text-sm text-slate-600">Cargando métodos de pago…</p>}
      {data && (
        <PaymentMethodsTable
          methods={data}
          onEdit={(method) => setModal({ type: 'edit', method })}
        />
      )}

      {modal?.type === 'create' && (
        <PaymentMethodFormModal defaultSortOrder={defaultSortOrder} onClose={closeModal} />
      )}
      {modal?.type === 'edit' && (
        <PaymentMethodFormModal
          method={modal.method}
          defaultSortOrder={defaultSortOrder}
          onClose={closeModal}
        />
      )}
    </section>
  )
}

export default PaymentMethodsPage
