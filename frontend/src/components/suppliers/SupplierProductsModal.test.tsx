import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { listProducts } from '@/services/products'
import { addSupplierProduct, listSupplierProducts } from '@/services/suppliers'
import { adminUser, buildAuth, renderWithProviders } from '@/test/renderWithProviders'
import type { Product } from '@/types/catalog'
import type { Supplier, SupplierProduct } from '@/types/supplier'
import { SupplierProductsModal } from './SupplierProductsModal'

vi.mock('@/services/products')
vi.mock('@/services/suppliers')

const keeper = buildAuth({
  user: { ...adminUser, permissions: ['products.read', 'suppliers.read', 'suppliers.manage'] },
})

const supplier: Supplier = {
  id: 3,
  document_type: 'nit',
  document_number: '900123456-7',
  name: 'Distribuidora Andina',
  contact_name: null,
  phone: null,
  email: null,
  address: null,
  city: null,
  notes: null,
  is_active: true,
  created_at: '2026-09-28T00:00:00Z',
  updated_at: '2026-09-28T00:00:00Z',
}

const notebook = {
  id: 8,
  type: 'product',
  sku: 'CUA-001',
  barcode: '7700000000011',
  name: 'Cuaderno 100 hojas',
  unit_of_measure: 'unit',
  current_stock: '4.00',
  is_active: true,
} as Product

const pencilLink: SupplierProduct = {
  id: 1,
  supplier,
  product: { id: 9, sku: 'LAP-001', name: 'Lápiz HB', unit_of_measure: 'unit', is_active: true },
  supplier_sku: 'AND-77',
  purchase_price: '850.00',
  price_updated_at: '2026-09-28T15:00:00Z',
  notes: null,
  created_at: '2026-09-28T15:00:00Z',
  updated_at: '2026-09-28T15:00:00Z',
}

function renderModal(target: Supplier = supplier) {
  vi.mocked(listSupplierProducts).mockResolvedValue({
    items: [pencilLink],
    total: 1,
    page: 1,
    size: 10,
  })
  renderWithProviders(<SupplierProductsModal supplier={target} onClose={vi.fn()} />, {
    auth: keeper,
  })
}

describe('SupplierProductsModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists the linked products with their purchase price', async () => {
    renderModal()

    const row = (await screen.findByText('Lápiz HB')).closest('tr')
    expect(row).toHaveTextContent('AND-77')
    expect(row).toHaveTextContent('$ 850')
  })

  it('links a scanned product with its price', async () => {
    vi.mocked(listProducts).mockResolvedValue({ items: [notebook], total: 1, page: 1, size: 8 })
    vi.mocked(addSupplierProduct).mockResolvedValue({} as never)
    renderModal()
    await screen.findByText('Lápiz HB')

    await userEvent.click(screen.getByRole('button', { name: 'Asociar producto' }))
    await userEvent.type(screen.getByLabelText('Producto'), '7700000000011{Enter}')
    await userEvent.type(
      await screen.findByLabelText('Código en el proveedor (opcional)'),
      'AND-12',
    )
    await userEvent.type(screen.getByLabelText('Precio de compra sin IVA (opcional)'), '1800,5')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(addSupplierProduct).toHaveBeenCalledWith(3, {
      product_id: 8,
      supplier_sku: 'AND-12',
      purchase_price: '1800.5',
      notes: null,
    })
    expect(await screen.findByText('Lápiz HB')).toBeInTheDocument()
  })

  it('rejects prices with thousands separators', async () => {
    renderModal()

    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }))
    const price = screen.getByLabelText('Precio de compra sin IVA (opcional)')
    expect(price).toHaveValue('850')
    await userEvent.clear(price)
    await userEvent.type(price, '1.800')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText(/sin puntos de miles/)).toBeInTheDocument()
  })

  it('does not offer linking products to an inactive supplier', async () => {
    renderModal({ ...supplier, is_active: false })

    expect(await screen.findByText('Proveedor inactivo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Asociar producto' })).not.toBeInTheDocument()
  })
})
