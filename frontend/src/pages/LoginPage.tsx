import { zodResolver } from '@hookform/resolvers/zod'
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
    <main className="flex min-h-svh items-center justify-center bg-slate-100 p-4">
      <section className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">URANTIAD</h1>
        <p className="mt-1 mb-6 text-sm text-slate-600">Inicie sesión para continuar</p>
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
    </main>
  )
}

export default LoginPage
