import { useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { useAuth } from '@/hooks/useAuth'
import { useMovements } from '@/hooks/useInventory'
import { PERMISSIONS } from '@/types/auth'
import type { Product } from '@/types/catalog'
import { getErrorMessage } from '@/utils/errors'
import { MovementsTable } from './MovementsTable'

const PAGE_SIZE = 10

interface ProductMovementsModalProps {
  product: Product
  onClose: () => void
}

export function ProductMovementsModal({ product, onClose }: ProductMovementsModalProps) {
  const { hasPermission } = useAuth()
  const [page, setPage] = useState(1)
  const { data, isPending, isError, error } = useMovements({
    page,
    size: PAGE_SIZE,
    product_id: product.id,
  })

  return (
    <Modal title={`Movimientos · ${product.name}`} onClose={onClose} size="lg">
      <div className="space-y-4">
        {isError && <Alert>{getErrorMessage(error)}</Alert>}
        {isPending && <p className="text-sm text-slate-600">Cargando movimientos…</p>}
        {data &&
          (data.items.length === 0 ? (
            <p className="text-sm text-slate-600">Este producto aún no tiene movimientos.</p>
          ) : (
            <>
              <MovementsTable
                movements={data.items}
                showProduct={false}
                showCosts={hasPermission(PERMISSIONS.productsViewCosts)}
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
    </Modal>
  )
}
