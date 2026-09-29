import { Link } from 'react-router'
import type { PurchaseSummary } from '@/types/purchase'
import { formatCurrency, formatDateTime } from '@/utils/format'
import { purchaseDate } from '@/utils/purchase'
import { PurchaseStatusBadge } from './PurchaseStatusBadge'

const HEADER_CLASS = 'px-4 py-3 font-semibold'
const CELL_CLASS = 'px-4 py-3'

export function PurchasesTable({ purchases }: { purchases: PurchaseSummary[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 uppercase">
          <tr>
            <th scope="col" className={HEADER_CLASS}>
              Compra
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Proveedor
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Fecha
            </th>
            <th scope="col" className={`${HEADER_CLASS} text-right`}>
              Total
            </th>
            <th scope="col" className={`${HEADER_CLASS} text-right`}>
              Saldo
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Estado
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {purchases.map((purchase) => (
            <tr key={purchase.id} className="hover:bg-slate-50">
              <td className={CELL_CLASS}>
                <Link
                  to={`/compras/${purchase.id}`}
                  className="font-medium text-slate-900 underline-offset-2 hover:underline"
                >
                  {purchase.number ?? `Borrador #${purchase.id}`}
                </Link>
                {purchase.supplier_invoice_number && (
                  <p className="text-xs text-slate-500">
                    Factura {purchase.supplier_invoice_number}
                  </p>
                )}
              </td>
              <td className={`${CELL_CLASS} text-slate-700`}>{purchase.supplier.name}</td>
              <td className={`${CELL_CLASS} whitespace-nowrap text-slate-700`}>
                {formatDateTime(purchaseDate(purchase))}
              </td>
              <td className={`${CELL_CLASS} text-right font-medium whitespace-nowrap`}>
                {formatCurrency(purchase.total)}
              </td>
              <td className={`${CELL_CLASS} text-right whitespace-nowrap text-slate-700`}>
                {formatCurrency(purchase.balance_due)}
              </td>
              <td className={CELL_CLASS}>
                <PurchaseStatusBadge status={purchase.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
