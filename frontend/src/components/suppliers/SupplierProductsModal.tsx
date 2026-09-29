import { LoaderCircle, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { ProductPicker } from '@/components/products/ProductPicker'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { SearchInput } from '@/components/ui/ListFilters'
import { Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAuth } from '@/hooks/useAuth'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useRemoveSupplierProduct, useSupplierProducts } from '@/hooks/useSuppliers'
import { PERMISSIONS } from '@/types/auth'
import type { Supplier, SupplierProduct } from '@/types/supplier'
import { getErrorMessage } from '@/utils/errors'
import { SupplierProductForm } from './SupplierProductForm'
import { SupplierProductsTable } from './SupplierProductsTable'

const PAGE_SIZE = 10

type ProductToLink = Pick<SupplierProduct['product'], 'id' | 'sku' | 'name'>

// One modal with several views: nested modals would both react to Escape.
type View =
  | { type: 'list' }
  | { type: 'add'; product?: ProductToLink }
  | { type: 'edit' | 'remove'; link: SupplierProduct }

const TITLES: Record<View['type'], string> = {
  list: 'Productos',
  add: 'Asociar producto',
  edit: 'Editar producto',
  remove: 'Quitar producto',
}

interface SupplierProductsModalProps {
  supplier: Supplier
  onClose: () => void
}

export function SupplierProductsModal({ supplier, onClose }: SupplierProductsModalProps) {
  const [view, setView] = useState<View>({ type: 'list' })
  const showList = () => setView({ type: 'list' })

  return (
    <Modal title={`${TITLES[view.type]} · ${supplier.name}`} onClose={onClose} size="lg">
      {view.type === 'list' && <LinksList supplier={supplier} onNavigate={setView} />}
      {view.type === 'add' &&
        (view.product ? (
          <SupplierProductForm
            key={view.product.id}
            supplierId={supplier.id}
            product={view.product}
            onChangeProduct={() => setView({ type: 'add' })}
            onDone={showList}
          />
        ) : (
          <div className="space-y-4">
            <ProductPicker autoFocus onSelect={(product) => setView({ type: 'add', product })} />
            <div className="flex justify-end">
              <Button variant="secondary" onClick={showList}>
                Volver
              </Button>
            </div>
          </div>
        ))}
      {view.type === 'edit' && (
        <SupplierProductForm
          supplierId={supplier.id}
          product={view.link.product}
          link={view.link}
          onDone={showList}
        />
      )}
      {view.type === 'remove' && (
        <RemoveLink supplierId={supplier.id} link={view.link} onDone={showList} />
      )}
    </Modal>
  )
}

interface LinksListProps {
  supplier: Supplier
  onNavigate: (view: View) => void
}

function LinksList({ supplier, onNavigate }: LinksListProps) {
  const { hasPermission } = useAuth()
  const canManage = hasPermission(PERMISSIONS.suppliersManage)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search.trim())
  const { data, isPending, isError, error, isFetching } = useSupplierProducts(supplier.id, {
    page,
    size: PAGE_SIZE,
    search: debouncedSearch || undefined,
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <SearchInput
          label="Buscar productos del proveedor"
          value={search}
          placeholder="Nombre, SKU o código del proveedor…"
          onChange={(value) => {
            setSearch(value)
            setPage(1)
          }}
        />
        {isFetching && !isPending && (
          <LoaderCircle aria-label="Actualizando" className="size-4 animate-spin text-slate-500" />
        )}
        {canManage && supplier.is_active && (
          <Button className="ml-auto" onClick={() => onNavigate({ type: 'add' })}>
            <Plus aria-hidden="true" className="size-4" />
            Asociar producto
          </Button>
        )}
      </div>
      {canManage && !supplier.is_active && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
          <StatusBadge size="sm" tone="neutral" label="Proveedor inactivo" />
          Actívelo para asociarle productos.
        </p>
      )}

      {isError && <Alert>{getErrorMessage(error)}</Alert>}
      {isPending && <p className="text-sm text-slate-600">Cargando productos…</p>}
      {data &&
        (data.items.length === 0 ? (
          <p className="text-sm text-slate-600">
            {debouncedSearch
              ? 'No se encontraron productos.'
              : 'Este proveedor aún no tiene productos asociados.'}
          </p>
        ) : (
          <>
            <SupplierProductsTable
              links={data.items}
              show="product"
              onEdit={canManage ? (link) => onNavigate({ type: 'edit', link }) : undefined}
              onRemove={canManage ? (link) => onNavigate({ type: 'remove', link }) : undefined}
            />
            <Pagination
              page={data.page}
              size={data.size}
              total={data.total}
              onPageChange={setPage}
            />
          </>
        ))}
    </div>
  )
}

interface RemoveLinkProps {
  supplierId: number
  link: SupplierProduct
  onDone: () => void
}

function RemoveLink({ supplierId, link, onDone }: RemoveLinkProps) {
  const mutation = useRemoveSupplierProduct(supplierId)

  return (
    <div className="space-y-4">
      {mutation.isError && <Alert>{getErrorMessage(mutation.error)}</Alert>}
      <p className="text-sm text-slate-700">
        ¿Quitar <strong>{link.product.name}</strong> de los productos de este proveedor? Se pierden
        su código y su último precio; el producto y las compras no se modifican.
      </p>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
        <Button
          variant="danger"
          loading={mutation.isPending}
          onClick={() => mutation.mutate(link.product.id, { onSuccess: onDone })}
        >
          <Trash2 aria-hidden="true" className="size-4" />
          Quitar
        </Button>
      </div>
    </div>
  )
}
