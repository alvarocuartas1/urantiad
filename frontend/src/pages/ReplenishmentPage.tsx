import { LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { AdjustmentFormModal } from '@/components/inventory/AdjustmentFormModal'
import { ReplenishmentTable } from '@/components/inventory/ReplenishmentTable'
import { Alert } from '@/components/ui/Alert'
import { FilterSelect, SearchInput } from '@/components/ui/ListFilters'
import { Pagination } from '@/components/ui/Pagination'
import { useAuth } from '@/hooks/useAuth'
import { useActiveCategories } from '@/hooks/useCategories'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useReplenishment } from '@/hooks/useInventory'
import { PERMISSIONS } from '@/types/auth'
import type { StockStatus } from '@/types/catalog'
import type { ReplenishmentItem } from '@/types/inventory'
import { STOCK_STATUS_LABELS } from '@/utils/catalog'
import { getErrorMessage } from '@/utils/errors'

const PAGE_SIZE = 20

/** Levels that require replenishment ("ok" never appears in this list). */
const REPLENISHMENT_STATUSES: StockStatus[] = ['out_of_stock', 'critical', 'low']

function ReplenishmentPage() {
  const { hasPermission } = useAuth()
  const canAdjust = hasPermission(PERMISSIONS.inventoryAdjust)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [stockStatus, setStockStatus] = useState<StockStatus | ''>('')
  const [adjusting, setAdjusting] = useState<ReplenishmentItem | null>(null)
  const debouncedSearch = useDebouncedValue(search.trim())
  const { categories } = useActiveCategories()

  const { data, isPending, isError, error, isFetching } = useReplenishment({
    page,
    size: PAGE_SIZE,
    search: debouncedSearch || undefined,
    category_id: categoryId ? Number(categoryId) : undefined,
    stock_status: stockStatus || undefined,
  })

  const withPageReset =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value)
      setPage(1)
    }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Productos que requieren reposición
        </h1>
        <p className="text-sm text-slate-600">
          Productos activos con stock en o por debajo del punto de reorden. Sugerencia de compra:
          stock objetivo − stock actual.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <SearchInput
          label="Buscar productos"
          value={search}
          placeholder="Buscar por nombre, SKU o código de barras…"
          onChange={withPageReset(setSearch)}
        />
        <FilterSelect label="Categoría" value={categoryId} onChange={withPageReset(setCategoryId)}>
          <option value="">Todas las categorías</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="Nivel de stock"
          value={stockStatus}
          onChange={withPageReset((value: string) => setStockStatus(value as StockStatus | ''))}
        >
          <option value="">Todos los niveles</option>
          {REPLENISHMENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STOCK_STATUS_LABELS[status]}
            </option>
          ))}
        </FilterSelect>
        {isFetching && !isPending && (
          <LoaderCircle aria-label="Actualizando" className="size-4 animate-spin text-slate-500" />
        )}
      </div>

      {isError && <Alert>{getErrorMessage(error)}</Alert>}
      {isPending && <p className="text-sm text-slate-600">Cargando productos…</p>}
      {data &&
        (data.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
            No hay productos que requieran reposición.
          </p>
        ) : (
          <>
            <ReplenishmentTable
              items={data.items}
              onAdjust={canAdjust ? setAdjusting : undefined}
            />
            <Pagination
              page={data.page}
              size={data.size}
              total={data.total}
              onPageChange={setPage}
            />
          </>
        ))}

      {adjusting && <AdjustmentFormModal product={adjusting} onClose={() => setAdjusting(null)} />}
    </section>
  )
}

export default ReplenishmentPage
