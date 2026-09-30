import { LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { CashSessionDetailModal } from '@/components/cash/CashSessionDetailModal'
import { CashSessionsTable } from '@/components/cash/CashSessionsTable'
import { Alert } from '@/components/ui/Alert'
import { DateFilter, FilterSelect } from '@/components/ui/ListFilters'
import { Pagination } from '@/components/ui/Pagination'
import { useCashRegisters, useCashSessions } from '@/hooks/useCash'
import type { CashSession, CashSessionStatus } from '@/types/cash'
import { labelEntries } from '@/utils/catalog'
import { CASH_SESSION_STATUS_LABELS } from '@/utils/cash'
import { getErrorMessage } from '@/utils/errors'
import { businessDayRange } from '@/utils/inventory'

const PAGE_SIZE = 20
// A business has a handful of registers; one page is enough for the filter.
const REGISTERS_PARAMS = { page: 1, size: 100 }

interface Filters {
  registerId: string
  status: CashSessionStatus | ''
  difference: 'with' | 'without' | ''
  dateFrom: string
  dateTo: string
}

const INITIAL_FILTERS: Filters = {
  registerId: '',
  status: '',
  difference: '',
  dateFrom: '',
  dateTo: '',
}

/** History of every user's cash sessions and their cash counts (supervision). */
function CashSessionsPage() {
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS)
  const [viewing, setViewing] = useState<CashSession | null>(null)
  const registers = useCashRegisters(REGISTERS_PARAMS)

  const { data, isPending, isError, error, isFetching } = useCashSessions({
    page,
    size: PAGE_SIZE,
    cash_register_id: filters.registerId ? Number(filters.registerId) : undefined,
    status: filters.status || undefined,
    has_difference: filters.difference ? filters.difference === 'with' : undefined,
    ...businessDayRange(filters.dateFrom, filters.dateTo),
  })

  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }))
    setPage(1)
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Aperturas de caja</h1>

      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect
          label="Caja"
          value={filters.registerId}
          onChange={(value) => updateFilter('registerId', value)}
        >
          <option value="">Todas las cajas</option>
          {registers.data?.items.map((register) => (
            <option key={register.id} value={register.id}>
              {register.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="Estado"
          value={filters.status}
          onChange={(value) => updateFilter('status', value as Filters['status'])}
        >
          <option value="">Todos los estados</option>
          {labelEntries(CASH_SESSION_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="Arqueo"
          value={filters.difference}
          onChange={(value) => updateFilter('difference', value as Filters['difference'])}
        >
          <option value="">Todos los arqueos</option>
          <option value="with">Con sobrante o faltante</option>
          <option value="without">Sin diferencia</option>
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
      {isPending && <p className="text-sm text-slate-600">Cargando aperturas…</p>}
      {data &&
        (data.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
            No se encontraron aperturas.
          </p>
        ) : (
          <>
            <CashSessionsTable sessions={data.items} onView={setViewing} />
            <Pagination
              page={data.page}
              size={data.size}
              total={data.total}
              onPageChange={setPage}
            />
          </>
        ))}

      {viewing && <CashSessionDetailModal session={viewing} onClose={() => setViewing(null)} />}
    </section>
  )
}

export default CashSessionsPage
