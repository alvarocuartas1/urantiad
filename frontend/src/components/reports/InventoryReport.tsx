import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { FilterSelect } from '@/components/ui/ListFilters'
import { useAuth } from '@/hooks/useAuth'
import { useActiveCategories } from '@/hooks/useCategories'
import { useInventoryReport } from '@/hooks/useReports'
import { exportInventoryReport } from '@/services/reports'
import { PERMISSIONS } from '@/types/auth'
import type { InventoryReportRow, InventoryReportSummary } from '@/types/report'
import { STOCK_STATUS_LABELS } from '@/utils/catalog'
import { formatCurrency } from '@/utils/format'
import { countColumn, groupColumn, moneyColumn } from './columns'
import { ExportButton } from './ExportButton'
import { ReportResults } from './ReportResults'
import type { ReportColumn } from './ReportTable'
import { ReportToolbar } from './ReportToolbar'
import { SummaryCards, type SummaryItem } from './SummaryCards'

const PAGE_SIZE = 20

function inventoryColumns(withCosts: boolean): ReportColumn<InventoryReportRow>[] {
  return [
    groupColumn<InventoryReportRow>('Categoría', false),
    countColumn<InventoryReportRow>('Productos', (row) => row.products_count),
    countColumn<InventoryReportRow>(
      STOCK_STATUS_LABELS.out_of_stock,
      (row) => row.out_of_stock_count,
    ),
    countColumn<InventoryReportRow>(STOCK_STATUS_LABELS.critical, (row) => row.critical_count),
    countColumn<InventoryReportRow>(STOCK_STATUS_LABELS.low, (row) => row.low_count),
    countColumn<InventoryReportRow>(STOCK_STATUS_LABELS.ok, (row) => row.ok_count),
    ...(withCosts
      ? [moneyColumn<InventoryReportRow>('Valor al costo', (row) => row.inventory_value)]
      : []),
  ]
}

function inventorySummary(summary: InventoryReportSummary, withCosts: boolean): SummaryItem[] {
  const items: SummaryItem[] = [
    {
      label: 'Productos activos',
      value: summary.products_count,
      detail: `${summary.ok_count} con stock suficiente`,
    },
    { label: STOCK_STATUS_LABELS.out_of_stock, value: summary.out_of_stock_count },
    {
      label: 'Por reponer',
      value: summary.critical_count + summary.low_count,
      detail: `${summary.critical_count} con stock crítico · ${summary.low_count} para comprar pronto`,
    },
  ]
  if (withCosts) {
    items.push({
      label: 'Valor del inventario',
      value: formatCurrency(summary.inventory_value),
      detail: 'Al costo promedio, sin IVA',
    })
  }
  return items
}

const DETAIL_LINKS = [
  { to: '/productos', label: 'Productos', permission: PERMISSIONS.productsRead },
  {
    to: '/inventario/reposicion',
    label: 'Reposición sugerida',
    permission: PERMISSIONS.inventoryRead,
  },
  { to: '/inventario/movimientos', label: 'Movimientos', permission: PERMISSIONS.inventoryRead },
]

/** Current stock levels and value of the active physical products, by category. */
export function InventoryReport() {
  const { hasPermission } = useAuth()
  const withCosts = hasPermission(PERMISSIONS.productsViewCosts)
  const [page, setPage] = useState(1)
  const [categoryId, setCategoryId] = useState('')
  const { categories } = useActiveCategories()
  const reportParams = { category_id: categoryId ? Number(categoryId) : undefined }
  const { data, isPending, error, isFetching } = useInventoryReport({
    page,
    size: PAGE_SIZE,
    ...reportParams,
  })

  return (
    <div className="space-y-4">
      <ReportToolbar isFetching={isFetching && !isPending}>
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
        <nav aria-label="Detalle del inventario" className="flex flex-wrap gap-1 text-sm">
          {DETAIL_LINKS.filter((link) => hasPermission(link.permission)).map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-slate-200"
            >
              {link.label}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          ))}
        </nav>
        <ExportButton onExport={() => exportInventoryReport(reportParams)} />
      </ReportToolbar>
      <p className="text-sm text-slate-600">
        Estado actual de los productos físicos activos (los servicios no manejan stock).
      </p>

      <ReportResults
        caption="Inventario por categoría"
        data={data}
        isPending={isPending}
        error={error}
        columns={inventoryColumns(withCosts)}
        renderSummary={(summary) => <SummaryCards items={inventorySummary(summary, withCosts)} />}
        onPageChange={setPage}
      />
    </div>
  )
}
