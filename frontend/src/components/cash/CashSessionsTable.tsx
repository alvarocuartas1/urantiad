import { Eye } from 'lucide-react'
import type { CashSession } from '@/types/cash'
import { formatCurrency, formatDateTime } from '@/utils/format'
import { CashDifferenceBadge, CashSessionStatusBadge } from './CashBadges'

interface CashSessionsTableProps {
  sessions: CashSession[]
  onView: (session: CashSession) => void
}

const HEADER_CLASS = 'px-4 py-3 font-semibold'

export function CashSessionsTable({ sessions, onView }: CashSessionsTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[1000px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 uppercase">
          <tr>
            <th scope="col" className={HEADER_CLASS}>
              Apertura
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Caja
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Usuario
            </th>
            <th scope="col" className={`${HEADER_CLASS} text-right`}>
              Dinero inicial
            </th>
            <th scope="col" className={`${HEADER_CLASS} text-right`}>
              Efectivo esperado
            </th>
            <th scope="col" className={`${HEADER_CLASS} text-right`}>
              Contado
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Arqueo
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
          {sessions.map((session) => (
            <tr key={session.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                {formatDateTime(session.opened_at)}
              </td>
              <td className="px-4 py-3 font-medium text-slate-900">{session.cash_register.name}</td>
              <td className="px-4 py-3 text-slate-700">{session.user.full_name}</td>
              <td className="px-4 py-3 text-right text-slate-700 tabular-nums">
                {formatCurrency(session.opening_amount)}
              </td>
              <td className="px-4 py-3 text-right font-medium text-slate-900 tabular-nums">
                {formatCurrency(session.closing?.expected_cash ?? session.summary.expected_cash)}
              </td>
              <td className="px-4 py-3 text-right text-slate-700 tabular-nums">
                {formatCurrency(session.closing?.counted_cash ?? null)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                {session.closing ? (
                  <CashDifferenceBadge difference={session.closing.difference} />
                ) : (
                  <span className="text-slate-500">Pendiente</span>
                )}
              </td>
              <td className="px-4 py-3">
                <CashSessionStatusBadge status={session.status} />
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  type="button"
                  onClick={() => onView(session)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-slate-700 hover:bg-slate-100"
                >
                  <Eye aria-hidden="true" className="size-4" />
                  Ver
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
