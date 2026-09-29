import { useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Pagination } from '@/components/ui/Pagination'
import { useCashMovements } from '@/hooks/useCash'
import type { CashMovement } from '@/types/cash'
import { getErrorMessage } from '@/utils/errors'
import { formatCurrency, formatDateTime } from '@/utils/format'
import { CashMovementTypeBadge } from './CashBadges'

const PAGE_SIZE = 20
const HEADER_CLASS = 'px-4 py-3 font-semibold'

/** Paginated movements of a cash session, newest first. */
export function CashMovementsList({ sessionId }: { sessionId: number }) {
  const [page, setPage] = useState(1)
  const { data, isPending, isError, error } = useCashMovements(sessionId, {
    page,
    size: PAGE_SIZE,
  })

  if (isError) return <Alert>{getErrorMessage(error)}</Alert>
  if (isPending) return <p className="text-sm text-slate-600">Cargando movimientos…</p>
  if (data.items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
        Todavía no hay ingresos ni retiros.
      </p>
    )
  }
  return (
    <div className="space-y-3">
      <CashMovementsTable movements={data.items} />
      <Pagination page={data.page} size={data.size} total={data.total} onPageChange={setPage} />
    </div>
  )
}

function CashMovementsTable({ movements }: { movements: CashMovement[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 uppercase">
          <tr>
            <th scope="col" className={HEADER_CLASS}>
              Fecha
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Tipo
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Concepto
            </th>
            <th scope="col" className={`${HEADER_CLASS} text-right`}>
              Valor
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Usuario
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {movements.map((movement) => (
            <tr key={movement.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                {formatDateTime(movement.created_at)}
              </td>
              <td className="px-4 py-3">
                <CashMovementTypeBadge type={movement.movement_type} />
              </td>
              <td className="px-4 py-3 text-slate-900">{movement.concept}</td>
              <td className="px-4 py-3 text-right font-medium whitespace-nowrap text-slate-900 tabular-nums">
                {movement.movement_type === 'income' ? '+' : '−'}
                {formatCurrency(movement.amount)}
              </td>
              <td className="px-4 py-3 text-slate-700">{movement.user.full_name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
