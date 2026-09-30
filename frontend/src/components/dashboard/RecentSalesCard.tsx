import { Link } from 'react-router'
import { SaleStatusBadge } from '@/components/sales/SaleStatusBadge'
import type { SaleSummary } from '@/types/sale'
import { formatCurrency, formatDateTime } from '@/utils/format'
import { DashboardCard, EmptyMessage } from './DashboardCard'

export function RecentSalesCard({ sales }: { sales: SaleSummary[] }) {
  return (
    <DashboardCard title="Ventas recientes" action={{ to: '/ventas', label: 'Ver todas' }}>
      {sales.length === 0 ? (
        <EmptyMessage>No hay ventas registradas.</EmptyMessage>
      ) : (
        <ul className="divide-y divide-slate-100">
          {sales.map((sale) => (
            <li key={sale.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <Link
                  to={`/ventas/${sale.id}`}
                  className="text-sm font-medium text-slate-900 underline-offset-2 hover:underline"
                >
                  {sale.number}
                </Link>
                <p className="text-xs text-slate-600">
                  {sale.customer.name} · {formatDateTime(sale.created_at)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-sm font-medium text-slate-900 tabular-nums">
                  {formatCurrency(sale.total)}
                </span>
                <SaleStatusBadge status={sale.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  )
}
