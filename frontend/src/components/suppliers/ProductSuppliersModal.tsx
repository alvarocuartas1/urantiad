import { Alert } from '@/components/ui/Alert'
import { Modal } from '@/components/ui/Modal'
import { useProductSuppliers } from '@/hooks/useSuppliers'
import type { Product } from '@/types/catalog'
import { getErrorMessage } from '@/utils/errors'
import { SupplierProductsTable } from './SupplierProductsTable'

interface ProductSuppliersModalProps {
  product: Pick<Product, 'id' | 'name'>
  onClose: () => void
}

/** Suppliers that sell a product, most recently priced first. */
export function ProductSuppliersModal({ product, onClose }: ProductSuppliersModalProps) {
  const { data, isPending, isError, error } = useProductSuppliers(product.id)

  return (
    <Modal title={`Proveedores · ${product.name}`} onClose={onClose} size="lg">
      {isError && <Alert>{getErrorMessage(error)}</Alert>}
      {isPending && <p className="text-sm text-slate-600">Cargando proveedores…</p>}
      {data &&
        (data.length === 0 ? (
          <p className="text-sm text-slate-600">
            Ningún proveedor tiene este producto asociado. Asócielo desde la página de proveedores.
          </p>
        ) : (
          <SupplierProductsTable links={data} show="supplier" />
        ))}
    </Modal>
  )
}
