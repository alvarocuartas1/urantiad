import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { PurchaseDetail } from '@/components/purchases/PurchaseDetail'
import { PurchaseForm } from '@/components/purchases/PurchaseForm'
import { PurchaseStatusBadge } from '@/components/purchases/PurchaseStatusBadge'
import { Alert } from '@/components/ui/Alert'
import { useAuth } from '@/hooks/useAuth'
import { usePurchase } from '@/hooks/usePurchases'
import { PERMISSIONS } from '@/types/auth'
import type { Purchase } from '@/types/purchase'
import { getErrorMessage } from '@/utils/errors'

function Header({ title, purchase }: { title: string; purchase?: Purchase }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link
        to="/compras"
        aria-label="Volver a compras"
        className="rounded-md p-1 text-slate-600 hover:bg-slate-200"
      >
        <ArrowLeft aria-hidden="true" className="size-5" />
      </Link>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
      {purchase && <PurchaseStatusBadge status={purchase.status} />}
    </div>
  )
}

function ExistingPurchase({ id }: { id: number }) {
  const { hasPermission } = useAuth()
  const { data: purchase, isPending, isError, error } = usePurchase(id)

  if (isPending) return <p className="text-sm text-slate-600">Cargando compra…</p>
  if (isError) return <Alert>{getErrorMessage(error)}</Alert>

  const editable = purchase.status === 'draft' && hasPermission(PERMISSIONS.purchasesManage)
  return (
    <>
      <Header title={purchase.number ?? `Borrador #${purchase.id}`} purchase={purchase} />
      {editable ? (
        <PurchaseForm key={purchase.id} purchase={purchase} />
      ) : (
        <PurchaseDetail purchase={purchase} />
      )}
    </>
  )
}

/** `/compras/nueva` registers a purchase; `/compras/:id` edits a draft or shows a purchase. */
function PurchasePage() {
  const { purchaseId } = useParams()
  return (
    <section className="space-y-4">
      {purchaseId ? (
        <ExistingPurchase id={Number(purchaseId)} />
      ) : (
        <>
          <Header title="Nueva compra" />
          <PurchaseForm />
        </>
      )}
    </section>
  )
}

export default PurchasePage
