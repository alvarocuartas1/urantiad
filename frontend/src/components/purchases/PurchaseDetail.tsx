import { Ban } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/types/auth'
import type { Purchase } from '@/types/purchase'
import { UNIT_ABBREVIATIONS } from '@/utils/catalog'
import { formatCurrency, formatDateTime, formatQuantity } from '@/utils/format'
import { CancelPurchaseModal } from './CancelPurchaseModal'
import { PurchaseTotals } from './PurchaseTotals'

const HEADER_CLASS = 'px-4 py-3 font-semibold'
const CELL_CLASS = 'px-4 py-3'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{children}</dd>
    </div>
  )
}

/** Read-only purchase: confirmed and cancelled ones, or drafts for users who cannot edit. */
export function PurchaseDetail({ purchase }: { purchase: Purchase }) {
  const { hasPermission } = useAuth()
  const canCancel = hasPermission(PERMISSIONS.purchasesCancel) && purchase.status === 'confirmed'
  const [cancelling, setCancelling] = useState(false)

  return (
    <div className="space-y-5">
      <dl className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Proveedor">{purchase.supplier.name}</Field>
        <Field label="Factura del proveedor">{purchase.supplier_invoice_number ?? '—'}</Field>
        <Field label="Registrada por">
          {purchase.created_by.full_name} · {formatDateTime(purchase.created_at)}
        </Field>
        {purchase.confirmed_by && (
          <Field label="Confirmada por">
            {purchase.confirmed_by.full_name} · {formatDateTime(purchase.confirmed_at)}
          </Field>
        )}
        {purchase.notes && <Field label="Observaciones">{purchase.notes}</Field>}
        {purchase.cancelled_by && (
          <Field label="Anulada por">
            {purchase.cancelled_by.full_name} · {formatDateTime(purchase.cancelled_at)}
            <span className="block text-slate-700">Motivo: {purchase.cancellation_reason}</span>
          </Field>
        )}
      </dl>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 uppercase">
            <tr>
              <th scope="col" className={HEADER_CLASS}>
                Producto
              </th>
              <th scope="col" className={`${HEADER_CLASS} text-right`}>
                Cantidad
              </th>
              <th scope="col" className={`${HEADER_CLASS} text-right`}>
                Costo unit.
              </th>
              <th scope="col" className={`${HEADER_CLASS} text-right`}>
                Descuento
              </th>
              <th scope="col" className={`${HEADER_CLASS} text-right`}>
                Costo neto
              </th>
              <th scope="col" className={`${HEADER_CLASS} text-right`}>
                IVA
              </th>
              <th scope="col" className={`${HEADER_CLASS} text-right`}>
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {purchase.items.map((item) => (
              <tr key={item.id}>
                <td className={CELL_CLASS}>
                  <p className="font-medium text-slate-900">{item.product.name}</p>
                  <p className="text-xs text-slate-500">{item.product.sku}</p>
                </td>
                <td className={`${CELL_CLASS} text-right whitespace-nowrap`}>
                  {formatQuantity(item.quantity)} {UNIT_ABBREVIATIONS[item.product.unit_of_measure]}
                </td>
                <td className={`${CELL_CLASS} text-right whitespace-nowrap`}>
                  {formatCurrency(item.unit_cost)}
                </td>
                <td className={`${CELL_CLASS} text-right whitespace-nowrap`}>
                  {formatCurrency(item.discount)}
                </td>
                <td className={`${CELL_CLASS} text-right whitespace-nowrap`}>
                  {formatCurrency(item.net_unit_cost)}
                </td>
                <td className={`${CELL_CLASS} text-right whitespace-nowrap`}>
                  {formatCurrency(item.tax_amount)}
                  <span className="block text-xs text-slate-500">
                    {formatQuantity(item.tax_rate)} %
                  </span>
                </td>
                <td className={`${CELL_CLASS} text-right font-medium whitespace-nowrap`}>
                  {formatCurrency(item.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PurchaseTotals totals={purchase} />

      {canCancel && (
        <div className="flex justify-end">
          <Button variant="danger" onClick={() => setCancelling(true)}>
            <Ban aria-hidden="true" className="size-4" />
            Anular compra
          </Button>
        </div>
      )}
      {cancelling && (
        <CancelPurchaseModal purchase={purchase} onClose={() => setCancelling(false)} />
      )}
    </div>
  )
}
