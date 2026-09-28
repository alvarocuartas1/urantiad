import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { usePriceHistory } from '@/hooks/useProducts'
import type { Product } from '@/types/catalog'
import { getErrorMessage } from '@/utils/errors'
import { formatCurrency, formatDateTime } from '@/utils/format'

const PAGE_SIZE = 10

interface PriceHistoryModalProps {
  product: Product
  onClose: () => void
}

export function PriceHistoryModal({ product, onClose }: PriceHistoryModalProps) {
  const [page, setPage] = useState(1)
  const { data, isPending, isError, error } = usePriceHistory(product.id, page, PAGE_SIZE)

  return (
    <Modal title={`Historial de precios · ${product.name}`} onClose={onClose} size="lg">
      <div className="space-y-4">
        {isError && <Alert>{getErrorMessage(error)}</Alert>}
        {isPending && <p className="text-sm text-slate-600">Cargando historial…</p>}
        {data && (
          <>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {data.items.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3">
                  <p className="flex items-center gap-2 font-medium text-slate-900">
                    {entry.old_price === null ? (
                      <span className="text-xs font-normal text-slate-500">Precio inicial</span>
                    ) : (
                      <>
                        <span className="text-slate-500 line-through">
                          {formatCurrency(entry.old_price)}
                        </span>
                        <ArrowRight aria-label="cambió a" className="size-4 text-slate-400" />
                      </>
                    )}
                    {formatCurrency(entry.new_price)}
                  </p>
                  <p className="ml-auto text-xs text-slate-500">
                    {formatDateTime(entry.changed_at)} · {entry.changed_by.full_name}
                  </p>
                </li>
              ))}
            </ul>
            <Pagination
              page={data.page}
              size={data.size}
              total={data.total}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </Modal>
  )
}
