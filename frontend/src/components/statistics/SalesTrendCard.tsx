import { ChartColumn, Table } from 'lucide-react'
import { useState } from 'react'
import { DashboardCard, EmptyMessage } from '@/components/dashboard/DashboardCard'
import { ReportTable } from '@/components/reports/ReportTable'
import { countColumn, moneyColumn } from '@/components/reports/columns'
import { Button } from '@/components/ui/Button'
import type { SalesTrend, TrendPoint } from '@/types/statistics'
import { formatPeriod, formatRange, GRANULARITY_LABELS } from '@/utils/statistics'
import { SalesTrendChart } from './SalesTrendChart'

type Row = TrendPoint & { key: string; label: string; code: null }

/** Sales total per period, as a chart or as a table with the same data. */
export function SalesTrendCard({ trend, withCosts }: { trend: SalesTrend; withCosts: boolean }) {
  const [asTable, setAsTable] = useState(false)
  const hasSales = trend.points.some((point) => point.sales_count > 0)
  const period = GRANULARITY_LABELS[trend.granularity]
  const rows: Row[] = trend.points.map((point) => ({
    ...point,
    key: point.period_start,
    label: formatPeriod(point.period_start, trend.granularity),
    code: null,
  }))

  return (
    <DashboardCard
      title="Evolución de ventas"
      subtitle={`${formatRange(trend.date_from, trend.date_to)} · por ${period.toLowerCase()}`}
    >
      {!hasSales ? (
        <EmptyMessage>No hay ventas en el periodo.</EmptyMessage>
      ) : (
        <>
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => setAsTable((current) => !current)}>
              {asTable ? (
                <ChartColumn aria-hidden="true" className="size-4" />
              ) : (
                <Table aria-hidden="true" className="size-4" />
              )}
              {asTable ? 'Ver gráfico' : 'Ver tabla'}
            </Button>
          </div>
          {asTable ? (
            <ReportTable
              caption="Evolución de ventas"
              rows={rows}
              columns={[
                { header: period, render: (row) => row.label },
                countColumn<Row>('Ventas', (row) => row.sales_count),
                moneyColumn<Row>('Total', (row) => row.total),
                moneyColumn<Row>('Sin IVA', (row) => row.net_total),
                ...(withCosts ? [moneyColumn<Row>('Margen bruto', (row) => row.gross_margin)] : []),
              ]}
            />
          ) : (
            <>
              <SalesTrendChart trend={trend} />
              <p className="sr-only">
                Gráfico de columnas del total vendido por {period.toLowerCase()}. Use «Ver tabla»
                para consultar los valores.
              </p>
            </>
          )}
        </>
      )}
    </DashboardCard>
  )
}
