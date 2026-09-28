import { CircleAlert, CircleCheck, LoaderCircle, type LucideIcon } from 'lucide-react'
import { useHealth } from '@/hooks/useHealth'

type Tone = 'loading' | 'ok' | 'error'

const TONE_STYLES: Record<Tone, { icon: LucideIcon; className: string }> = {
  loading: { icon: LoaderCircle, className: 'border-slate-200 bg-slate-50 text-slate-700' },
  ok: { icon: CircleCheck, className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  error: { icon: CircleAlert, className: 'border-red-200 bg-red-50 text-red-800' },
}

function StatusBadge({ tone, label }: { tone: Tone; label: string }) {
  const { icon: Icon, className } = TONE_STYLES[tone]
  return (
    <p
      role="status"
      className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium ${className}`}
    >
      <Icon aria-hidden="true" className={`size-5 ${tone === 'loading' ? 'animate-spin' : ''}`} />
      {label}
    </p>
  )
}

function HomePage() {
  const { data, isPending, isError } = useHealth()

  let tone: Tone = 'loading'
  let label = 'Verificando conexión con el servidor…'
  if (isError) {
    tone = 'error'
    label = 'Sin conexión con el servidor o la base de datos.'
  } else if (!isPending) {
    tone = data.database === 'ok' ? 'ok' : 'error'
    label =
      tone === 'ok'
        ? 'Servidor y base de datos conectados.'
        : 'La base de datos no está disponible.'
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-slate-100 p-4">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">URANTIAD</h1>
        <p className="mt-1 mb-6 text-sm text-slate-600">POS · Inventario · Compras · Caja</p>
        <StatusBadge tone={tone} label={label} />
      </section>
    </main>
  )
}

export default HomePage
