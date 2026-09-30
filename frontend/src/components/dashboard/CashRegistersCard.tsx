import { CashSessionStatusBadge } from '@/components/cash/CashBadges'
import { useAuth } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/types/auth'
import type { DashboardCashRegister } from '@/types/dashboard'
import { formatCurrency, formatDateTime } from '@/utils/format'
import { DashboardCard, EmptyMessage } from './DashboardCard'

function useCashAction() {
  const { hasPermission } = useAuth()
  if (hasPermission(PERMISSIONS.cashSupervise)) {
    return { to: '/caja/aperturas', label: 'Ver aperturas' }
  }
  if (hasPermission(PERMISSIONS.cashOperate)) return { to: '/caja', label: 'Mi caja' }
  return undefined
}

/** Active cash registers: open (by whom, since when and, for supervisors, the expected cash)
 * or closed. */
export function CashRegistersCard({ registers }: { registers: DashboardCashRegister[] }) {
  const action = useCashAction()
  return (
    <DashboardCard title="Estado de las cajas" action={action}>
      {registers.length === 0 ? (
        <EmptyMessage>No hay cajas activas.</EmptyMessage>
      ) : (
        <ul className="divide-y divide-slate-100">
          {registers.map(({ id, name, open_session: session }) => (
            <li key={id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">{name}</p>
                {session && (
                  <p className="text-xs text-slate-600">
                    {session.user.full_name} · desde {formatDateTime(session.opened_at)}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <CashSessionStatusBadge status={session ? 'open' : 'closed'} />
                {session?.expected_cash != null && (
                  <span className="text-xs text-slate-600 tabular-nums">
                    Esperado {formatCurrency(session.expected_cash)}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  )
}
