import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/services/apiClient'
import { createAdjustment } from '@/services/inventory'
import { listProducts } from '@/services/products'
import { adminUser, buildAuth, renderWithProviders } from '@/test/renderWithProviders'
import type { Product } from '@/types/catalog'
import type { AdjustableProduct } from '@/types/inventory'
import { AdjustmentFormModal } from './AdjustmentFormModal'

vi.mock('@/services/inventory')
vi.mock('@/services/products')

const keeper = buildAuth({
  user: {
    ...adminUser,
    permissions: ['products.read', 'products.view_costs', 'inventory.read', 'inventory.adjust'],
  },
})

const soda: AdjustableProduct = {
  id: 5,
  sku: 'BEB-001',
  name: 'Gaseosa cola',
  unit_of_measure: 'unit',
  current_stock: '10.00',
}

function renderModal(product?: AdjustableProduct) {
  const onClose = vi.fn()
  renderWithProviders(<AdjustmentFormModal product={product} onClose={onClose} />, {
    auth: keeper,
  })
  return onClose
}

describe('AdjustmentFormModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('previews the resulting stock and registers an entry with its cost', async () => {
    vi.mocked(createAdjustment).mockResolvedValue({} as never)
    const onClose = renderModal(soda)

    await userEvent.type(screen.getByLabelText('Cantidad (und)'), '5')
    expect(screen.getByText('Stock resultante:').parentElement).toHaveTextContent('15 und')
    await userEvent.type(screen.getByLabelText('Costo unitario (opcional)'), '1800,5')
    await userEvent.type(screen.getByLabelText('Motivo'), 'Carga inicial')
    await userEvent.click(screen.getByRole('button', { name: 'Registrar ajuste' }))

    expect(createAdjustment).toHaveBeenCalledWith({
      product_id: 5,
      direction: 'in',
      quantity: '5',
      unit_cost: '1800.5',
      reason: 'Carga inicial',
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('warns about negative stock and hides the cost for exits', async () => {
    renderModal(soda)

    await userEvent.click(screen.getByLabelText('Salida'))
    await userEvent.type(screen.getByLabelText('Cantidad (und)'), '12')

    expect(screen.queryByLabelText('Costo unitario (opcional)')).not.toBeInTheDocument()
    expect(screen.getByText('Quedaría en negativo')).toBeInTheDocument()
  })

  it('requires a reason and whole quantities for units', async () => {
    renderModal(soda)

    await userEvent.type(screen.getByLabelText('Cantidad (und)'), '1,5')
    await userEvent.click(screen.getByRole('button', { name: 'Registrar ajuste' }))

    expect(
      await screen.findByText('Ingrese una cantidad entera para esta unidad de medida.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Indique el motivo (mínimo 3 caracteres).')).toBeInTheDocument()
    expect(createAdjustment).not.toHaveBeenCalled()
  })

  it('shows insufficient stock next to the quantity', async () => {
    vi.mocked(createAdjustment).mockRejectedValue(
      new ApiError(409, {
        detail: 'Stock insuficiente: disponible 10, solicitado 12.',
        code: 'INSUFFICIENT_STOCK',
      }),
    )
    renderModal(soda)

    await userEvent.click(screen.getByLabelText('Salida'))
    await userEvent.type(screen.getByLabelText('Cantidad (und)'), '12')
    await userEvent.type(screen.getByLabelText('Motivo'), 'Producto vencido')
    await userEvent.click(screen.getByRole('button', { name: 'Registrar ajuste' }))

    expect(
      await screen.findByText('Stock insuficiente: disponible 10, solicitado 12.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Cantidad (und)')).toHaveAttribute('aria-invalid', 'true')
  })

  it('selects the scanned product when the barcode is followed by Enter', async () => {
    const scanned = { ...soda, barcode: '7702004003508' } as Product
    const other = { ...soda, id: 6, sku: 'BEB-002', barcode: '7702004003515' } as Product
    vi.mocked(listProducts).mockResolvedValue({
      items: [other, scanned],
      total: 2,
      page: 1,
      size: 8,
    })
    renderModal()

    await userEvent.type(screen.getByLabelText('Producto'), '7702004003508{Enter}')

    expect(await screen.findByLabelText('Cantidad (und)')).toBeInTheDocument()
    expect(screen.getByText('Gaseosa cola')).toBeInTheDocument()
    expect(listProducts).toHaveBeenCalledWith(
      expect.objectContaining({ search: '7702004003508', type: 'product', is_active: true }),
    )
  })
})
