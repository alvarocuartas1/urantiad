import { Alert } from '@/components/ui/Alert'
import { useCashSessionSalesSummary } from '@/hooks/useCash'
import { getErrorMessage } from '@/utils/errors'
import { formatCurrency } from '@/utils/format'

const HEADER_CLASS = 'px-4 py-2 font-semibold'

/** Sales of a session by payment method. Only cash enters the drawer count; the other
 * methods are shown to reconcile them (Nequi, cards...). */
export function CashSalesByMethod({ sessionId }: { sessionId: number }) {
  const { data, isPending, isError, error } = useCashSessionSalesSummary(sessionId)

  if (isError) return <Alert>{getErrorMessage(error)}</Alert>
  if (isPending) return <p className="text-sm text-slate-600">Cargando ventas…</p>

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-900">
        Ventas por método de pago ({data.sales_count} {data.sales_count === 1 ? 'venta' : 'ventas'}{' '}
        · {formatCurrency(data.total_sales)})
      </h3>
      {data.by_method.length === 0 ? (
        <p className="text-sm text-slate-600">No hubo ventas en esta apertura.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 uppercase">
              <tr>
                <th scope="col" className={HEADER_CLASS}>
                  Método
                </th>
                <th scope="col" className={`${HEADER_CLASS} text-right`}>
                  Pagos
                </th>
                <th scope="col" className={`${HEADER_CLASS} text-right`}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.by_method.map(({ payment_method: method, payments_count, total }) => (
                <tr key={method.id}>
                  <td className="px-4 py-2 text-slate-900">
                    {method.name}
                    <span className="ml-2 text-xs text-slate-500">
                      {method.is_cash ? '(en el conteo)' : '(no entra al conteo)'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right text-slate-700 tabular-nums">
                    {payments_count}
                  </td>
                  <td className="px-4 py-2 text-right font-medium text-slate-900 tabular-nums">
                    {formatCurrency(total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
