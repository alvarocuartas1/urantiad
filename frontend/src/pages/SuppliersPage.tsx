import { LoaderCircle, Plus } from 'lucide-react'
import { useState } from 'react'
import { SupplierFormModal } from '@/components/suppliers/SupplierFormModal'
import { SupplierProductsModal } from '@/components/suppliers/SupplierProductsModal'
import { SuppliersTable } from '@/components/suppliers/SuppliersTable'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { FilterSelect, SearchInput } from '@/components/ui/ListFilters'
import { Pagination } from '@/components/ui/Pagination'
import { useAuth } from '@/hooks/useAuth'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useSuppliers } from '@/hooks/useSuppliers'
import { PERMISSIONS } from '@/types/auth'
import type { Supplier } from '@/types/supplier'
import { getErrorMessage } from '@/utils/errors'
import { ACTIVE_FILTER_VALUES, type ActiveFilter } from '@/utils/filters'

const PAGE_SIZE = 20

type ModalState = { type: 'create' } | { type: 'edit' | 'products'; supplier: Supplier } | null

function SuppliersPage() {
  const { hasPermission } = useAuth()
  const canManage = hasPermission(PERMISSIONS.suppliersManage)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('active')
  const [modal, setModal] = useState<ModalState>(null)
  const debouncedSearch = useDebouncedValue(search.trim())

  const { data, isPending, isError, error, isFetching } = useSuppliers({
    page,
    size: PAGE_SIZE,
    search: debouncedSearch || undefined,
    is_active: ACTIVE_FILTER_VALUES[activeFilter],
  })

  const closeModal = () => setModal(null)

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Proveedores</h1>
        {canManage && (
          <Button onClick={() => setModal({ type: 'create' })}>
            <Plus aria-hidden="true" className="size-4" />
            Nuevo proveedor
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <SearchInput
          label="Buscar proveedores"
          value={search}
          placeholder="Buscar por nombre, documento o contacto…"
          onChange={(value) => {
            setSearch(value)
            setPage(1)
          }}
        />
        <FilterSelect
          label="Estado"
          value={activeFilter}
          onChange={(value) => {
            setActiveFilter(value as ActiveFilter)
            setPage(1)
          }}
        >
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
          <option value="all">Todos</option>
        </FilterSelect>
        {isFetching && !isPending && (
          <LoaderCircle aria-label="Actualizando" className="size-4 animate-spin text-slate-500" />
        )}
      </div>

      {isError && <Alert>{getErrorMessage(error)}</Alert>}
      {isPending && <p className="text-sm text-slate-600">Cargando proveedores…</p>}
      {data &&
        (data.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
            No se encontraron proveedores.
          </p>
        ) : (
          <>
            <SuppliersTable
              suppliers={data.items}
              canManage={canManage}
              onEdit={(supplier) => setModal({ type: 'edit', supplier })}
              onProducts={(supplier) => setModal({ type: 'products', supplier })}
            />
            <Pagination
              page={data.page}
              size={data.size}
              total={data.total}
              onPageChange={setPage}
            />
          </>
        ))}

      {modal?.type === 'create' && <SupplierFormModal onClose={closeModal} />}
      {modal?.type === 'edit' && (
        <SupplierFormModal supplier={modal.supplier} onClose={closeModal} />
      )}
      {modal?.type === 'products' && (
        <SupplierProductsModal supplier={modal.supplier} onClose={closeModal} />
      )}
    </section>
  )
}

export default SuppliersPage
