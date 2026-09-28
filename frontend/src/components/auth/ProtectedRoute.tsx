import { LoaderCircle } from 'lucide-react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '@/hooks/useAuth'

export function FullScreenLoader() {
  return (
    <div role="status" className="flex min-h-svh items-center justify-center gap-2 text-slate-600">
      <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
      Cargando…
    </div>
  )
}

/** Renders child routes only for authenticated users; others go to /login. */
export function ProtectedRoute() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <FullScreenLoader />
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <Outlet />
}
