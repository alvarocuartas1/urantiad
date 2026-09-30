import { DashboardCard, EmptyMessage } from '@/components/dashboard/DashboardCard'
import { Alert } from '@/components/ui/Alert'
import { useSalesReport } from '@/hooks/useReports'
import type { SalesGroupBy } from '@/types/report'
import { sharePercent } from '@/utils/dashboard'
import { getErrorMessage } from '@/utils/errors'
import { formatCurrency } from '@/utils/format'
import { businessDayRange } from '@/utils/inventory'
import { ShareBars } from './ShareBars'

// A business has few categories and payment methods: one page holds them all.
const ALL_GROUPS = { page: 1, size: 100 }

interface SalesShareCardProps {
  title: string
  groupBy: Extract<SalesGroupBy, 'category' | 'payment_method'>
  dateFrom: string
  dateTo: string
}

/** Share of the period's sales of each category or payment method (from the sales report). */
export function SalesShareCard({ title, groupBy, dateFrom, dateTo }: SalesShareCardProps) {
  const { data, isPending, error } = useSalesReport({
    ...ALL_GROUPS,
    group_by: groupBy,
    ...businessDayRange(dateFrom, dateTo),
  })

  return (
    <DashboardCard title={title} subtitle="Participación en el total vendido">
      {error ? (
        <Alert>{getErrorMessage(error)}</Alert>
      ) : isPending ? (
        <EmptyMessage>Cargando…</EmptyMessage>
      ) : data.items.length === 0 ? (
        <EmptyMessage>No hay ventas en el periodo.</EmptyMessage>
      ) : (
        <ShareBars
          items={data.items.map((row) => ({
            key: row.key,
            label: row.label,
            amount: row.total,
            value: formatCurrency(row.total),
            note: `${sharePercent(row.total, data.summary.total)} % · ${row.sales_count} ${
              row.sales_count === 1 ? 'venta' : 'ventas'
            }`,
          }))}
        />
      )}
    </DashboardCard>
  )
}
