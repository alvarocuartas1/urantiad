import { LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { DateFilter } from '@/components/ui/ListFilters'

/** Filter bar of a report, with a spinner while a new result loads over the previous one. */
export function ReportToolbar({
  children,
  isFetching,
}: {
  children: ReactNode
  isFetching: boolean
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      {children}
      {isFetching && (
        <LoaderCircle aria-label="Actualizando" className="size-4 animate-spin text-slate-500" />
      )}
    </div>
  )
}

interface PeriodFilterProps {
  from: string
  to: string
  onChange: (period: { from: string; to: string }) => void
}

/** Whole business days, from `from` to `to` (both included). */
export function PeriodFilter({ from, to, onChange }: PeriodFilterProps) {
  return (
    <>
      <DateFilter label="Desde" value={from} onChange={(value) => onChange({ from: value, to })} />
      <DateFilter label="Hasta" value={to} onChange={(value) => onChange({ from, to: value })} />
    </>
  )
}
