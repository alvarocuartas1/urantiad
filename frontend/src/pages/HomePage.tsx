import { StatusBadge, type StatusTone } from '@/components/ui/StatusBadge'
import { useAuth } from '@/hooks/useAuth'
import { useHealth } from '@/hooks/useHealth'

function useSystemStatus(): { tone: StatusTone; label: string } {
  const { data, isPending, isError } = useHealth()
  if (isError) return { tone: 'error', label: 'Sin conexión con el servidor o la base de datos.' }
  if (isPending) return { tone: 'loading', label: 'Verificando conexión con el servidor…' }
  return data.database === 'ok'
    ? { tone: 'ok', label: 'Servidor y base de datos conectados.' }
    : { tone: 'error', label: 'La base de datos no está disponible.' }
}

function HomePage() {
  const { user } = useAuth()
  const { tone, label } = useSystemStatus()

  return (
    <section className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Bienvenido, {user?.full_name}
        </h1>
        <p className="text-sm text-slate-600">POS · Inventario · Compras · Caja</p>
      </div>
      <StatusBadge tone={tone} label={label} />
    </section>
  )
}

export default HomePage
