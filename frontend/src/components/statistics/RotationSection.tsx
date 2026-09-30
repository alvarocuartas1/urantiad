import { PackageX } from 'lucide-react'
import { useState } from 'react'
import { groupColumn, quantityColumn } from '@/components/reports/columns'
import { ReportResults } from '@/components/reports/ReportResults'
import type { ReportColumn } from '@/components/reports/ReportTable'
import { SummaryCards } from '@/components/reports/SummaryCards'
import { FilterSelect } from '@/components/ui/ListFilters'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useActiveCategories } from '@/hooks/useCategories'
import { useInventoryRotation } from '@/hooks/useStatistics'
import type { RotationOrder, RotationRow } from '@/types/statistics'
import { formatDays, formatRotation } from '@/utils/statistics'

const PAGE_SIZE = 20

type Row = RotationRow & { key: string; label: string; code: string }

const COLUMNS: ReportColumn<Row>[] = [
  groupColumn<Row>('Producto', false),
  { header: 'Categoría', render: (row) => row.category_name },
  quantityColumn<Row>('Vendidas', (row) => row.units_sold),
  quantityColumn<Row>('Stock inicial', (row) => row.stock_start),
  quantityColumn<Row>('Stock final', (row) => row.stock_end),
  { header: 'Rotación', numeric: true, render: (row) => formatRotation(row.rotation) },
  {
    header: 'Días de inventario',
    render: (row) =>
      row.days_of_inventory === null ? (
        <StatusBadge tone="warning" size="sm" icon={PackageX} label="Sin ventas" />
      ) : (
        <span className="whitespace-nowrap tabular-nums">{formatDays(row.days_of_inventory)}</span>
      ),
  },
  {
    header: 'Días medidos',
    numeric: true,
    render: (row) => formatDays(row.measured_days),
  },
]

/** How fast the stock of each active physical product sold in the period. */
export function RotationSection({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [page, setPage] = useState(1)
  const [order, setOrder] = useState<RotationOrder>('slowest')
  const [categoryId, setCategoryId] = useState('')
  const { categories } = useActiveCategories()
  const { data, isPending, error } = useInventoryRotation({
    page,
    size: PAGE_SIZE,
    date_from: dateFrom,
    date_to: dateTo,
    order,
    category_id: categoryId ? Number(categoryId) : undefined,
  })
  // The report components identify rows by `key` and show `label` with `code` below it.
  const rows = data && {
    ...data,
    items: data.items.map((row) => ({
      ...row,
      key: String(row.product_id),
      label: row.name,
      code: row.sku,
    })),
  }

  return (
    <section aria-labelledby="rotation-title" className="space-y-4">
      <div className="space-y-1">
        <h2 id="rotation-title" className="text-lg font-semibold text-slate-900">
          Rotación de inventario
        </h2>
        <p className="text-sm text-slate-600">
          Rotación = unidades vendidas ÷ stock promedio del periodo, ponderado por el tiempo que
          duró cada nivel de stock. Días de inventario: cuánto alcanza el stock final al ritmo de
          venta. Un producto que empezó el periodo sin stock se mide desde su llegada (días
          medidos).
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect
          label="Orden"
          value={order}
          onChange={(value) => {
            setOrder(value as RotationOrder)
            setPage(1)
          }}
        >
          <option value="slowest">Menor rotación primero</option>
          <option value="fastest">Mayor rotación primero</option>
        </FilterSelect>
        <FilterSelect
          label="Categoría"
          value={categoryId}
          onChange={(value) => {
            setCategoryId(value)
            setPage(1)
          }}
        >
          <option value="">Todas las categorías</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </FilterSelect>
      </div>
      <ReportResults
        caption="Rotación de inventario"
        data={rows}
        isPending={isPending}
        error={error}
        columns={COLUMNS}
        renderSummary={(summary) => (
          <SummaryCards
            items={[
              { label: 'Productos analizados', value: summary.products_count },
              {
                label: 'Sin ventas en el periodo',
                value: summary.without_sales_count,
                detail: 'Stock inmóvil: revise antes de volver a comprar',
              },
              {
                label: 'Días del periodo',
                value: summary.period_days,
                detail: 'Transcurridos hasta hoy',
              },
            ]}
          />
        )}
        onPageChange={setPage}
      />
    </section>
  )
}
