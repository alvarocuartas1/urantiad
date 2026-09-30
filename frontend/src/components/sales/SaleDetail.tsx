import { Ban } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/types/auth'
import type { Sale } from '@/types/sale'
import { UNIT_ABBREVIATIONS } from '@/utils/catalog'
import { fromCents, toCents } from '@/utils/decimal'
import { formatDocument } from '@/utils/document'
import { formatCurrency, formatDateTime, formatQuantity } from '@/utils/format'
import { CancelSaleModal } from './CancelSaleModal'
import { SaleTotals } from './SaleTotals'

const HEADER_CLASS = 'px-4 py-3 font-semibold'
const CELL_CLASS = 'px-4 py-3'
const NUMBER_CELL = `${CELL_CLASS} text-right whitespace-nowrap tabular-nums`

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{children}</dd>
    </div>
  )
}

/** Read-only sale with its lines and payments; the administrator can cancel it. */
export function SaleDetail({ sale }: { sale: Sale }) {
  const { hasPermission } = useAuth()
  const canCancel = hasPermission(PERMISSIONS.salesCancel) && sale.status === 'completed'
  const showCosts = sale.items.some((item) => item.unit_cost !== null)
  const [cancelling, setCancelling] = useState(false)

  return (
    <div className="space-y-5">
      <dl className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Cliente">
          {sale.customer.name}
          {!sale.customer.is_default && (
            <span className="block text-xs text-slate-500">{formatDocument(sale.customer)}</span>
          )}
        </Field>
        <Field label="Cajero">
          {sale.user.full_name}
          <span className="block text-xs text-slate-500">{sale.cash_register.name}</span>
        </Field>
        <Field label="Fecha">{formatDateTime(sale.created_at)}</Field>
        {sale.notes && <Field label="Observaciones">{sale.notes}</Field>}
        {sale.cancelled_by && (
          <Field label="Anulada por">
            {sale.cancelled_by.full_name} · {formatDateTime(sale.cancelled_at)}
            <span className="block text-slate-700">Motivo: {sale.cancellation_reason}</span>
          </Field>
        )}
      </dl>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 uppercase">
            <tr>
              <th scope="col" className={HEADER_CLASS}>
                Producto
              </th>
              <th scope="col" className={`${HEADER_CLASS} text-right`}>
                Cantidad
              </th>
              <th scope="col" className={`${HEADER_CLASS} text-right`}>
                Precio
              </th>
              <th scope="col" className={`${HEADER_CLASS} text-right`}>
                Descuento
              </th>
              <th scope="col" className={`${HEADER_CLASS} text-right`}>
                IVA incluido
              </th>
              <th scope="col" className={`${HEADER_CLASS} text-right`}>
                Total
              </th>
              {showCosts && (
                <th scope="col" className={`${HEADER_CLASS} text-right`}>
                  Costo unit.
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sale.items.map((item) => (
              <tr key={item.id}>
                <td className={CELL_CLASS}>
                  <p className="font-medium text-slate-900">{item.product.name}</p>
                  <p className="text-xs text-slate-500">{item.product.sku}</p>
                </td>
                <td className={NUMBER_CELL}>
                  {formatQuantity(item.quantity)} {UNIT_ABBREVIATIONS[item.product.unit_of_measure]}
                </td>
                <td className={NUMBER_CELL}>{formatCurrency(item.unit_price)}</td>
                <td className={NUMBER_CELL}>
                  {formatCurrency(
                    fromCents(toCents(item.discount) + toCents(item.sale_discount_share)),
                  )}
                </td>
                <td className={NUMBER_CELL}>
                  {formatCurrency(item.tax_amount)}
                  <span className="block text-xs text-slate-500">
                    {formatQuantity(item.tax_rate)} %
                  </span>
                </td>
                <td className={`${NUMBER_CELL} font-medium`}>{formatCurrency(item.total)}</td>
                {showCosts && <td className={NUMBER_CELL}>{formatCurrency(item.unit_cost)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Pagos</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {sale.payments.map((payment) => (
              <li key={payment.id} className="flex justify-between gap-4 py-2">
                <span>
                  <span className="font-medium text-slate-900">{payment.payment_method.name}</span>
                  {payment.amount_tendered && (
                    <span className="block text-xs text-slate-500">
                      Recibido {formatCurrency(payment.amount_tendered)} · cambio{' '}
                      {formatCurrency(payment.change_amount)}
                    </span>
                  )}
                  {payment.reference && (
                    <span className="block text-xs text-slate-500">Ref. {payment.reference}</span>
                  )}
                </span>
                <span className="font-medium tabular-nums">{formatCurrency(payment.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <SaleTotals totals={sale} />
        </div>
      </div>

      {canCancel && (
        <div className="flex justify-end">
          <Button variant="danger" onClick={() => setCancelling(true)}>
            <Ban aria-hidden="true" className="size-4" />
            Anular venta
          </Button>
        </div>
      )}
      {cancelling && <CancelSaleModal sale={sale} onClose={() => setCancelling(false)} />}
    </div>
  )
}
