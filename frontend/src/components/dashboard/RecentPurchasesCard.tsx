import { Link } from 'react-router'
import { PurchaseStatusBadge } from '@/components/purchases/PurchaseStatusBadge'
import type { PurchaseSummary } from '@/types/purchase'
import { formatCurrency, formatDateTime } from '@/utils/format'
import { DashboardCard, EmptyMessage } from './DashboardCard'

/** Latest confirmed or cancelled purchases (drafts are left out). */
export function RecentPurchasesCard({ purchases }: { purchases: PurchaseSummary[] }) {
  return (
    <DashboardCard title="Compras recientes" action={{ to: '/compras', label: 'Ver todas' }}>
      {purchases.length === 0 ? (
        <EmptyMessage>No hay compras confirmadas.</EmptyMessage>
      ) : (
        <ul className="divide-y divide-slate-100">
          {purchases.map((purchase) => (
            <li key={purchase.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <Link
                  to={`/compras/${purchase.id}`}
                  className="text-brand-800 text-sm font-medium underline-offset-2 hover:underline"
                >
                  {purchase.number}
                </Link>
                <p className="text-xs text-slate-600">
                  {purchase.supplier.name} · {formatDateTime(purchase.confirmed_at)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-sm font-medium text-slate-900 tabular-nums">
                  {formatCurrency(purchase.total)}
                </span>
                <PurchaseStatusBadge status={purchase.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  )
}
