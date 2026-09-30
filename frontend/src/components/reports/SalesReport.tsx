import { useState } from 'react'
import { FilterSelect } from '@/components/ui/ListFilters'
import { useAuth } from '@/hooks/useAuth'
import { useCashRegisters } from '@/hooks/useCash'
import { useActiveCategories } from '@/hooks/useCategories'
import { useSalesReport } from '@/hooks/useReports'
import { exportSalesReport } from '@/services/reports'
import { useUsers } from '@/hooks/useUsers'
import { PERMISSIONS } from '@/types/auth'
import type { Product } from '@/types/catalog'
import type { SalesGroupBy, SalesReportRow, SalesReportSummary } from '@/types/report'
import { labelEntries } from '@/utils/catalog'
import { formatCurrency } from '@/utils/format'
import { businessDayRange } from '@/utils/inventory'
import { currentMonthDates, formatPercent, SALES_GROUP_LABELS } from '@/utils/report'
import { countColumn, groupColumn, moneyColumn, percentColumn, quantityColumn } from './columns'
import { ExportButton } from './ExportButton'
import { ProductFilter } from './ProductFilter'
import { ReportResults } from './ReportResults'
import type { ReportColumn } from './ReportTable'
import { PeriodFilter, ReportToolbar } from './ReportToolbar'
import { SummaryCards, type SummaryItem } from './SummaryCards'

const PAGE_SIZE = 20
// A business has few users and registers: the filters list them all at once.
const ALL_FOR_FILTER = { page: 1, size: 100 }

interface Filters {
  groupBy: SalesGroupBy
  from: string
  to: string
  userId: string
  registerId: string
  categoryId: string
  product: Product | null
}

function salesColumns(groupBy: SalesGroupBy, withCosts: boolean): ReportColumn<SalesReportRow>[] {
  const group = groupColumn<SalesReportRow>(SALES_GROUP_LABELS[groupBy], groupBy === 'day')
  const sales = countColumn<SalesReportRow>('Ventas', (row) => row.sales_count)
  const total = moneyColumn<SalesReportRow>('Total', (row) => row.total)
  // A payment is not split among products: by method only the paid amount applies.
  if (groupBy === 'payment_method') return [group, sales, total]
  return [
    group,
    sales,
    ...(groupBy === 'product'
      ? [quantityColumn<SalesReportRow>('Cantidad', (row) => row.quantity)]
      : []),
    moneyColumn<SalesReportRow>('Descuentos', (row) => row.discount_total),
    moneyColumn<SalesReportRow>('IVA', (row) => row.tax_total),
    moneyColumn<SalesReportRow>('Sin IVA', (row) => row.net_total),
    total,
    ...(withCosts
      ? [
          moneyColumn<SalesReportRow>('Costo', (row) => row.cost_total),
          moneyColumn<SalesReportRow>('Margen bruto', (row) => row.gross_margin),
          percentColumn<SalesReportRow>('Margen %', (row) => row.margin_percent),
        ]
      : []),
  ]
}

function salesSummary(summary: SalesReportSummary, withCosts: boolean): SummaryItem[] {
  const items: SummaryItem[] = [
    {
      label: 'Total vendido',
      value: formatCurrency(summary.total),
      detail: `${summary.sales_count} ${summary.sales_count === 1 ? 'venta' : 'ventas'}`,
    },
    {
      label: 'Total sin IVA',
      value: formatCurrency(summary.net_total),
      detail: `IVA incluido ${formatCurrency(summary.tax_total)}`,
    },
  ]
  if (withCosts) {
    items.push({
      label: 'Margen bruto',
      value: formatCurrency(summary.gross_margin),
      detail: `${formatPercent(summary.margin_percent)} · Costo ${formatCurrency(summary.cost_total)}`,
    })
  }
  items.push(
    {
      label: 'Ticket promedio',
      value: formatCurrency(summary.average_ticket),
      detail: `Descuentos ${formatCurrency(summary.discount_total)}`,
    },
    {
      label: 'Ventas anuladas',
      value: summary.cancelled_count,
      detail: `${formatCurrency(summary.cancelled_total)} · no suman al total`,
    },
  )
  return items
}

/** Completed sales of a period grouped by day, cashier, register, product, category or
 * payment method. */
export function SalesReport() {
  const { hasPermission } = useAuth()
  const withCosts = hasPermission(PERMISSIONS.productsViewCosts)
  const canListUsers = hasPermission(PERMISSIONS.usersRead)
  const canListRegisters = hasPermission(PERMISSIONS.cashRegistersRead)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<Filters>(() => ({
    groupBy: 'day',
    ...currentMonthDates(),
    userId: '',
    registerId: '',
    categoryId: '',
    product: null,
  }))
  const byMethod = filters.groupBy === 'payment_method'

  const users = useUsers(ALL_FOR_FILTER, { enabled: canListUsers })
  const registers = useCashRegisters(ALL_FOR_FILTER, { enabled: canListRegisters })
  const { categories } = useActiveCategories()
  const reportParams = {
    group_by: filters.groupBy,
    ...businessDayRange(filters.from, filters.to),
    user_id: filters.userId ? Number(filters.userId) : undefined,
    cash_register_id: filters.registerId ? Number(filters.registerId) : undefined,
    category_id: filters.categoryId ? Number(filters.categoryId) : undefined,
    product_id: filters.product?.id,
  }
  const { data, isPending, error, isFetching } = useSalesReport({
    page,
    size: PAGE_SIZE,
    ...reportParams,
  })

  const updateFilters = (changes: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...changes }))
    setPage(1)
  }

  return (
    <div className="space-y-4">
      <ReportToolbar isFetching={isFetching && !isPending}>
        <FilterSelect
          label="Agrupar por"
          value={filters.groupBy}
          onChange={(value) => {
            const groupBy = value as SalesGroupBy
            // Payments are not split among products, so that grouping has no line filters.
            updateFilters(
              groupBy === 'payment_method'
                ? { groupBy, categoryId: '', product: null }
                : { groupBy },
            )
          }}
        >
          {labelEntries(SALES_GROUP_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              Por {label.toLowerCase()}
            </option>
          ))}
        </FilterSelect>
        <PeriodFilter from={filters.from} to={filters.to} onChange={updateFilters} />
        {canListUsers && (
          <FilterSelect
            label="Cajero"
            value={filters.userId}
            onChange={(value) => updateFilters({ userId: value })}
          >
            <option value="">Todos los cajeros</option>
            {users.data?.items.map((user) => (
              <option key={user.id} value={user.id}>
                {user.full_name}
              </option>
            ))}
          </FilterSelect>
        )}
        {canListRegisters && (
          <FilterSelect
            label="Caja"
            value={filters.registerId}
            onChange={(value) => updateFilters({ registerId: value })}
          >
            <option value="">Todas las cajas</option>
            {registers.data?.items.map((register) => (
              <option key={register.id} value={register.id}>
                {register.name}
              </option>
            ))}
          </FilterSelect>
        )}
        {!byMethod && (
          <>
            <FilterSelect
              label="Categoría"
              value={filters.categoryId}
              onChange={(value) => updateFilters({ categoryId: value })}
            >
              <option value="">Todas las categorías</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </FilterSelect>
            <ProductFilter
              includeServices
              product={filters.product}
              onChange={(product) => updateFilters({ product })}
            />
          </>
        )}
        <ExportButton onExport={() => exportSalesReport(reportParams)} />
      </ReportToolbar>

      <ReportResults
        caption={`Ventas por ${SALES_GROUP_LABELS[filters.groupBy].toLowerCase()}`}
        data={data}
        isPending={isPending}
        error={error}
        columns={salesColumns(filters.groupBy, withCosts)}
        renderSummary={(summary) => <SummaryCards items={salesSummary(summary, withCosts)} />}
        onPageChange={setPage}
      />
    </div>
  )
}
