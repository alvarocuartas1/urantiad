import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getCurrentCashSession } from '@/services/cash'
import { listProducts } from '@/services/products'
import { createSale, listPaymentMethods } from '@/services/sales'
import { adminUser, buildAuth, renderWithProviders } from '@/test/renderWithProviders'
import type { CashSession } from '@/types/cash'
import type { Product } from '@/types/catalog'
import type { Sale } from '@/types/sale'
import PosPage from './PosPage'

vi.mock('@/services/cash')
vi.mock('@/services/products')
vi.mock('@/services/sales')
vi.mock('@/services/customers')

const cashier = buildAuth({
  user: {
    ...adminUser,
    permissions: ['sales.create', 'sales.read', 'cash.operate', 'customers.read'],
  },
})

const SESSION: CashSession = {
  id: 3,
  cash_register: { id: 1, name: 'Caja Principal' },
  user: { id: 1, full_name: 'Administrador' },
  status: 'open',
  opening_amount: '100000.00',
  opening_notes: null,
  opened_at: '2026-09-30T13:00:00Z',
  summary: {
    opening_amount: '100000.00',
    total_income: '0.00',
    total_withdrawals: '0.00',
    total_cash_sales: '0.00',
    total_cash_cancellations: '0.00',
    expected_cash: '100000.00',
  },
}

const WATER: Product = {
  id: 7,
  type: 'product',
  sku: 'AGUA-1',
  barcode: '7700000000017',
  name: 'Agua 600 ml',
  description: null,
  category: { id: 1, name: 'Bebidas', is_active: true },
  unit_of_measure: 'unit',
  tax_rate: '0.00',
  sale_price: '2000.00',
  average_cost: null,
  last_cost: null,
  current_stock: '10.00',
  min_stock: '0.00',
  reorder_point: '0.00',
  target_stock: '0.00',
  stock_status: 'ok',
  is_active: true,
  created_at: '2026-09-30T12:00:00Z',
  updated_at: '2026-09-30T12:00:00Z',
}

const page = <T,>(items: T[]) => ({ items, total: items.length, page: 1, size: 8 })

function renderPage() {
  renderWithProviders(<PosPage />, { auth: cashier })
}

async function scan(code: string) {
  const scanner = await screen.findByLabelText('Producto')
  await userEvent.type(scanner, `${code}{Enter}`)
}

describe('PosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getCurrentCashSession).mockResolvedValue(SESSION)
    vi.mocked(listProducts).mockResolvedValue(page([WATER]))
    vi.mocked(listPaymentMethods).mockResolvedValue([
      { id: 1, code: 'cash', name: 'Efectivo', is_cash: true },
      { id: 2, code: 'nequi', name: 'Nequi', is_cash: false },
    ])
  })

  it('asks to open a register when the user has none', async () => {
    vi.mocked(getCurrentCashSession).mockResolvedValue(null)
    renderPage()

    expect(
      await screen.findByText('Debe abrir una caja antes de registrar ventas.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir a Mi caja' })).toHaveAttribute('href', '/caja')
  })

  it('scans products, charges in cash and shows the change', async () => {
    const sale = {
      id: 40,
      number: 'VENTA-000040',
      total: '4000.00',
      change_amount: '6000.00',
    } as Sale
    vi.mocked(createSale).mockResolvedValue(sale)
    renderPage()

    await scan('7700000000017')
    await scan('7700000000017')
    expect(screen.getByLabelText('Cantidad de Agua 600 ml')).toHaveValue('2')

    await userEvent.keyboard('{F2}')
    const dialog = await screen.findByRole('dialog', { name: /Cobrar/ })
    await userEvent.type(within(dialog).getByLabelText('Recibido'), '10000')
    expect(within(dialog).getByText('Cambio').nextSibling).toHaveTextContent('6.000')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar venta' }))

    expect(createSale).toHaveBeenCalledWith({
      customer_id: null,
      items: [{ product_id: 7, quantity: '2', discount: '0.00' }],
      sale_discount: '0.00',
      payments: [
        { payment_method_id: 1, amount: '4000', amount_tendered: '10000', reference: null },
      ],
      notes: null,
    })
    const done = await screen.findByRole('dialog', { name: 'Venta VENTA-000040 registrada' })
    expect(within(done).getByText(/6\.000/)).toBeInTheDocument()

    await userEvent.click(within(done).getByRole('button', { name: 'Nueva venta' }))
    expect(screen.queryByLabelText('Cantidad de Agua 600 ml')).not.toBeInTheDocument()
  })

  it('does not charge while the payments do not add up to the total', async () => {
    renderPage()
    await scan('AGUA-1')

    await userEvent.click(screen.getByRole('button', { name: 'Cobrar (F2)' }))
    const dialog = await screen.findByRole('dialog', { name: /Cobrar/ })
    const amount = within(dialog).getByLabelText('Valor')
    await userEvent.clear(amount)
    await userEvent.type(amount, '1500')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar venta' }))

    expect(await within(dialog).findByText(/Los pagos suman/)).toBeInTheDocument()
    expect(createSale).not.toHaveBeenCalled()
  })

  it('cannot charge an empty sale', async () => {
    renderPage()

    expect(await screen.findByRole('button', { name: 'Cobrar (F2)' })).toBeDisabled()
  })
})
