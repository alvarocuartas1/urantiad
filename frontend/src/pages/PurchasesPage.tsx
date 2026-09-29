import { LoaderCircle, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { PurchasesTable } from '@/components/purchases/PurchasesTable'
import { Alert } from '@/components/ui/Alert'
import { DateFilter, FilterSelect, SearchInput } from '@/components/ui/ListFilters'
import { Pagination } from '@/components/ui/Pagination'
import { useAuth } from '@/hooks/useAuth'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { usePurchases } from '@/hooks/usePurchases'
import { useSuppliers } from '@/hooks/useSuppliers'
import { PERMISSIONS } from '@/types/auth'
import type { PurchaseStatus } from '@/types/purchase'
import { labelEntries } from '@/utils/catalog'
import { getErrorMessage } from '@/utils/errors'
import { businessDayRange } from '@/utils/inventory'
import { PURCHASE_STATUS_LABELS } from '@/utils/purchase'

const PAGE_SIZE = 20
const SUPPLIER_LIMIT = 100

interface Filters {
  status: PurchaseStatus | ''
  supplierId: string
  dateFrom: string
  dateTo: string
}

const INITIAL_FILTERS: Filters = { status: '', supplierId: '', dateFrom: '', dateTo: '' }

function PurchasesPage() {
  const { hasPermission } = useAuth()
  const canManage = hasPermission(PERMISSIONS.purchasesManage)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS)
  const debouncedSearch = useDebouncedValue(search.trim())
  const { data: suppliers } = useSuppliers({ page: 1, size: SUPPLIER_LIMIT })

  const { data, isPending, isError, error, isFetching } = usePurchases({
    page,
    size: PAGE_SIZE,
    search: debouncedSearch || undefined,
    status: filters.status || undefined,
    supplier_id: filters.supplierId ? Number(filters.supplierId) : undefined,
    ...businessDayRange(filters.dateFrom, filters.dateTo),
  })

  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }))
    setPage(1)
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Compras</h1>
        {canManage && (
          <Link
            to="/compras/nueva"
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            <Plus aria-hidden="true" className="size-4" />
            Nueva compra
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <SearchInput
          label="Buscar compras"
          value={search}
          placeholder="Buscar por consecutivo, factura o proveedor…"
          onChange={(value) => {
            setSearch(value)
            setPage(1)
          }}
        />
        <FilterSelect
          label="Estado"
          value={filters.status}
          onChange={(value) => updateFilter('status', value as Filters['status'])}
        >
          <option value="">Todos los estados</option>
          {labelEntries(PURCHASE_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="Proveedor"
          value={filters.supplierId}
          onChange={(value) => updateFilter('supplierId', value)}
        >
          <option value="">Todos los proveedores</option>
          {suppliers?.items.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
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
      {isPending && <p className="text-sm text-slate-600">Cargando compras…</p>}
      {data &&
        (data.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
            No se encontraron compras.
          </p>
        ) : (
          <>
            <PurchasesTable purchases={data.items} />
            <Pagination
              page={data.page}
              size={data.size}
              total={data.total}
              onPageChange={setPage}
            />
          </>
        ))}
    </section>
  )
}

export default PurchasesPage
