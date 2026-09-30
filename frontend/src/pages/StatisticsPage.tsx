import { useState } from 'react'
import { PeriodFilter, ReportToolbar } from '@/components/reports/ReportToolbar'
import { SummaryCards, type SummaryItem } from '@/components/reports/SummaryCards'
import { RotationSection } from '@/components/statistics/RotationSection'
import { SalesShareCard } from '@/components/statistics/SalesShareCard'
import { SalesTrendCard } from '@/components/statistics/SalesTrendCard'
import { TopProductsCard } from '@/components/statistics/TopProductsCard'
import { Alert } from '@/components/ui/Alert'
import { FilterSelect } from '@/components/ui/ListFilters'
import { useAuth } from '@/hooks/useAuth'
import { useSalesReport } from '@/hooks/useReports'
import { useSalesTrend } from '@/hooks/useStatistics'
import { PERMISSIONS } from '@/types/auth'
import type { SalesReportSummary } from '@/types/report'
import type { Granularity, SalesTrend } from '@/types/statistics'
import { labelEntries } from '@/utils/catalog'
import { getErrorMessage } from '@/utils/errors'
import { formatCurrency } from '@/utils/format'
import { businessDayRange } from '@/utils/inventory'
import { bestPeriod, defaultPeriod, formatPeriod, GRANULARITY_LABELS } from '@/utils/statistics'

function salesSummary(
  summary: SalesReportSummary,
  trend: SalesTrend | undefined,
  withCosts: boolean,
): SummaryItem[] {
  const items: SummaryItem[] = [
    {
      label: 'Total vendido',
      value: formatCurrency(summary.total),
      detail: `${summary.sales_count} ${summary.sales_count === 1 ? 'venta' : 'ventas'}`,
    },
    { label: 'Ticket promedio', value: formatCurrency(summary.average_ticket) },
  ]
  if (withCosts) {
    items.push({
      label: 'Margen bruto',
      value: formatCurrency(summary.gross_margin),
      detail: 'Total sin IVA − costo',
    })
  }
  const best = trend && bestPeriod(trend.points)
  if (trend && best) {
    items.push({
      label: `Mejor ${GRANULARITY_LABELS[trend.granularity].toLowerCase()}`,
      value: formatCurrency(best.total),
      detail: formatPeriod(best.period_start, trend.granularity),
    })
  }
  return items
}

/** Sales over time, best sellers, shares by category and payment method, and inventory
 * rotation; each part needs the permission of its area. */
function StatisticsPage() {
  const { hasPermission } = useAuth()
  const canSeeSales = hasPermission(PERMISSIONS.salesReadAll)
  const canSeeInventory = hasPermission(PERMISSIONS.inventoryRead)
  const withCosts = hasPermission(PERMISSIONS.productsViewCosts)
  const [granularity, setGranularity] = useState<Granularity>('day')
  const [period, setPeriod] = useState(() => defaultPeriod('day'))
  const hasPeriod = Boolean(period.from && period.to)

  const trend = useSalesTrend(
    { granularity, date_from: period.from, date_to: period.to },
    { enabled: canSeeSales && hasPeriod },
  )
  // Same query as the category card: React Query shares a single request.
  const summary = useSalesReport(
    { page: 1, size: 100, group_by: 'category', ...businessDayRange(period.from, period.to) },
    { enabled: canSeeSales && hasPeriod },
  )

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Estadísticas</h1>

      <ReportToolbar isFetching={trend.isFetching && !trend.isPending}>
        {canSeeSales && (
          <FilterSelect
            label="Agrupar por"
            value={granularity}
            onChange={(value) => {
              const next = value as Granularity
              setGranularity(next)
              setPeriod(defaultPeriod(next))
            }}
          >
            {labelEntries(GRANULARITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                Por {label.toLowerCase()}
              </option>
            ))}
          </FilterSelect>
        )}
        <PeriodFilter from={period.from} to={period.to} onChange={setPeriod} />
      </ReportToolbar>

      {!hasPeriod ? (
        <p className="text-sm text-slate-600">Seleccione la fecha inicial y la final.</p>
      ) : (
        <>
          {canSeeSales && (
            <div className="space-y-4">
              {summary.error ? (
                <Alert>{getErrorMessage(summary.error)}</Alert>
              ) : (
                summary.data && (
                  <SummaryCards items={salesSummary(summary.data.summary, trend.data, withCosts)} />
                )
              )}
              {trend.error ? (
                <Alert>{getErrorMessage(trend.error)}</Alert>
              ) : trend.data ? (
                <SalesTrendCard trend={trend.data} withCosts={withCosts} />
              ) : (
                <p className="text-sm text-slate-600">Cargando estadísticas…</p>
              )}
              <div className="grid gap-4 lg:grid-cols-3">
                <TopProductsCard dateFrom={period.from} dateTo={period.to} />
                <SalesShareCard
                  title="Por categoría"
                  groupBy="category"
                  dateFrom={period.from}
                  dateTo={period.to}
                />
                <SalesShareCard
                  title="Por método de pago"
                  groupBy="payment_method"
                  dateFrom={period.from}
                  dateTo={period.to}
                />
              </div>
            </div>
          )}
          {canSeeInventory && (
            // Keyed so a new period starts again from the first page.
            <RotationSection
              key={`${period.from}/${period.to}`}
              dateFrom={period.from}
              dateTo={period.to}
            />
          )}
        </>
      )}
    </section>
  )
}

export default StatisticsPage
