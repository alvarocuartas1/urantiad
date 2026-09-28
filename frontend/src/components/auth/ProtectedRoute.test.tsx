import { screen } from '@testing-library/react'
import { Route, Routes, useLocation } from 'react-router'
import { AppLayout } from '@/components/layout/AppLayout'
import { adminUser, buildAuth, renderWithProviders } from '@/test/renderWithProviders'
import { PERMISSIONS } from '@/types/auth'
import { ProtectedRoute } from './ProtectedRoute'
import { RequirePermission } from './RequirePermission'

function LoginProbe() {
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  return <p>Login (desde {from})</p>
}

function renderRoutes(route: string, auth = buildAuth()) {
  renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginProbe />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<p>Inicio</p>} />
          <Route element={<RequirePermission permission={PERMISSIONS.usersRead} />}>
            <Route path="usuarios" element={<p>Listado de usuarios</p>} />
          </Route>
        </Route>
      </Route>
    </Routes>,
    { auth, route },
  )
}

const cashier = {
  ...adminUser,
  id: 2,
  username: 'cajero',
  role: { id: 2, code: 'cashier', name: 'Cajero' },
  permissions: [],
}

describe('route protection', () => {
  it('redirects anonymous users to login, remembering the requested page', () => {
    renderRoutes('/usuarios', buildAuth({ user: null }))

    expect(screen.getByText('Login (desde /usuarios)')).toBeInTheDocument()
  })

  it('shows a loader while the session is being restored', () => {
    renderRoutes('/', buildAuth({ user: null, status: 'loading' }))

    expect(screen.getByRole('status')).toHaveTextContent('Cargando')
  })

  it('renders the page for users with the permission', () => {
    renderRoutes('/usuarios')

    expect(screen.getByText('Listado de usuarios')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Usuarios' })).toBeInTheDocument()
  })

  it('hides the menu entry and blocks the page without the permission', () => {
    renderRoutes('/usuarios', buildAuth({ user: cashier }))

    expect(screen.queryByText('Listado de usuarios')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Sin acceso')
    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Inicio' })).toBeInTheDocument()
  })
})
