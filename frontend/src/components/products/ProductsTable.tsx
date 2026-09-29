import { ArrowLeftRight, History, Pencil, SlidersHorizontal } from 'lucide-react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { Product } from '@/types/catalog'
import { UNIT_ABBREVIATIONS } from '@/utils/catalog'
import { formatCurrency, formatQuantity } from '@/utils/format'
import { StockStatusBadge } from './StockStatusBadge'

interface ProductsTableProps {
  products: Product[]
  canManage: boolean
  showCosts: boolean
  onEdit: (product: Product) => void
  onPriceHistory: (product: Product) => void
  /** Inventory actions; omitted when the user lacks the permission. Products only. */
  onAdjust?: (product: Product) => void
  onMovements?: (product: Product) => void
}

const HEADER_CLASS = 'px-4 py-3 font-semibold'
const ACTION_CLASS =
  'inline-flex items-center gap-1 rounded-md px-2 py-1 text-slate-700 hover:bg-slate-100'

export function ProductsTable({
  products,
  canManage,
  showCosts,
  onEdit,
  onPriceHistory,
  onAdjust,
  onMovements,
}: ProductsTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 uppercase">
          <tr>
            <th scope="col" className={HEADER_CLASS}>
              Producto
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Categoría
            </th>
            <th scope="col" className={`${HEADER_CLASS} text-right`}>
              Precio
            </th>
            {showCosts && (
              <th scope="col" className={`${HEADER_CLASS} text-right`}>
                Costo prom.
              </th>
            )}
            <th scope="col" className={`${HEADER_CLASS} text-right`}>
              Stock
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Nivel
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Estado
            </th>
            <th scope="col" className={`${HEADER_CLASS} text-right`}>
              Acciones
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {products.map((product) => (
            <tr key={product.id} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <p className="font-medium text-slate-900">{product.name}</p>
                <p className="text-xs text-slate-500">
                  {product.sku}
                  {product.barcode && ` · ${product.barcode}`}
                </p>
              </td>
              <td className="px-4 py-3 text-slate-700">{product.category.name}</td>
              <td className="px-4 py-3 text-right font-medium whitespace-nowrap text-slate-900">
                {formatCurrency(product.sale_price)}
              </td>
              {showCosts && (
                <td className="px-4 py-3 text-right whitespace-nowrap text-slate-700">
                  {formatCurrency(product.average_cost)}
                </td>
              )}
              <td className="px-4 py-3 text-right whitespace-nowrap text-slate-700">
                {product.type === 'service'
                  ? '—'
                  : `${formatQuantity(product.current_stock)} ${UNIT_ABBREVIATIONS[product.unit_of_measure]}`}
              </td>
              <td className="px-4 py-3">
                <StockStatusBadge status={product.stock_status} />
              </td>
              <td className="px-4 py-3">
                <StatusBadge
                  size="sm"
                  tone={product.is_active ? 'ok' : 'neutral'}
                  label={product.is_active ? 'Activo' : 'Inactivo'}
                />
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap justify-end gap-1">
                  {canManage && (
                    <button type="button" onClick={() => onEdit(product)} className={ACTION_CLASS}>
                      <Pencil aria-hidden="true" className="size-4" />
                      Editar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onPriceHistory(product)}
                    className={ACTION_CLASS}
                  >
                    <History aria-hidden="true" className="size-4" />
                    Precios
                  </button>
                  {product.type === 'product' && onMovements && (
                    <button
                      type="button"
                      onClick={() => onMovements(product)}
                      className={ACTION_CLASS}
                    >
                      <ArrowLeftRight aria-hidden="true" className="size-4" />
                      Movimientos
                    </button>
                  )}
                  {product.type === 'product' && onAdjust && (
                    <button
                      type="button"
                      onClick={() => onAdjust(product)}
                      className={ACTION_CLASS}
                    >
                      <SlidersHorizontal aria-hidden="true" className="size-4" />
                      Ajustar
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
