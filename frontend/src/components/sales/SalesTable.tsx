import { Link } from 'react-router'
import type { SaleSummary } from '@/types/sale'
import { formatCurrency, formatDateTime } from '@/utils/format'
import { SaleStatusBadge } from './SaleStatusBadge'

const HEADER_CLASS = 'px-4 py-3 font-semibold'
const CELL_CLASS = 'px-4 py-3'

export function SalesTable({ sales }: { sales: SaleSummary[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 uppercase">
          <tr>
            <th scope="col" className={HEADER_CLASS}>
              Venta
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Fecha
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Cliente
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Cajero
            </th>
            <th scope="col" className={`${HEADER_CLASS} text-right`}>
              Total
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Estado
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sales.map((sale) => (
            <tr key={sale.id} className="hover:bg-slate-50">
              <td className={CELL_CLASS}>
                <Link
                  to={`/ventas/${sale.id}`}
                  className="font-medium text-slate-900 underline-offset-2 hover:underline"
                >
                  {sale.number}
                </Link>
              </td>
              <td className={`${CELL_CLASS} whitespace-nowrap text-slate-700`}>
                {formatDateTime(sale.created_at)}
              </td>
              <td className={`${CELL_CLASS} text-slate-700`}>{sale.customer.name}</td>
              <td className={`${CELL_CLASS} text-slate-700`}>
                {sale.user.full_name}
                <span className="block text-xs text-slate-500">{sale.cash_register.name}</span>
              </td>
              <td className={`${CELL_CLASS} text-right font-medium whitespace-nowrap tabular-nums`}>
                {formatCurrency(sale.total)}
              </td>
              <td className={CELL_CLASS}>
                <SaleStatusBadge status={sale.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
