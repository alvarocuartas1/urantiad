import { Boxes, Receipt, ShoppingCart, Wallet, type LucideIcon } from 'lucide-react'
import type { ComponentType } from 'react'
import { Navigate, NavLink, useParams } from 'react-router'
import { CashReport } from '@/components/reports/CashReport'
import { InventoryReport } from '@/components/reports/InventoryReport'
import { PurchasesReport } from '@/components/reports/PurchasesReport'
import { SalesReport } from '@/components/reports/SalesReport'
import { useAuth } from '@/hooks/useAuth'
import { REPORT_TAB_PERMISSIONS, type ReportTab } from '@/utils/report'

const TABS: { slug: ReportTab; label: string; icon: LucideIcon; report: ComponentType }[] = [
  { slug: 'ventas', label: 'Ventas', icon: Receipt, report: SalesReport },
  { slug: 'compras', label: 'Compras', icon: ShoppingCart, report: PurchasesReport },
  { slug: 'inventario', label: 'Inventario', icon: Boxes, report: InventoryReport },
  { slug: 'caja', label: 'Caja', icon: Wallet, report: CashReport },
]

/** Reports of sales, purchases, inventory and cash; each tab needs the permission of its area. */
function ReportsPage() {
  const { tab } = useParams()
  const { hasPermission } = useAuth()
  const tabs = TABS.filter(({ slug }) => hasPermission(REPORT_TAB_PERMISSIONS[slug]))
  const current = tabs.find(({ slug }) => slug === tab)

  // The route already requires one of the tabs' permissions, so `tabs` is never empty there.
  if (!current) return tabs[0] ? <Navigate to={`/reportes/${tabs[0].slug}`} replace /> : null
  const Report = current.report

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reportes</h1>
      <nav aria-label="Reportes" className="flex border-b border-slate-200 sm:gap-1">
        {tabs.map(({ slug, label, icon: Icon }) => (
          <NavLink
            key={slug}
            to={`/reportes/${slug}`}
            className={({ isActive }) =>
              `-mb-px flex flex-1 items-center justify-center gap-2 border-b-2 px-2 py-2 text-sm font-medium whitespace-nowrap sm:flex-none sm:px-4 ${
                isActive
                  ? 'border-brand-700 text-brand-800'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`
            }
          >
            {/* Without icons the four tabs fit a phone screen side by side. */}
            <Icon aria-hidden="true" className="hidden size-4 sm:block" />
            {label}
          </NavLink>
        ))}
      </nav>
      {/* Keyed so each report starts with its own default filters. */}
      <Report key={current.slug} />
    </section>
  )
}

export default ReportsPage
