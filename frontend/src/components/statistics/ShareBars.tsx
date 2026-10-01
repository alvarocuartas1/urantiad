import { sharePercent } from '@/utils/dashboard'
import { compareDecimals } from '@/utils/decimal'

export interface ShareItem {
  key: string
  label: string
  /** Secondary line under the label (e.g. the SKU). */
  detail?: string
  /** Decimal string the bar is proportional to. */
  amount: string
  /** Formatted amount shown next to the label. */
  value: string
  /** Text under the bar (share, count…): the bar itself is only decorative. */
  note: string
}

/** Ranked horizontal bars, each proportional to the largest item, with every value in text. */
export function ShareBars({ items }: { items: ShareItem[] }) {
  const largest = items.reduce(
    (max, item) => (compareDecimals(item.amount, max) > 0 ? item.amount : max),
    '0',
  )
  return (
    <ol className="space-y-3">
      {items.map((item) => (
        <li key={item.key} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0">
              <span className="font-medium text-slate-900">{item.label}</span>
              {item.detail && <span className="block text-xs text-slate-500">{item.detail}</span>}
            </span>
            <span className="shrink-0 text-slate-900 tabular-nums">{item.value}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100" aria-hidden="true">
            <div
              className="bg-brand-700 h-2 rounded-full"
              style={{ width: `${sharePercent(item.amount, largest)}%` }}
            />
          </div>
          <p className="text-xs text-slate-600">{item.note}</p>
        </li>
      ))}
    </ol>
  )
}
