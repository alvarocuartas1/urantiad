import { CashRegistersCard } from '@/components/dashboard/CashRegistersCard'
import { PaymentMethodsCard } from '@/components/dashboard/PaymentMethodsCard'
import { RecentPurchasesCard } from '@/components/dashboard/RecentPurchasesCard'
import { RecentSalesCard } from '@/components/dashboard/RecentSalesCard'
import { SalesTodayCard } from '@/components/dashboard/SalesTodayCard'
import { StockAlertsCard } from '@/components/dashboard/StockAlertsCard'
import { Alert } from '@/components/ui/Alert'
import { StatusBadge, type StatusTone } from '@/components/ui/StatusBadge'
import { useAuth } from '@/hooks/useAuth'
import { useDashboard } from '@/hooks/useDashboard'
import { useHealth } from '@/hooks/useHealth'
import type { Dashboard } from '@/types/dashboard'
import { getErrorMessage } from '@/utils/errors'

function useSystemStatus(): { tone: StatusTone; label: string } {
  const { data, isPending, isError } = useHealth()
  if (isError) return { tone: 'error', label: 'Sin conexión con el servidor o la base de datos.' }
  if (isPending) return { tone: 'loading', label: 'Verificando conexión con el servidor…' }
  return data.database === 'ok'
    ? { tone: 'ok', label: 'Servidor y base de datos conectados.' }
    : { tone: 'error', label: 'La base de datos no está disponible.' }
}

/** The sections the user may see; the API sends null for the others. */
function DashboardSections({ data }: { data: Dashboard }) {
  const { sales_today, recent_sales, cash_registers, stock, recent_purchases } = data
  return (
    <>
      {sales_today && <SalesTodayCard sales={sales_today} />}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {sales_today && <PaymentMethodsCard sales={sales_today} />}
        {cash_registers && <CashRegistersCard registers={cash_registers} />}
        {stock && <StockAlertsCard stock={stock} />}
        {recent_sales && <RecentSalesCard sales={recent_sales} />}
        {recent_purchases && <RecentPurchasesCard purchases={recent_purchases} />}
      </div>
    </>
  )
}

function HomePage() {
  const { user } = useAuth()
  const { tone, label } = useSystemStatus()
  const dashboard = useDashboard()

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Bienvenido, {user?.full_name}
          </h1>
          <p className="text-sm text-slate-600">POS · Inventario · Compras · Caja</p>
        </div>
        <StatusBadge size="sm" tone={tone} label={label} />
      </div>
      {dashboard.isError && <Alert>{getErrorMessage(dashboard.error)}</Alert>}
      {dashboard.isPending && <p className="text-sm text-slate-600">Cargando resumen…</p>}
      {dashboard.data && <DashboardSections data={dashboard.data} />}
    </section>
  )
}

export default HomePage
