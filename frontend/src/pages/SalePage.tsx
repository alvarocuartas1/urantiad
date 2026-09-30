import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { SaleDetail } from '@/components/sales/SaleDetail'
import { SaleStatusBadge } from '@/components/sales/SaleStatusBadge'
import { Alert } from '@/components/ui/Alert'
import { useSale } from '@/hooks/useSales'
import { getErrorMessage } from '@/utils/errors'

/** `/ventas/:id`: detail of a sale. */
function SalePage() {
  const { saleId } = useParams()
  const { data: sale, isPending, isError, error } = useSale(Number(saleId))

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/ventas"
          aria-label="Volver a ventas"
          className="rounded-md p-1 text-slate-600 hover:bg-slate-200"
        >
          <ArrowLeft aria-hidden="true" className="size-5" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {sale?.number ?? 'Venta'}
        </h1>
        {sale && <SaleStatusBadge status={sale.status} />}
      </div>
      {isPending && <p className="text-sm text-slate-600">Cargando venta…</p>}
      {isError && <Alert>{getErrorMessage(error)}</Alert>}
      {sale && <SaleDetail sale={sale} />}
    </section>
  )
}

export default SalePage
