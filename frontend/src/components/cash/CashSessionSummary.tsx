import type { CashSession } from '@/types/cash'
import { formatCurrency, formatDateTime } from '@/utils/format'
import { CashSessionStatusBadge } from './CashBadges'

interface CashSessionSummaryProps {
  session: CashSession
}

/** Register, opening data and the cash that should be in the drawer. */
export function CashSessionSummary({ session }: CashSessionSummaryProps) {
  const { summary } = session
  const figures = [
    { label: 'Dinero inicial', value: summary.opening_amount },
    { label: 'Ingresos', value: summary.total_income },
    { label: 'Retiros', value: summary.total_withdrawals },
  ]

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{session.cash_register.name}</h2>
          <p className="text-sm text-slate-600">
            Abierta por {session.user.full_name} · {formatDateTime(session.opened_at)}
          </p>
          {session.opening_notes && (
            <p className="mt-1 text-sm text-slate-600">{session.opening_notes}</p>
          )}
        </div>
        <CashSessionStatusBadge status={session.status} />
      </div>

      <dl className="grid gap-3 sm:grid-cols-4">
        {figures.map(({ label, value }) => (
          <div key={label} className="rounded-lg bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="text-base font-medium text-slate-900 tabular-nums">
              {formatCurrency(value)}
            </dd>
          </div>
        ))}
        <div className="rounded-lg bg-slate-900 p-3 text-white">
          <dt className="text-xs text-slate-300">Efectivo esperado</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {formatCurrency(summary.expected_cash)}
          </dd>
        </div>
      </dl>
    </div>
  )
}
