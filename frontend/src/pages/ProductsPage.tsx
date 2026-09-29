import { LoaderCircle, Plus } from 'lucide-react'
import { useState } from 'react'
import { AdjustmentFormModal } from '@/components/inventory/AdjustmentFormModal'
import { ProductMovementsModal } from '@/components/inventory/ProductMovementsModal'
import { PriceHistoryModal } from '@/components/products/PriceHistoryModal'
import { ProductFormModal } from '@/components/products/ProductFormModal'
import { ProductsTable } from '@/components/products/ProductsTable'
import { ProductSuppliersModal } from '@/components/suppliers/ProductSuppliersModal'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { FilterSelect, SearchInput } from '@/components/ui/ListFilters'
import { Pagination } from '@/components/ui/Pagination'
import { useAuth } from '@/hooks/useAuth'
import { useActiveCategories } from '@/hooks/useCategories'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useProducts } from '@/hooks/useProducts'
import { PERMISSIONS } from '@/types/auth'
import type { Product, ProductType, StockStatus } from '@/types/catalog'
import { PRODUCT_TYPE_LABELS, STOCK_STATUS_LABELS, labelEntries } from '@/utils/catalog'
import { getErrorMessage } from '@/utils/errors'
import { ACTIVE_FILTER_VALUES, type ActiveFilter } from '@/utils/filters'

const PAGE_SIZE = 20

type ModalState =
  | { type: 'create' }
  | { type: 'edit' | 'prices' | 'adjust' | 'movements' | 'suppliers'; product: Product }
  | null

interface Filters {
  categoryId: string
  productType: ProductType | ''
  active: ActiveFilter
  stockStatus: StockStatus | ''
}

const INITIAL_FILTERS: Filters = {
  categoryId: '',
  productType: '',
  active: 'active',
  stockStatus: '',
}

function ProductsPage() {
  const { hasPermission } = useAuth()
  const canManage = hasPermission(PERMISSIONS.productsManage)
  const showCosts = hasPermission(PERMISSIONS.productsViewCosts)
  const canAdjust = hasPermission(PERMISSIONS.inventoryAdjust)
  const canReadInventory = hasPermission(PERMISSIONS.inventoryRead)
  const canReadSuppliers = hasPermission(PERMISSIONS.suppliersRead)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS)
  const [modal, setModal] = useState<ModalState>(null)
  const debouncedSearch = useDebouncedValue(search.trim())
  const { categories } = useActiveCategories()

  const { data, isPending, isError, error, isFetching } = useProducts({
    page,
    size: PAGE_SIZE,
    search: debouncedSearch || undefined,
    category_id: filters.categoryId ? Number(filters.categoryId) : undefined,
    type: filters.productType || undefined,
    is_active: ACTIVE_FILTER_VALUES[filters.active],
    stock_status: filters.stockStatus || undefined,
  })

  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }))
    setPage(1)
  }
  const closeModal = () => setModal(null)

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Productos</h1>
        {canManage && (
          <Button onClick={() => setModal({ type: 'create' })}>
            <Plus aria-hidden="true" className="size-4" />
            Nuevo producto
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <SearchInput
          label="Buscar productos"
          value={search}
          placeholder="Buscar por nombre, SKU o código de barras…"
          onChange={(value) => {
            setSearch(value)
            setPage(1)
          }}
        />
        <FilterSelect
          label="Categoría"
          value={filters.categoryId}
          onChange={(value) => updateFilter('categoryId', value)}
        >
          <option value="">Todas las categorías</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="Tipo"
          value={filters.productType}
          onChange={(value) => updateFilter('productType', value as Filters['productType'])}
        >
          <option value="">Productos y servicios</option>
          {labelEntries(PRODUCT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}s
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="Nivel de stock"
          value={filters.stockStatus}
          onChange={(value) => updateFilter('stockStatus', value as Filters['stockStatus'])}
        >
          <option value="">Cualquier nivel</option>
          {labelEntries(STOCK_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="Estado"
          value={filters.active}
          onChange={(value) => updateFilter('active', value as ActiveFilter)}
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
      {isPending && <p className="text-sm text-slate-600">Cargando productos…</p>}
      {data &&
        (data.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
            No se encontraron productos.
          </p>
        ) : (
          <>
            <ProductsTable
              products={data.items}
              canManage={canManage}
              showCosts={showCosts}
              onEdit={(product) => setModal({ type: 'edit', product })}
              onPriceHistory={(product) => setModal({ type: 'prices', product })}
              onAdjust={canAdjust ? (product) => setModal({ type: 'adjust', product }) : undefined}
              onMovements={
                canReadInventory ? (product) => setModal({ type: 'movements', product }) : undefined
              }
              onSuppliers={
                canReadSuppliers ? (product) => setModal({ type: 'suppliers', product }) : undefined
              }
            />
            <Pagination
              page={data.page}
              size={data.size}
              total={data.total}
              onPageChange={setPage}
            />
          </>
        ))}

      {modal?.type === 'create' && <ProductFormModal onClose={closeModal} />}
      {modal?.type === 'edit' && <ProductFormModal product={modal.product} onClose={closeModal} />}
      {modal?.type === 'prices' && (
        <PriceHistoryModal product={modal.product} onClose={closeModal} />
      )}
      {modal?.type === 'adjust' && (
        <AdjustmentFormModal product={modal.product} onClose={closeModal} />
      )}
      {modal?.type === 'movements' && (
        <ProductMovementsModal product={modal.product} onClose={closeModal} />
      )}
      {modal?.type === 'suppliers' && (
        <ProductSuppliersModal product={modal.product} onClose={closeModal} />
      )}
    </section>
  )
}

export default ProductsPage
