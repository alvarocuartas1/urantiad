import { LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { AuditLogDetailModal } from '@/components/audit/AuditLogDetailModal'
import { AuditLogsTable } from '@/components/audit/AuditLogsTable'
import { Alert } from '@/components/ui/Alert'
import { DateFilter, FilterSelect, SearchInput } from '@/components/ui/ListFilters'
import { Pagination } from '@/components/ui/Pagination'
import { useAuditLogs } from '@/hooks/useAudit'
import { useAuth } from '@/hooks/useAuth'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useUsers } from '@/hooks/useUsers'
import type { AuditAction, AuditEntity, AuditLog } from '@/types/audit'
import { PERMISSIONS } from '@/types/auth'
import { AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS, auditActionsOf } from '@/utils/audit'
import { labelEntries } from '@/utils/catalog'
import { getErrorMessage } from '@/utils/errors'
import { businessDayRange } from '@/utils/inventory'

const PAGE_SIZE = 20
// Enough for the users of a single business; the filter lists them all at once.
const USERS_FOR_FILTER = { page: 1, size: 100 }

interface Filters {
  entityType: AuditEntity | ''
  action: AuditAction | ''
  userId: string
  dateFrom: string
  dateTo: string
}

const INITIAL_FILTERS: Filters = {
  entityType: '',
  action: '',
  userId: '',
  dateFrom: '',
  dateTo: '',
}

/** Audit log: who changed what and when (administrator only). */
function AuditLogsPage() {
  const { hasPermission } = useAuth()
  const canListUsers = hasPermission(PERMISSIONS.usersRead)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS)
  const [selected, setSelected] = useState<AuditLog | null>(null)
  const debouncedSearch = useDebouncedValue(search.trim())

  const users = useUsers(USERS_FOR_FILTER, { enabled: canListUsers })
  const { data, isPending, isError, error, isFetching } = useAuditLogs({
    page,
    size: PAGE_SIZE,
    search: debouncedSearch || undefined,
    entity_type: filters.entityType || undefined,
    action: filters.action || undefined,
    user_id: filters.userId ? Number(filters.userId) : undefined,
    ...businessDayRange(filters.dateFrom, filters.dateTo),
  })

  const updateFilters = (changes: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...changes }))
    setPage(1)
  }

  const actions = filters.entityType
    ? auditActionsOf(filters.entityType)
    : labelEntries(AUDIT_ACTION_LABELS).map(([action]) => action)

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Auditoría</h1>

      <div className="flex flex-wrap items-end gap-3">
        <SearchInput
          label="Buscar en la auditoría"
          value={search}
          placeholder="Buscar por nombre: SKU, consecutivo, proveedor…"
          onChange={(value) => {
            setSearch(value)
            setPage(1)
          }}
        />
        <FilterSelect
          label="Área"
          value={filters.entityType}
          // An action belongs to one area, so changing the area clears it.
          onChange={(value) => updateFilters({ entityType: value as AuditEntity | '', action: '' })}
        >
          <option value="">Todas las áreas</option>
          {labelEntries(AUDIT_ENTITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="Acción"
          value={filters.action}
          onChange={(value) => updateFilters({ action: value as AuditAction | '' })}
        >
          <option value="">Todas las acciones</option>
          {actions.map((action) => (
            <option key={action} value={action}>
              {AUDIT_ACTION_LABELS[action]}
            </option>
          ))}
        </FilterSelect>
        {canListUsers && (
          <FilterSelect
            label="Usuario"
            value={filters.userId}
            onChange={(value) => updateFilters({ userId: value })}
          >
            <option value="">Todos los usuarios</option>
            {users.data?.items.map((user) => (
              <option key={user.id} value={user.id}>
                {user.full_name}
              </option>
            ))}
          </FilterSelect>
        )}
        <DateFilter
          label="Desde"
          value={filters.dateFrom}
          onChange={(value) => updateFilters({ dateFrom: value })}
        />
        <DateFilter
          label="Hasta"
          value={filters.dateTo}
          onChange={(value) => updateFilters({ dateTo: value })}
        />
        {isFetching && !isPending && (
          <LoaderCircle aria-label="Actualizando" className="size-4 animate-spin text-slate-500" />
        )}
      </div>

      {isError && <Alert>{getErrorMessage(error)}</Alert>}
      {isPending && <p className="text-sm text-slate-600">Cargando auditoría…</p>}
      {data &&
        (data.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
            No se encontraron registros de auditoría.
          </p>
        ) : (
          <>
            <AuditLogsTable logs={data.items} onSelect={setSelected} />
            <Pagination
              page={data.page}
              size={data.size}
              total={data.total}
              onPageChange={setPage}
            />
          </>
        ))}

      {selected && <AuditLogDetailModal log={selected} onClose={() => setSelected(null)} />}
    </section>
  )
}

export default AuditLogsPage
