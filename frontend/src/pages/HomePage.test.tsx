import { screen } from '@testing-library/react'
import { ApiError } from '@/services/apiClient'
import { getHealth } from '@/services/health'
import { renderWithProviders } from '@/test/renderWithProviders'
import HomePage from './HomePage'

vi.mock('@/services/health')

describe('HomePage', () => {
  it('greets the user and shows connected status when the API and database are up', async () => {
    vi.mocked(getHealth).mockResolvedValue({ status: 'ok', database: 'ok' })

    renderWithProviders(<HomePage />)

    expect(screen.getByRole('heading', { name: 'Bienvenido, Administrador' })).toBeInTheDocument()
    expect(await screen.findByText('Servidor y base de datos conectados.')).toBeInTheDocument()
  })

  it('shows an error status when the API cannot be reached', async () => {
    vi.mocked(getHealth).mockRejectedValue(
      new ApiError(0, { detail: 'No se pudo conectar con el servidor.', code: 'NETWORK_ERROR' }),
    )

    renderWithProviders(<HomePage />)

    expect(
      await screen.findByText('Sin conexión con el servidor o la base de datos.'),
    ).toBeInTheDocument()
  })
})
