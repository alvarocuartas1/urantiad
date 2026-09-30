import { StockStatusBadge } from '@/components/products/StockStatusBadge'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { StockStatus } from '@/types/catalog'
import type { StockAlerts } from '@/types/dashboard'
import { formatQuantity } from '@/utils/format'
import { DashboardCard } from './DashboardCard'

/** Products out of stock or to replenish: counts by level and the most urgent ones. */
export function StockAlertsCard({ stock }: { stock: StockAlerts }) {
  const counts: [StockStatus, number][] = [
    ['out_of_stock', stock.out_of_stock_count],
    ['critical', stock.critical_count],
    ['low', stock.low_count],
  ]
  return (
    <DashboardCard
      title="Productos por reponer"
      action={{ to: '/inventario/reposicion', label: 'Ver reposición' }}
    >
      {stock.most_urgent.length === 0 ? (
        <StatusBadge size="sm" tone="ok" label="Ningún producto requiere reposición." />
      ) : (
        <>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {counts.map(([status, count]) => (
              <div
                key={status}
                className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-2 sm:block"
              >
                <dt>
                  <StockStatusBadge status={status} />
                </dt>
                <dd className="text-lg font-semibold text-slate-900 tabular-nums sm:mt-1">
                  {count}
                </dd>
              </div>
            ))}
          </dl>
          <ul className="divide-y divide-slate-100">
            {stock.most_urgent.map((product) => (
              <li key={product.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{product.name}</p>
                  <p className="text-xs text-slate-600">
                    {product.sku} · Stock {formatQuantity(product.current_stock)} · Sugerido{' '}
                    {formatQuantity(product.suggested_quantity)}
                  </p>
                </div>
                <StockStatusBadge status={product.stock_status} />
              </li>
            ))}
          </ul>
        </>
      )}
    </DashboardCard>
  )
}
