import type { ReactNode } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Pagination } from '@/components/ui/Pagination'
import type { ReportGroup, ReportPage } from '@/types/report'
import { getErrorMessage } from '@/utils/errors'
import { type ReportColumn, ReportTable } from './ReportTable'

interface ReportResultsProps<Row extends ReportGroup, Summary> {
  caption: string
  data: ReportPage<Row, Summary> | undefined
  isPending: boolean
  error: unknown
  columns: ReportColumn<Row>[]
  renderSummary: (summary: Summary) => ReactNode
  onPageChange: (page: number) => void
}

/** Loading, error and empty states, the summary and the paginated groups of a report. */
export function ReportResults<Row extends ReportGroup, Summary>({
  caption,
  data,
  isPending,
  error,
  columns,
  renderSummary,
  onPageChange,
}: ReportResultsProps<Row, Summary>) {
  if (error) return <Alert>{getErrorMessage(error)}</Alert>
  if (isPending || !data) return <p className="text-sm text-slate-600">Cargando reporte…</p>
  return (
    <div className="space-y-4">
      {renderSummary(data.summary)}
      {data.items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
          No hay datos para los filtros seleccionados.
        </p>
      ) : (
        <>
          <ReportTable caption={caption} columns={columns} rows={data.items} />
          <Pagination
            page={data.page}
            size={data.size}
            total={data.total}
            onPageChange={onPageChange}
          />
        </>
      )}
    </div>
  )
}
