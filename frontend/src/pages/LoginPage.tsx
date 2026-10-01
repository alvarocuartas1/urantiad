import { zodResolver } from '@hookform/resolvers/zod'
import { Boxes, ScanBarcode, Wallet } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { z } from 'zod'
import { FullScreenLoader } from '@/components/auth/ProtectedRoute'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/FormField'
import { useAuth } from '@/hooks/useAuth'
import { getErrorMessage } from '@/utils/errors'

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Ingrese su usuario.'),
  password: z.string().min(1, 'Ingrese su contraseña.'),
})

type LoginValues = z.infer<typeof loginSchema>

const FEATURES = [
  { icon: ScanBarcode, text: 'Ventas rápidas con lector de código de barras' },
  { icon: Boxes, text: 'Inventario y costos siempre al día' },
  { icon: Wallet, text: 'Caja, arqueo y cierre sin descuadres' },
]

function LoginPage() {
  const { status, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setFocus,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  const from = (location.state as { from?: string } | null)?.from ?? '/'

  if (status === 'loading') return <FullScreenLoader />
  if (status === 'authenticated') return <Navigate to={from} replace />

  const onSubmit = handleSubmit(async ({ username, password }) => {
    setSubmitError(null)
    try {
      await login(username, password)
      navigate(from, { replace: true })
    } catch (error) {
      setSubmitError(getErrorMessage(error))
      resetField('password')
      setFocus('password')
    }
  })

  return (
    <main className="bg-brand-50 flex min-h-svh">
      {/* Brand panel: only on wide screens, where it fits beside the form. */}
      <section
        aria-label="URANTIAD"
        className="bg-brand-900 hidden w-[min(560px,45%)] shrink-0 flex-col justify-between p-12 text-white lg:flex xl:p-16"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="text-brand-900 flex size-10 items-center justify-center rounded-xl bg-white text-xl font-extrabold"
          >
            U
          </span>
          <span className="text-xl font-bold tracking-wide">URANTIAD</span>
        </div>
        <div className="space-y-7">
          <p className="text-4xl leading-tight font-bold tracking-tight">
            Punto de venta e inventario
          </p>
          <ul className="space-y-4">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-xl bg-white/15">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-brand-100 text-sm">Comestibles, bebidas, consumo y fotocopias</p>
      </section>

      <div className="flex flex-1 items-center justify-center p-4">
        <section className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            <span className="lg:hidden">URANTIAD</span>
            <span className="hidden lg:inline">Iniciar sesión</span>
          </h1>
          <p className="mt-1 mb-6 text-sm text-slate-600">Ingrese su usuario y contraseña</p>
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            {submitError && <Alert>{submitError}</Alert>}
            <TextField
              label="Usuario"
              autoComplete="username"
              autoCapitalize="none"
              autoFocus
              error={errors.username?.message}
              {...register('username')}
            />
            <TextField
              label="Contraseña"
              type="password"
              autoComplete="current-password"
              error={errors.password?.message}
              {...register('password')}
            />
            <Button type="submit" loading={isSubmitting} className="w-full">
              Ingresar
            </Button>
          </form>
        </section>
      </div>
    </main>
  )
}

export default LoginPage
