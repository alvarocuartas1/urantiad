import { ArrowRight } from 'lucide-react'
import type { InventoryMovement } from '@/types/inventory'
import { UNIT_ABBREVIATIONS } from '@/utils/catalog'
import { formatCurrency, formatDateTime, formatQuantity } from '@/utils/format'
import { isInbound } from '@/utils/inventory'
import { MovementTypeBadge } from './MovementTypeBadge'

interface MovementsTableProps {
  movements: InventoryMovement[]
  /** Hide the product column when every movement belongs to the same product. */
  showProduct?: boolean
  showCosts: boolean
}

const HEADER_CLASS = 'px-4 py-3 font-semibold'
const CELL_CLASS = 'px-4 py-3'

export function MovementsTable({ movements, showProduct = true, showCosts }: MovementsTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 uppercase">
          <tr>
            <th scope="col" className={HEADER_CLASS}>
              Fecha
            </th>
            {showProduct && (
              <th scope="col" className={HEADER_CLASS}>
                Producto
              </th>
            )}
            <th scope="col" className={HEADER_CLASS}>
              Tipo
            </th>
            <th scope="col" className={`${HEADER_CLASS} text-right`}>
              Cantidad
            </th>
            <th scope="col" className={`${HEADER_CLASS} text-right`}>
              Stock
            </th>
            {showCosts && (
              <th scope="col" className={`${HEADER_CLASS} text-right`}>
                Costo unit.
              </th>
            )}
            <th scope="col" className={HEADER_CLASS}>
              Motivo
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Usuario
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {movements.map((movement) => {
            const unit = UNIT_ABBREVIATIONS[movement.product.unit_of_measure]
            const inbound = isInbound(movement.movement_type)
            return (
              <tr key={movement.id} className="hover:bg-slate-50">
                <td className={`${CELL_CLASS} whitespace-nowrap text-slate-700`}>
                  {formatDateTime(movement.created_at)}
                </td>
                {showProduct && (
                  <td className={CELL_CLASS}>
                    <p className="font-medium text-slate-900">{movement.product.name}</p>
                    <p className="text-xs text-slate-500">{movement.product.sku}</p>
                  </td>
                )}
                <td className={CELL_CLASS}>
                  <MovementTypeBadge type={movement.movement_type} />
                </td>
                <td
                  className={`${CELL_CLASS} text-right font-medium whitespace-nowrap ${
                    inbound ? 'text-emerald-800' : 'text-slate-900'
                  }`}
                >
                  {inbound ? '+' : '−'}
                  {formatQuantity(movement.quantity)} {unit}
                </td>
                <td className={`${CELL_CLASS} text-right whitespace-nowrap text-slate-700`}>
                  <span className="inline-flex items-center gap-1">
                    {formatQuantity(movement.stock_before)}
                    <ArrowRight aria-label="pasó a" className="size-3.5 text-slate-400" />
                    <span className="font-medium text-slate-900">
                      {formatQuantity(movement.stock_after)}
                    </span>
                  </span>
                </td>
                {showCosts && (
                  <td className={`${CELL_CLASS} text-right whitespace-nowrap text-slate-700`}>
                    {formatCurrency(movement.unit_cost)}
                  </td>
                )}
                <td className={`${CELL_CLASS} text-slate-700`}>{movement.reason ?? '—'}</td>
                <td className={`${CELL_CLASS} text-slate-700`}>{movement.user.full_name}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
