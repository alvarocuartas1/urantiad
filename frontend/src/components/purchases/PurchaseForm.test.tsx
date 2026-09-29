import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/services/apiClient'
import { listProducts } from '@/services/products'
import { confirmPurchase, createPurchase } from '@/services/purchases'
import { listProductSuppliers, listSuppliers } from '@/services/suppliers'
import { adminUser, buildAuth, renderWithProviders } from '@/test/renderWithProviders'
import type { Product } from '@/types/catalog'
import type { Purchase } from '@/types/purchase'
import type { Supplier, SupplierProduct } from '@/types/supplier'
import { PurchaseForm } from './PurchaseForm'

vi.mock('@/services/products')
vi.mock('@/services/purchases')
vi.mock('@/services/suppliers')

const keeper = buildAuth({
  user: {
    ...adminUser,
    permissions: ['products.read', 'products.view_costs', 'suppliers.read', 'purchases.manage'],
  },
})

const supplier = { id: 3, name: 'Distribuidora Andina', is_active: true } as Supplier

const notebook = {
  id: 8,
  type: 'product',
  sku: 'CUA-001',
  barcode: '7700000000011',
  name: 'Cuaderno 100 hojas',
  unit_of_measure: 'unit',
  tax_rate: '19.00',
  last_cost: '1700.00',
  current_stock: '4.00',
  is_active: true,
} as Product

const saved = {
  id: 12,
  number: null,
  status: 'draft',
  total: '51408.00',
  items: [
    {
      id: 1,
      product: notebook,
      quantity: '24.00',
      net_unit_cost: '1800.00',
    },
  ],
} as unknown as Purchase

async function renderForm() {
  vi.mocked(listSuppliers).mockResolvedValue({ items: [supplier], total: 1, page: 1, size: 100 })
  vi.mocked(listProducts).mockResolvedValue({ items: [notebook], total: 1, page: 1, size: 8 })
  vi.mocked(listProductSuppliers).mockResolvedValue([
    { supplier: { id: 3 }, purchase_price: '1800.00' } as SupplierProduct,
  ])
  renderWithProviders(<PurchaseForm />, { auth: keeper, route: '/compras/nueva' })
  await screen.findByRole('option', { name: 'Distribuidora Andina' })
  await userEvent.selectOptions(screen.getByLabelText('Proveedor'), '3')
}

async function scan(code: string) {
  await userEvent.type(screen.getByLabelText('Producto'), `${code}{Enter}`)
}

describe('PurchaseForm', () => {
  beforeEach(() => vi.clearAllMocks())

  it("adds a scanned product at the supplier's price and saves the draft", async () => {
    vi.mocked(createPurchase).mockResolvedValue(saved)
    await renderForm()

    await scan('7700000000011')
    const quantity = await screen.findByLabelText('Cantidad de Cuaderno 100 hojas')
    expect(quantity).toHaveFocus()
    expect(screen.getByLabelText('Costo unit. sin IVA de Cuaderno 100 hojas')).toHaveValue('1800')
    // The quantity is selected: typing replaces it; Enter goes back to the scanner.
    await userEvent.keyboard('24{Enter}')
    expect(screen.getByLabelText('Producto')).toHaveFocus()
    // 24 × 1800 = 43200 + 19 % IVA = 51408.
    expect(screen.getByText('Total', { selector: 'dt' }).parentElement).toHaveTextContent(
      '$ 51.408',
    )

    await userEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))

    expect(createPurchase).toHaveBeenCalledWith({
      supplier_id: 3,
      supplier_invoice_number: null,
      amount_paid: '0',
      notes: null,
      items: [{ product_id: 8, quantity: '24', unit_cost: '1800', discount: '0', tax_rate: '19' }],
    })
  })

  it('scanning a product already in the purchase focuses its line', async () => {
    await renderForm()

    await scan('7700000000011')
    await screen.findByLabelText('Cantidad de Cuaderno 100 hojas')
    await scan('7700000000011')

    expect(await screen.findByRole('status')).toHaveTextContent('ya está en la compra')
    expect(screen.getAllByLabelText(/^Cantidad de/)).toHaveLength(1)
    expect(screen.getByLabelText('Cantidad de Cuaderno 100 hojas')).toHaveFocus()
  })

  it('shows a duplicated supplier invoice next to its field', async () => {
    vi.mocked(createPurchase).mockRejectedValue(
      new ApiError(409, {
        detail: 'La factura FE-1 de este proveedor ya está registrada en otra compra.',
        code: 'DUPLICATE_SUPPLIER_INVOICE',
      }),
    )
    await renderForm()

    await userEvent.type(screen.getByLabelText('Factura del proveedor (opcional)'), 'FE-1')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))

    const invoice = screen.getByLabelText('Factura del proveedor (opcional)')
    expect(invoice).toHaveAttribute('aria-invalid', 'true')
    expect(await screen.findByText(/ya está registrada/)).toBeInTheDocument()
  })

  it('saves and confirms in one flow', async () => {
    vi.mocked(createPurchase).mockResolvedValue(saved)
    vi.mocked(confirmPurchase).mockResolvedValue({ ...saved, status: 'confirmed' })
    await renderForm()
    await scan('7700000000011')
    await screen.findByLabelText('Cantidad de Cuaderno 100 hojas')

    await userEvent.click(screen.getByRole('button', { name: 'Guardar y confirmar' }))
    const dialog = await screen.findByRole('dialog', { name: 'Confirmar compra' })
    expect(dialog).toHaveTextContent('Cuaderno 100 hojas')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar compra' }))

    expect(confirmPurchase).toHaveBeenCalledWith(12)
  })
})
