import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { AuthContext, type AuthContextValue } from '@/hooks/authContext'
import type { CurrentUser } from '@/types/auth'

export const adminUser: CurrentUser = {
  id: 1,
  username: 'admin',
  full_name: 'Administrador',
  role: { id: 1, code: 'admin', name: 'Administrador' },
  permissions: ['roles.read', 'users.manage', 'users.read'],
}

export function buildAuth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  const user = overrides.user === undefined ? adminUser : overrides.user
  return {
    status: user ? 'authenticated' : 'anonymous',
    user,
    login: vi.fn(),
    logout: vi.fn(),
    hasPermission: (permission) => user?.permissions.includes(permission) ?? false,
    ...overrides,
  }
}

interface Options {
  auth?: AuthContextValue
  route?: string | { pathname: string; state?: unknown }
}

/** Render with React Query, a fake auth context and an in-memory router. */
export function renderWithProviders(
  ui: ReactElement,
  { auth = buildAuth(), route = '/' }: Options = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext value={auth}>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </AuthContext>
    </QueryClientProvider>,
  )
}
