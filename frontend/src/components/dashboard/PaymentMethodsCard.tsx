import type { SalesToday } from '@/types/dashboard'
import { sharePercent } from '@/utils/dashboard'
import { formatCurrency } from '@/utils/format'
import { DashboardCard, EmptyMessage } from './DashboardCard'

/** Today's sales by payment method, as bars with their amount and share in text. */
export function PaymentMethodsCard({ sales }: { sales: SalesToday }) {
  return (
    <DashboardCard title="Ventas por método de pago" subtitle="Hoy">
      {sales.by_payment_method.length === 0 ? (
        <EmptyMessage>Todavía no hay ventas hoy.</EmptyMessage>
      ) : (
        <ul className="space-y-3">
          {sales.by_payment_method.map((method) => {
            const percent = sharePercent(method.total, sales.total)
            return (
              <li key={method.id} className="space-y-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                  <span className="font-medium text-slate-900">{method.name}</span>
                  <span className="text-slate-900 tabular-nums">
                    {formatCurrency(method.total)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-100" aria-hidden="true">
                  <div className="bg-brand-700 h-2 rounded-full" style={{ width: `${percent}%` }} />
                </div>
                <p className="text-xs text-slate-600">
                  {percent} % · {method.sales_count} {method.sales_count === 1 ? 'venta' : 'ventas'}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </DashboardCard>
  )
}
