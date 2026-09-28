import { LoaderCircle, Plus } from 'lucide-react'
import { useState } from 'react'
import { CategoriesTable } from '@/components/categories/CategoriesTable'
import { CategoryFormModal } from '@/components/categories/CategoryFormModal'
import { DeleteCategoryModal } from '@/components/categories/DeleteCategoryModal'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { FilterSelect, SearchInput } from '@/components/ui/ListFilters'
import { Pagination } from '@/components/ui/Pagination'
import { useAuth } from '@/hooks/useAuth'
import { useCategories } from '@/hooks/useCategories'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { PERMISSIONS } from '@/types/auth'
import type { Category } from '@/types/catalog'
import { getErrorMessage } from '@/utils/errors'
import { ACTIVE_FILTER_VALUES, type ActiveFilter } from '@/utils/filters'

const PAGE_SIZE = 20

type ModalState = { type: 'create' } | { type: 'edit' | 'delete'; category: Category } | null

function CategoriesPage() {
  const { hasPermission } = useAuth()
  const canManage = hasPermission(PERMISSIONS.productsManage)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('active')
  const [modal, setModal] = useState<ModalState>(null)
  const debouncedSearch = useDebouncedValue(search.trim())

  const { data, isPending, isError, error, isFetching } = useCategories({
    page,
    size: PAGE_SIZE,
    search: debouncedSearch || undefined,
    is_active: ACTIVE_FILTER_VALUES[activeFilter],
  })

  const closeModal = () => setModal(null)

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Categorías</h1>
        {canManage && (
          <Button onClick={() => setModal({ type: 'create' })}>
            <Plus aria-hidden="true" className="size-4" />
            Nueva categoría
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <SearchInput
          label="Buscar categorías"
          value={search}
          placeholder="Buscar por nombre…"
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
          <option value="active">Activas</option>
          <option value="inactive">Inactivas</option>
          <option value="all">Todas</option>
        </FilterSelect>
        {isFetching && !isPending && (
          <LoaderCircle aria-label="Actualizando" className="size-4 animate-spin text-slate-500" />
        )}
      </div>

      {isError && <Alert>{getErrorMessage(error)}</Alert>}
      {isPending && <p className="text-sm text-slate-600">Cargando categorías…</p>}
      {data &&
        (data.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
            No se encontraron categorías.
          </p>
        ) : (
          <>
            <CategoriesTable
              categories={data.items}
              canManage={canManage}
              onEdit={(category) => setModal({ type: 'edit', category })}
              onDelete={(category) => setModal({ type: 'delete', category })}
            />
            <Pagination
              page={data.page}
              size={data.size}
              total={data.total}
              onPageChange={setPage}
            />
          </>
        ))}

      {modal?.type === 'create' && <CategoryFormModal onClose={closeModal} />}
      {modal?.type === 'edit' && (
        <CategoryFormModal category={modal.category} onClose={closeModal} />
      )}
      {modal?.type === 'delete' && (
        <DeleteCategoryModal category={modal.category} onClose={closeModal} />
      )}
    </section>
  )
}

export default CategoriesPage
