import { useState } from 'react'
import { FilterSelect } from '@/components/ui/ListFilters'
import { useAuth } from '@/hooks/useAuth'
import { useActiveCategories } from '@/hooks/useCategories'
import { usePurchasesReport } from '@/hooks/useReports'
import { useSuppliers } from '@/hooks/useSuppliers'
import { PERMISSIONS } from '@/types/auth'
import type { Product } from '@/types/catalog'
import type { PurchasesGroupBy, PurchasesReportRow, PurchasesReportSummary } from '@/types/report'
import { labelEntries } from '@/utils/catalog'
import { formatCurrency } from '@/utils/format'
import { businessDayRange } from '@/utils/inventory'
import { currentMonthDates, PURCHASES_GROUP_LABELS } from '@/utils/report'
import { countColumn, groupColumn, moneyColumn, quantityColumn } from './columns'
import { ProductFilter } from './ProductFilter'
import { ReportResults } from './ReportResults'
import type { ReportColumn } from './ReportTable'
import { PeriodFilter, ReportToolbar } from './ReportToolbar'
import { SummaryCards, type SummaryItem } from './SummaryCards'

const PAGE_SIZE = 20
const SUPPLIERS_FOR_FILTER = { page: 1, size: 100 }

interface Filters {
  groupBy: PurchasesGroupBy
  from: string
  to: string
  supplierId: string
  categoryId: string
  product: Product | null
}

function purchasesColumns(groupBy: PurchasesGroupBy): ReportColumn<PurchasesReportRow>[] {
  return [
    groupColumn<PurchasesReportRow>(PURCHASES_GROUP_LABELS[groupBy], groupBy === 'day'),
    countColumn<PurchasesReportRow>('Compras', (row) => row.purchases_count),
    ...(groupBy === 'product'
      ? [quantityColumn<PurchasesReportRow>('Cantidad', (row) => row.quantity)]
      : []),
    moneyColumn<PurchasesReportRow>('Descuentos', (row) => row.discount_total),
    moneyColumn<PurchasesReportRow>('Subtotal sin IVA', (row) => row.subtotal),
    moneyColumn<PurchasesReportRow>('IVA', (row) => row.tax_total),
    moneyColumn<PurchasesReportRow>('Total', (row) => row.total),
  ]
}

function purchasesSummary(summary: PurchasesReportSummary): SummaryItem[] {
  return [
    {
      label: 'Total comprado',
      value: formatCurrency(summary.total),
      detail: `${summary.purchases_count} ${summary.purchases_count === 1 ? 'compra confirmada' : 'compras confirmadas'}`,
    },
    {
      label: 'Subtotal sin IVA',
      value: formatCurrency(summary.subtotal),
      detail: `Descuentos ${formatCurrency(summary.discount_total)}`,
    },
    { label: 'IVA', value: formatCurrency(summary.tax_total) },
    {
      label: 'Compras anuladas',
      value: summary.cancelled_count,
      detail: `${formatCurrency(summary.cancelled_total)} · no suman al total`,
    },
  ]
}

/** Confirmed purchases of a period (by confirmation date) grouped by supplier, product,
 * category or day. */
export function PurchasesReport() {
  const { hasPermission } = useAuth()
  const canListSuppliers = hasPermission(PERMISSIONS.suppliersRead)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<Filters>(() => ({
    groupBy: 'supplier',
    ...currentMonthDates(),
    supplierId: '',
    categoryId: '',
    product: null,
  }))

  const suppliers = useSuppliers(SUPPLIERS_FOR_FILTER, { enabled: canListSuppliers })
  const { categories } = useActiveCategories()
  const { data, isPending, error, isFetching } = usePurchasesReport({
    page,
    size: PAGE_SIZE,
    group_by: filters.groupBy,
    ...businessDayRange(filters.from, filters.to),
    supplier_id: filters.supplierId ? Number(filters.supplierId) : undefined,
    category_id: filters.categoryId ? Number(filters.categoryId) : undefined,
    product_id: filters.product?.id,
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
          onChange={(value) => updateFilters({ groupBy: value as PurchasesGroupBy })}
        >
          {labelEntries(PURCHASES_GROUP_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              Por {label.toLowerCase()}
            </option>
          ))}
        </FilterSelect>
        <PeriodFilter from={filters.from} to={filters.to} onChange={updateFilters} />
        {canListSuppliers && (
          <FilterSelect
            label="Proveedor"
            value={filters.supplierId}
            onChange={(value) => updateFilters({ supplierId: value })}
          >
            <option value="">Todos los proveedores</option>
            {suppliers.data?.items.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </FilterSelect>
        )}
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
          product={filters.product}
          onChange={(product) => updateFilters({ product })}
        />
      </ReportToolbar>

      <ReportResults
        caption={`Compras por ${PURCHASES_GROUP_LABELS[filters.groupBy].toLowerCase()}`}
        data={data}
        isPending={isPending}
        error={error}
        columns={purchasesColumns(filters.groupBy)}
        renderSummary={(summary) => <SummaryCards items={purchasesSummary(summary)} />}
        onPageChange={setPage}
      />
    </div>
  )
}
