import type { ReactNode } from 'react'

export interface SummaryItem {
  label: string
  value: ReactNode
  detail?: ReactNode
}

/** Key figures of a report period. */
export function SummaryCards({ items }: { items: SummaryItem[] }) {
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(({ label, value, detail }) => (
        <div key={label} className="rounded-xl border border-slate-200 bg-white p-4">
          <dt className="text-xs text-slate-500">{label}</dt>
          <dd className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">{value}</dd>
          {detail && <dd className="mt-1 text-xs text-slate-600">{detail}</dd>}
        </div>
      ))}
    </dl>
  )
}
