import type { PurchaseTotalsValues } from '@/utils/purchase'
import { formatCurrency } from '@/utils/format'

/** Totals block shared by the draft editor (live values) and the purchase detail. */
export function PurchaseTotals({ totals }: { totals: PurchaseTotalsValues }) {
  const rows: [string, string][] = [
    ['Subtotal (sin IVA)', totals.subtotal],
    ['Descuentos', totals.discount_total],
    ['IVA', totals.tax_total],
  ]
  return (
    <dl className="ml-auto w-full max-w-xs space-y-1 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 text-slate-700">
          <dt>{label}</dt>
          <dd>{formatCurrency(value)}</dd>
        </div>
      ))}
      <div className="flex justify-between gap-4 border-t border-slate-200 pt-1 text-base font-semibold text-slate-900">
        <dt>Total</dt>
        <dd>{formatCurrency(totals.total)}</dd>
      </div>
      <div className="flex justify-between gap-4 text-slate-700">
        <dt>Pagado</dt>
        <dd>{formatCurrency(totals.amount_paid)}</dd>
      </div>
      <div className="flex justify-between gap-4 font-medium text-slate-900">
        <dt>Saldo pendiente</dt>
        <dd>{formatCurrency(totals.balance_due)}</dd>
      </div>
    </dl>
  )
}
