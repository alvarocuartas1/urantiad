import type { ReportGroup } from '@/types/report'
import { formatCurrency, formatQuantity } from '@/utils/format'
import { formatDay, formatPercent } from '@/utils/report'
import type { ReportColumn } from './ReportTable'

/** First column: the group, with the product SKU or supplier document below its name. */
export function groupColumn<Row extends ReportGroup>(
  header: string,
  byDay: boolean,
): ReportColumn<Row> {
  return {
    header,
    render: (row) =>
      byDay ? (
        <span className="whitespace-nowrap text-slate-900">{formatDay(row.key)}</span>
      ) : (
        <>
          <span className="font-medium text-slate-900">{row.label}</span>
          {row.code && <span className="block text-xs text-slate-500">{row.code}</span>}
        </>
      ),
  }
}

export function moneyColumn<Row>(header: string, value: (row: Row) => string | null) {
  return { header, numeric: true, render: (row: Row) => formatCurrency(value(row)) }
}

export function countColumn<Row>(header: string, value: (row: Row) => number) {
  return { header, numeric: true, render: (row: Row) => value(row) }
}

export function quantityColumn<Row>(header: string, value: (row: Row) => string | null) {
  return {
    header,
    numeric: true,
    render: (row: Row) => {
      const quantity = value(row)
      return quantity === null ? '—' : formatQuantity(quantity)
    },
  }
}

export function percentColumn<Row>(header: string, value: (row: Row) => string | null) {
  return { header, numeric: true, render: (row: Row) => formatPercent(value(row)) }
}
