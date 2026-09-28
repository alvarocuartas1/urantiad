import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router'
import { ApiError } from '@/services/apiClient'
import { buildAuth, renderWithProviders } from '@/test/renderWithProviders'
import LoginPage from './LoginPage'

function renderLogin(login = vi.fn(), from?: string) {
  const auth = buildAuth({ user: null, login })
  renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/usuarios" element={<p>Página de usuarios</p>} />
    </Routes>,
    { auth, route: { pathname: '/login', state: from ? { from } : undefined } },
  )
  return login
}

describe('LoginPage', () => {
  it('validates required fields before calling the API', async () => {
    const login = renderLogin()

    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }))

    expect(await screen.findByText('Ingrese su usuario.')).toBeInTheDocument()
    expect(screen.getByText('Ingrese su contraseña.')).toBeInTheDocument()
    expect(login).not.toHaveBeenCalled()
  })

  it('logs in with the keyboard and returns to the requested page', async () => {
    const login = renderLogin(vi.fn().mockResolvedValue(undefined), '/usuarios')

    // The username field is focused on load, so the cashier can type right away.
    await userEvent.keyboard('cajero')
    await userEvent.tab()
    await userEvent.keyboard('Password123{Enter}')

    expect(login).toHaveBeenCalledWith('cajero', 'Password123')
    expect(await screen.findByText('Página de usuarios')).toBeInTheDocument()
  })

  it('shows the API error and clears the password on failure', async () => {
    renderLogin(
      vi.fn().mockRejectedValue(
        new ApiError(401, {
          detail: 'Usuario o contraseña incorrectos.',
          code: 'INVALID_CREDENTIALS',
        }),
      ),
    )

    await userEvent.type(screen.getByLabelText('Usuario'), 'admin')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'wrong-pass')
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Usuario o contraseña incorrectos.')
    expect(screen.getByLabelText('Contraseña')).toHaveValue('')
  })
})
