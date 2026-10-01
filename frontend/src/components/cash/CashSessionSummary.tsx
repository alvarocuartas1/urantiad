import type { CashSession } from '@/types/cash'
import { formatCurrency, formatDateTime } from '@/utils/format'
import { CashDifferenceBadge, CashSessionStatusBadge } from './CashBadges'

interface CashSessionSummaryProps {
  session: CashSession
}

/** Register, opening data, the cash that should be in the drawer and, once closed, the
 * cash count. */
export function CashSessionSummary({ session }: CashSessionSummaryProps) {
  const { summary, closing } = session
  const figures = [
    { label: 'Dinero inicial', value: summary.opening_amount },
    { label: 'Ventas en efectivo', value: summary.total_cash_sales },
    { label: 'Ingresos', value: summary.total_income },
    { label: 'Retiros', value: summary.total_withdrawals },
    { label: 'Anulaciones en efectivo', value: summary.total_cash_cancellations },
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

      <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {figures.map(({ label, value }) => (
          <div key={label} className="rounded-lg bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="text-base font-medium text-slate-900 tabular-nums">
              {formatCurrency(value)}
            </dd>
          </div>
        ))}
        <div className="bg-brand-900 rounded-lg p-3 text-white">
          <dt className="text-brand-100 text-xs">Efectivo esperado</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {formatCurrency(summary.expected_cash)}
          </dd>
        </div>
      </dl>

      {closing && (
        <div className="space-y-3 border-t border-slate-200 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-600">
              Cerrada por {closing.closed_by.full_name} · {formatDateTime(closing.closed_at)}
            </p>
            <CashDifferenceBadge difference={closing.difference} />
          </div>
          <dl className="grid gap-3 sm:grid-cols-3">
            <ClosingFigure label="Esperado al cerrar" value={closing.expected_cash} />
            <ClosingFigure label="Contado" value={closing.counted_cash} />
            <ClosingFigure label="Diferencia" value={closing.difference} />
          </dl>
          {closing.closing_notes && (
            <p className="text-sm text-slate-700">
              <span className="font-medium">Observaciones:</span> {closing.closing_notes}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function ClosingFigure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-base font-medium text-slate-900 tabular-nums">{formatCurrency(value)}</dd>
    </div>
  )
}
