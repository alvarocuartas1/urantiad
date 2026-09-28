import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { ApiError } from '@/services/apiClient'
import { getHealth } from '@/services/health'
import HomePage from './HomePage'

vi.mock('@/services/health')

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <HomePage />
    </QueryClientProvider>,
  )
}

describe('HomePage', () => {
  it('shows connected status when the API and database are up', async () => {
    vi.mocked(getHealth).mockResolvedValue({ status: 'ok', database: 'ok' })

    renderPage()

    expect(await screen.findByText('Servidor y base de datos conectados.')).toBeInTheDocument()
  })

  it('shows an error status when the API cannot be reached', async () => {
    vi.mocked(getHealth).mockRejectedValue(
      new ApiError(0, { detail: 'No se pudo conectar con el servidor.', code: 'NETWORK_ERROR' }),
    )

    renderPage()

    expect(
      await screen.findByText('Sin conexión con el servidor o la base de datos.'),
    ).toBeInTheDocument()
  })
})
