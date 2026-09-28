import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/services/apiClient'
import { listCategories } from '@/services/categories'
import { createProduct } from '@/services/products'
import { renderWithProviders } from '@/test/renderWithProviders'
import type { Category } from '@/types/catalog'
import { ProductFormModal } from './ProductFormModal'

vi.mock('@/services/categories')
vi.mock('@/services/products')

const beverages: Category = {
  id: 7,
  name: 'Bebidas',
  description: null,
  is_active: true,
  created_at: '2026-09-28T00:00:00Z',
  updated_at: '2026-09-28T00:00:00Z',
}

async function renderForm() {
  vi.mocked(listCategories).mockResolvedValue({ items: [beverages], total: 1, page: 1, size: 100 })
  const onClose = vi.fn()
  renderWithProviders(<ProductFormModal onClose={onClose} />)
  await screen.findByRole('option', { name: 'Bebidas' })
  return onClose
}

async function fillRequiredFields() {
  await userEvent.selectOptions(screen.getByLabelText('Categoría'), 'Bebidas')
  await userEvent.type(screen.getByLabelText('SKU'), 'beb-001')
  await userEvent.type(screen.getByLabelText('Nombre'), 'Gaseosa cola')
  await userEvent.type(screen.getByLabelText('Precio de venta'), '2500')
}

describe('ProductFormModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a product with stock levels and without cost', async () => {
    vi.mocked(createProduct).mockResolvedValue({} as never)
    const onClose = await renderForm()
    await fillRequiredFields()
    await userEvent.clear(screen.getByLabelText('Stock objetivo'))
    await userEvent.type(screen.getByLabelText('Stock objetivo'), '20,5')

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(createProduct).toHaveBeenCalledWith({
      type: 'product',
      sku: 'BEB-001',
      barcode: null,
      name: 'Gaseosa cola',
      description: null,
      category_id: 7,
      unit_of_measure: 'unit',
      tax_rate: '19',
      sale_price: '2500',
      min_stock: '0',
      reorder_point: '0',
      target_stock: '20.5',
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('validates the order of stock levels', async () => {
    await renderForm()
    await fillRequiredFields()
    await userEvent.clear(screen.getByLabelText('Stock mínimo'))
    await userEvent.type(screen.getByLabelText('Stock mínimo'), '10')

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('Debe ser mayor o igual al stock mínimo.')).toBeInTheDocument()
    expect(createProduct).not.toHaveBeenCalled()
  })

  it('rejects thousands separators instead of misreading the amount', async () => {
    await renderForm()
    await fillRequiredFields()
    await userEvent.clear(screen.getByLabelText('Precio de venta'))
    await userEvent.type(screen.getByLabelText('Precio de venta'), '2.500')

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(
      await screen.findByText('Ingrese un número sin puntos de miles (máximo 2 decimales).'),
    ).toBeInTheDocument()
    expect(createProduct).not.toHaveBeenCalled()
  })

  it('hides stock levels for services and sends their cost', async () => {
    vi.mocked(createProduct).mockResolvedValue({} as never)
    await renderForm()
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'service')
    await fillRequiredFields()

    expect(screen.queryByLabelText('Stock mínimo')).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Costo de referencia (opcional)'), '60')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    const payload = vi.mocked(createProduct).mock.calls[0]?.[0]
    expect(payload).toMatchObject({ type: 'service', cost: '60' })
    expect(payload).not.toHaveProperty('min_stock')
  })

  it('shows a duplicated SKU next to the field', async () => {
    vi.mocked(createProduct).mockRejectedValue(
      new ApiError(409, { detail: 'El SKU ya existe.', code: 'SKU_TAKEN' }),
    )
    await renderForm()
    await fillRequiredFields()

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('El SKU ya existe.')).toBeInTheDocument()
    expect(screen.getByLabelText('SKU')).toHaveAttribute('aria-invalid', 'true')
  })
})
