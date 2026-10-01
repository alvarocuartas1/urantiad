import { useId, type ReactNode } from 'react'
import { Link } from 'react-router'

interface DashboardCardProps {
  title: string
  subtitle?: string
  /** Link to the page with the full list. */
  action?: { to: string; label: string }
  children: ReactNode
}

/** Section of the dashboard: a titled card with an optional link to its page. */
export function DashboardCard({ title, subtitle, action, children }: DashboardCardProps) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h2 id={titleId} className="text-base font-semibold text-slate-900">
            {title}
          </h2>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action && (
          <Link
            to={action.to}
            className="text-brand-800 hover:text-brand-950 text-sm font-medium underline underline-offset-2"
          >
            {action.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

/** Message of a section without data. */
export function EmptyMessage({ children }: { children: ReactNode }) {
  return <p className="text-sm text-slate-600">{children}</p>
}
