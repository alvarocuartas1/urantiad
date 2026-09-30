import { formatCurrency } from '@/utils/format'

export interface SaleTotalsValues {
  subtotal: string
  discount_total: string
  tax_total: string
  total: string
}

/** Totals of a sale, shared by the POS (live preview) and the sale detail. */
export function SaleTotals({ totals }: { totals: SaleTotalsValues }) {
  return (
    <dl className="space-y-1 text-sm">
      <div className="flex justify-between gap-4 text-slate-700">
        <dt>Subtotal</dt>
        <dd className="tabular-nums">{formatCurrency(totals.subtotal)}</dd>
      </div>
      <div className="flex justify-between gap-4 text-slate-700">
        <dt>Descuentos</dt>
        <dd className="tabular-nums">−{formatCurrency(totals.discount_total)}</dd>
      </div>
      <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 text-2xl font-bold text-slate-900">
        <dt>Total</dt>
        <dd className="tabular-nums">{formatCurrency(totals.total)}</dd>
      </div>
      <div className="flex justify-between gap-4 text-xs text-slate-500">
        <dt>IVA incluido</dt>
        <dd className="tabular-nums">{formatCurrency(totals.tax_total)}</dd>
      </div>
    </dl>
  )
}
