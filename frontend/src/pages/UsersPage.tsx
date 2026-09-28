import { LoaderCircle, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { ResetPasswordModal } from '@/components/users/ResetPasswordModal'
import { UserFormModal } from '@/components/users/UserFormModal'
import { UsersTable } from '@/components/users/UsersTable'
import { useAuth } from '@/hooks/useAuth'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useUsers } from '@/hooks/useUsers'
import { PERMISSIONS } from '@/types/auth'
import type { User } from '@/types/user'
import { getErrorMessage } from '@/utils/errors'

const PAGE_SIZE = 20

type StatusFilter = 'all' | 'active' | 'inactive'
type ModalState = { type: 'create' } | { type: 'edit' | 'password'; user: User } | null

const STATUS_FILTER_VALUES: Record<StatusFilter, boolean | undefined> = {
  all: undefined,
  active: true,
  inactive: false,
}

function UsersPage() {
  const { hasPermission } = useAuth()
  const canManage = hasPermission(PERMISSIONS.usersManage)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [modal, setModal] = useState<ModalState>(null)
  const debouncedSearch = useDebouncedValue(search.trim())

  const { data, isPending, isError, error, isFetching } = useUsers({
    page,
    size: PAGE_SIZE,
    search: debouncedSearch || undefined,
    is_active: STATUS_FILTER_VALUES[statusFilter],
  })

  const closeModal = () => setModal(null)

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Usuarios</h1>
        {canManage && (
          <Button onClick={() => setModal({ type: 'create' })}>
            <Plus aria-hidden="true" className="size-4" />
            Nuevo usuario
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="relative min-w-0 flex-1 basis-60">
          <span className="sr-only">Buscar usuarios</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
            placeholder="Buscar por usuario o nombre…"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm focus:outline-2 focus:outline-slate-900"
          />
        </label>
        <label className="text-sm text-slate-700">
          <span className="sr-only">Estado</span>
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as StatusFilter)
              setPage(1)
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
            <option value="all">Todos</option>
          </select>
        </label>
        {isFetching && !isPending && (
          <LoaderCircle aria-label="Actualizando" className="size-4 animate-spin text-slate-500" />
        )}
      </div>

      {isError && <Alert>{getErrorMessage(error)}</Alert>}
      {isPending && <p className="text-sm text-slate-600">Cargando usuarios…</p>}
      {data &&
        (data.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
            No se encontraron usuarios.
          </p>
        ) : (
          <>
            <UsersTable
              users={data.items}
              canManage={canManage}
              onEdit={(user) => setModal({ type: 'edit', user })}
              onResetPassword={(user) => setModal({ type: 'password', user })}
            />
            <Pagination
              page={data.page}
              size={data.size}
              total={data.total}
              onPageChange={setPage}
            />
          </>
        ))}

      {modal?.type === 'create' && <UserFormModal onClose={closeModal} />}
      {modal?.type === 'edit' && <UserFormModal user={modal.user} onClose={closeModal} />}
      {modal?.type === 'password' && <ResetPasswordModal user={modal.user} onClose={closeModal} />}
    </section>
  )
}

export default UsersPage
