import { LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { SalesTable } from '@/components/sales/SalesTable'
import { Alert } from '@/components/ui/Alert'
import { DateFilter, FilterSelect, SearchInput } from '@/components/ui/ListFilters'
import { Pagination } from '@/components/ui/Pagination'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useSales } from '@/hooks/useSales'
import type { SaleStatus } from '@/types/sale'
import { labelEntries } from '@/utils/catalog'
import { getErrorMessage } from '@/utils/errors'
import { businessDayRange } from '@/utils/inventory'
import { SALE_STATUS_LABELS } from '@/utils/sale'

const PAGE_SIZE = 20

interface Filters {
  status: SaleStatus | ''
  dateFrom: string
  dateTo: string
}

const INITIAL_FILTERS: Filters = { status: '', dateFrom: '', dateTo: '' }

/** Sales history. Cashiers see their own sales; the administrator sees all of them. */
function SalesPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS)
  const debouncedSearch = useDebouncedValue(search.trim())

  const { data, isPending, isError, error, isFetching } = useSales({
    page,
    size: PAGE_SIZE,
    search: debouncedSearch || undefined,
    status: filters.status || undefined,
    ...businessDayRange(filters.dateFrom, filters.dateTo),
  })

  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }))
    setPage(1)
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Ventas</h1>

      <div className="flex flex-wrap items-end gap-3">
        <SearchInput
          label="Buscar ventas"
          value={search}
          placeholder="Buscar por consecutivo o cliente…"
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
          {labelEntries(SALE_STATUS_LABELS).map(([value, label]) => (
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
      {isPending && <p className="text-sm text-slate-600">Cargando ventas…</p>}
      {data &&
        (data.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
            No se encontraron ventas.
          </p>
        ) : (
          <>
            <SalesTable sales={data.items} />
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

export default SalesPage
