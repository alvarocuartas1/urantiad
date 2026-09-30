import { SummaryCards } from '@/components/reports/SummaryCards'
import type { SalesToday } from '@/types/dashboard'
import { formatCurrency } from '@/utils/format'
import { formatDay } from '@/utils/report'

/** Key figures of today's sales: all of them, or only the cashier's own. */
export function SalesTodayCard({ sales }: { sales: SalesToday }) {
  return (
    <section aria-labelledby="sales-today-title" className="space-y-3">
      <div>
        <h2 id="sales-today-title" className="text-lg font-semibold text-slate-900">
          {sales.scope === 'own' ? 'Mis ventas de hoy' : 'Ventas de hoy'}
        </h2>
        <p className="text-xs text-slate-500">{formatDay(sales.business_date)}</p>
      </div>
      <SummaryCards
        items={[
          { label: 'Total vendido', value: formatCurrency(sales.total) },
          { label: 'Ventas', value: sales.sales_count },
          { label: 'Ticket promedio', value: formatCurrency(sales.average_ticket) },
          {
            label: 'Anuladas',
            value: sales.cancelled_count,
            detail: sales.cancelled_count > 0 ? formatCurrency(sales.cancelled_total) : undefined,
          },
        ]}
      />
    </section>
  )
}
