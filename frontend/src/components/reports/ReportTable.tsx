import type { ReactNode } from 'react'
import type { ReportGroup } from '@/types/report'

export interface ReportColumn<Row> {
  header: string
  render: (row: Row) => ReactNode
  /** Amounts and counts: right-aligned with tabular digits. */
  numeric?: boolean
}

interface ReportTableProps<Row extends ReportGroup> {
  caption: string
  columns: ReportColumn<Row>[]
  rows: Row[]
}

const HEADER_CLASS = 'px-3 py-3 font-semibold'
const CELL_CLASS = 'px-3 py-3'

/** Grouped rows of a report; the first column is the group. */
export function ReportTable<Row extends ReportGroup>({
  caption,
  columns,
  rows,
}: ReportTableProps<Row>) {
  // Long headers may wrap to keep wide reports on screen; amounts never do.
  const headerAlign = (column: ReportColumn<Row>) => (column.numeric ? 'text-right' : '')
  const cellAlign = (column: ReportColumn<Row>) =>
    column.numeric ? 'text-right tabular-nums whitespace-nowrap' : ''
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 uppercase">
          <tr>
            {columns.map((column) => (
              <th
                key={column.header}
                scope="col"
                className={`${HEADER_CLASS} ${headerAlign(column)}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.key} className="hover:bg-slate-50">
              {columns.map((column) => (
                <td
                  key={column.header}
                  className={`${CELL_CLASS} text-slate-700 ${cellAlign(column)}`}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
