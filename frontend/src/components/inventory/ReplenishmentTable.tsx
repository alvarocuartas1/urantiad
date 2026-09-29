import { SlidersHorizontal } from 'lucide-react'
import { StockStatusBadge } from '@/components/products/StockStatusBadge'
import type { ReplenishmentItem } from '@/types/inventory'
import { UNIT_ABBREVIATIONS } from '@/utils/catalog'
import { formatQuantity } from '@/utils/format'

interface ReplenishmentTableProps {
  items: ReplenishmentItem[]
  /** Omit when the user cannot adjust inventory. */
  onAdjust?: (item: ReplenishmentItem) => void
}

const HEADER_CLASS = 'px-4 py-3 font-semibold'
const NUMBER_CLASS = 'px-4 py-3 text-right whitespace-nowrap text-slate-700'

export function ReplenishmentTable({ items, onAdjust }: ReplenishmentTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 uppercase">
          <tr>
            <th scope="col" className={HEADER_CLASS}>
              Producto
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Nivel
            </th>
            <th scope="col" className={`${HEADER_CLASS} text-right`}>
              Stock
            </th>
            <th scope="col" className={`${HEADER_CLASS} text-right`}>
              Mínimo
            </th>
            <th scope="col" className={`${HEADER_CLASS} text-right`}>
              Reorden
            </th>
            <th scope="col" className={`${HEADER_CLASS} text-right`}>
              Objetivo
            </th>
            <th scope="col" className={`${HEADER_CLASS} text-right`}>
              Sugerido comprar
            </th>
            {onAdjust && (
              <th scope="col" className={`${HEADER_CLASS} text-right`}>
                Acciones
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => {
            const unit = UNIT_ABBREVIATIONS[item.unit_of_measure]
            return (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{item.name}</p>
                  <p className="text-xs text-slate-500">
                    {item.sku} · {item.category.name}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <StockStatusBadge status={item.stock_status} />
                </td>
                <td className={NUMBER_CLASS}>
                  {formatQuantity(item.current_stock)} {unit}
                </td>
                <td className={NUMBER_CLASS}>{formatQuantity(item.min_stock)}</td>
                <td className={NUMBER_CLASS}>{formatQuantity(item.reorder_point)}</td>
                <td className={NUMBER_CLASS}>{formatQuantity(item.target_stock)}</td>
                <td className="px-4 py-3 text-right font-semibold whitespace-nowrap text-slate-900">
                  {formatQuantity(item.suggested_quantity)} {unit}
                </td>
                {onAdjust && (
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onAdjust(item)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-slate-700 hover:bg-slate-100"
                    >
                      <SlidersHorizontal aria-hidden="true" className="size-4" />
                      Ajustar
                    </button>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
