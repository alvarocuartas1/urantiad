import { LoaderCircle, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { AdjustmentFormModal } from '@/components/inventory/AdjustmentFormModal'
import { MovementsTable } from '@/components/inventory/MovementsTable'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { DateFilter, FilterSelect } from '@/components/ui/ListFilters'
import { Pagination } from '@/components/ui/Pagination'
import { useAuth } from '@/hooks/useAuth'
import { useMovements } from '@/hooks/useInventory'
import { PERMISSIONS } from '@/types/auth'
import type { MovementType } from '@/types/inventory'
import { labelEntries } from '@/utils/catalog'
import { getErrorMessage } from '@/utils/errors'
import { MOVEMENT_TYPE_LABELS, businessDayRange } from '@/utils/inventory'

const PAGE_SIZE = 20

interface Filters {
  movementType: MovementType | ''
  dateFrom: string
  dateTo: string
}

const INITIAL_FILTERS: Filters = { movementType: '', dateFrom: '', dateTo: '' }

function InventoryMovementsPage() {
  const { hasPermission } = useAuth()
  const canAdjust = hasPermission(PERMISSIONS.inventoryAdjust)
  const showCosts = hasPermission(PERMISSIONS.productsViewCosts)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS)
  const [adjusting, setAdjusting] = useState(false)

  const { data, isPending, isError, error, isFetching } = useMovements({
    page,
    size: PAGE_SIZE,
    movement_type: filters.movementType || undefined,
    ...businessDayRange(filters.dateFrom, filters.dateTo),
  })

  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }))
    setPage(1)
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Movimientos de inventario
        </h1>
        {canAdjust && (
          <Button onClick={() => setAdjusting(true)}>
            <SlidersHorizontal aria-hidden="true" className="size-4" />
            Nuevo ajuste
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect
          label="Tipo de movimiento"
          value={filters.movementType}
          onChange={(value) => updateFilter('movementType', value as Filters['movementType'])}
        >
          <option value="">Todos los tipos</option>
          {labelEntries(MOVEMENT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </FilterSelect>
        <DateFilter
          label="Desde"
          value={filters.dateFrom}
          onChange={(value) => updateFilter('dateFrom', value)}
        />
        <DateFilter
          label="Hasta"
          value={filters.dateTo}
          onChange={(value) => updateFilter('dateTo', value)}
        />
        {isFetching && !isPending && (
          <LoaderCircle aria-label="Actualizando" className="size-4 animate-spin text-slate-500" />
        )}
      </div>

      {isError && <Alert>{getErrorMessage(error)}</Alert>}
      {isPending && <p className="text-sm text-slate-600">Cargando movimientos…</p>}
      {data &&
        (data.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
            No se encontraron movimientos.
          </p>
        ) : (
          <>
            <MovementsTable movements={data.items} showCosts={showCosts} />
            <Pagination
              page={data.page}
              size={data.size}
              total={data.total}
              onPageChange={setPage}
            />
          </>
        ))}

      {adjusting && <AdjustmentFormModal onClose={() => setAdjusting(false)} />}
    </section>
  )
}

export default InventoryMovementsPage
