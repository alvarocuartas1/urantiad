import { useState } from 'react'
import { DashboardCard, EmptyMessage } from '@/components/dashboard/DashboardCard'
import { Alert } from '@/components/ui/Alert'
import { useTopProducts } from '@/hooks/useStatistics'
import type { TopProduct, TopProductMetric } from '@/types/statistics'
import { UNIT_ABBREVIATIONS } from '@/utils/catalog'
import { getErrorMessage } from '@/utils/errors'
import { formatCurrency, formatQuantity } from '@/utils/format'
import { ShareBars, type ShareItem } from './ShareBars'

const TOP_LIMIT = 10

const METRICS: { value: TopProductMetric; label: string }[] = [
  { value: 'quantity', label: 'Unidades' },
  { value: 'total', label: 'Valor' },
]

function quantityText(product: TopProduct): string {
  return `${formatQuantity(product.quantity)} ${UNIT_ABBREVIATIONS[product.unit_of_measure]}`
}

function toShareItem(product: TopProduct, metric: TopProductMetric): ShareItem {
  const byQuantity = metric === 'quantity'
  return {
    key: String(product.product_id),
    label: product.name,
    detail: product.sku,
    amount: byQuantity ? product.quantity : product.total,
    value: byQuantity ? quantityText(product) : formatCurrency(product.total),
    note: byQuantity ? `Vendido ${formatCurrency(product.total)}` : quantityText(product),
  }
}

/** The ten products and services sold the most in the period, by units or by value. */
export function TopProductsCard({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [metric, setMetric] = useState<TopProductMetric>('quantity')
  const { data, isPending, error } = useTopProducts({
    date_from: dateFrom,
    date_to: dateTo,
    metric,
    limit: TOP_LIMIT,
  })

  return (
    <DashboardCard title="Más vendidos" subtitle={`Top ${TOP_LIMIT} del periodo`}>
      <div role="group" aria-label="Ordenar por" className="flex gap-1">
        {METRICS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={metric === value}
            onClick={() => setMetric(value)}
            className={`rounded-lg px-3 py-1 text-sm font-medium ${
              metric === value
                ? 'bg-slate-900 text-white'
                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {error ? (
        <Alert>{getErrorMessage(error)}</Alert>
      ) : isPending ? (
        <EmptyMessage>Cargando…</EmptyMessage>
      ) : data.length === 0 ? (
        <EmptyMessage>No hay ventas en el periodo.</EmptyMessage>
      ) : (
        <ShareBars items={data.map((product) => toShareItem(product, metric))} />
      )}
    </DashboardCard>
  )
}
