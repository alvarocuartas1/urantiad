import { screen, within } from '@testing-library/react'
import { ApiError } from '@/services/apiClient'
import { getDashboard } from '@/services/dashboard'
import { getHealth } from '@/services/health'
import { adminUser, buildAuth, renderWithProviders } from '@/test/renderWithProviders'
import type { Dashboard, SalesToday } from '@/types/dashboard'
import type { PurchaseSummary } from '@/types/purchase'
import type { SaleSummary } from '@/types/sale'
import HomePage from './HomePage'

vi.mock('@/services/health')
vi.mock('@/services/dashboard')

const EMPTY: Dashboard = {
  sales_today: null,
  recent_sales: null,
  cash_registers: null,
  stock: null,
  recent_purchases: null,
}

const document = { document_type: 'cc', document_number: '222222222222' } as const

const sale: SaleSummary = {
  id: 7,
  number: 'VENTA-000007',
  status: 'completed',
  customer: { id: 1, name: 'Consumidor final', is_active: true, is_default: true, ...document },
  user: { id: 2, full_name: 'Carla Cajera' },
  cash_session_id: 3,
  cash_register: { id: 1, name: 'Caja Principal' },
  subtotal: '10000.00',
  lines_discount: '0.00',
  sale_discount: '0.00',
  discount_total: '0.00',
  tax_total: '0.00',
  total: '10000.00',
  created_at: '2026-09-30T15:00:00Z',
  cancelled_at: null,
}

const purchase: PurchaseSummary = {
  id: 4,
  number: 'COMPRA-000004',
  status: 'confirmed',
  supplier: { id: 1, name: 'Distribuidora Andina', is_active: true, ...document },
  supplier_invoice_number: null,
  subtotal: '50000.00',
  discount_total: '0.00',
  tax_total: '0.00',
  total: '50000.00',
  amount_paid: '50000.00',
  balance_due: '0.00',
  created_by: { id: 1, full_name: 'Administrador' },
  created_at: '2026-09-29T15:00:00Z',
  confirmed_at: '2026-09-29T15:00:00Z',
  cancelled_at: null,
}

const salesToday: SalesToday = {
  scope: 'all',
  business_date: '2026-09-30',
  sales_count: 2,
  total: '10000.00',
  average_ticket: '5000.00',
  cancelled_count: 1,
  cancelled_total: '2000.00',
  by_payment_method: [
    { id: 1, name: 'Efectivo', sales_count: 2, total: '9000.00' },
    { id: 2, name: 'Nequi', sales_count: 1, total: '1000.00' },
  ],
}

const FULL: Dashboard = {
  sales_today: salesToday,
  recent_sales: [sale],
  cash_registers: [
    {
      id: 1,
      name: 'Caja Principal',
      open_session: {
        id: 3,
        user: { id: 2, full_name: 'Carla Cajera' },
        opened_at: '2026-09-30T13:00:00Z',
        expected_cash: '105000.00',
      },
    },
    { id: 2, name: 'Caja Dos', open_session: null },
  ],
  stock: {
    out_of_stock_count: 2,
    critical_count: 1,
    low_count: 0,
    most_urgent: [
      {
        id: 9,
        sku: 'AGUA-1',
        barcode: null,
        name: 'Agua',
        category: { id: 1, name: 'Bebidas', is_active: true },
        unit_of_measure: 'unit',
        current_stock: '0.00',
        min_stock: '2.00',
        reorder_point: '5.00',
        target_stock: '10.00',
        stock_status: 'out_of_stock',
        suggested_quantity: '10.00',
      },
    ],
  },
  recent_purchases: [purchase],
}

const admin = buildAuth({
  user: { ...adminUser, permissions: ['cash.supervise', 'cash.operate'] },
})

function section(name: string) {
  return screen.getByRole('region', { name })
}

describe('HomePage', () => {
  beforeEach(() => {
    vi.mocked(getHealth).mockResolvedValue({ status: 'ok', database: 'ok' })
    vi.mocked(getDashboard).mockResolvedValue(EMPTY)
  })

  it('greets the user and shows connected status when the API and database are up', async () => {
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

  it('shows every section the API sends', async () => {
    vi.mocked(getDashboard).mockResolvedValue(FULL)

    renderWithProviders(<HomePage />, { auth: admin })

    const today = await screen.findByRole('region', { name: 'Ventas de hoy' })
    expect(within(today).getByText('Total vendido').nextSibling).toHaveTextContent('10.000')
    expect(within(today).getByText('Anuladas').parentElement).toHaveTextContent('2.000')

    const methods = section('Ventas por método de pago')
    expect(within(methods).getByText('90 % · 2 ventas')).toBeInTheDocument()
    expect(within(methods).getByText('10 % · 1 venta')).toBeInTheDocument()

    const registers = section('Estado de las cajas')
    expect(within(registers).getByText('Abierta')).toBeInTheDocument()
    expect(within(registers).getByText('Cerrada')).toBeInTheDocument()
    expect(within(registers).getByText(/Esperado/)).toHaveTextContent('105.000')
    expect(within(registers).getByRole('link', { name: 'Ver aperturas' })).toHaveAttribute(
      'href',
      '/caja/aperturas',
    )

    const stock = section('Productos por reponer')
    expect(within(stock).getAllByText('Agotado')).toHaveLength(2)
    expect(within(stock).getByText('Agua')).toBeInTheDocument()

    expect(
      within(section('Ventas recientes')).getByRole('link', { name: 'VENTA-000007' }),
    ).toHaveAttribute('href', '/ventas/7')
    expect(
      within(section('Compras recientes')).getByRole('link', { name: 'COMPRA-000004' }),
    ).toHaveAttribute('href', '/compras/4')
  })

  it("titles a cashier's own sales and leaves out the sections the API does not send", async () => {
    vi.mocked(getDashboard).mockResolvedValue({
      ...EMPTY,
      sales_today: { ...salesToday, scope: 'own' },
      recent_sales: [],
    })

    renderWithProviders(<HomePage />)

    expect(await screen.findByRole('heading', { name: 'Mis ventas de hoy' })).toBeInTheDocument()
    expect(
      within(section('Ventas recientes')).getByText('No hay ventas registradas.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Productos por reponer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Compras recientes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Estado de las cajas' })).not.toBeInTheDocument()
  })

  it('says when no product needs replenishment', async () => {
    vi.mocked(getDashboard).mockResolvedValue({
      ...EMPTY,
      stock: { out_of_stock_count: 0, critical_count: 0, low_count: 0, most_urgent: [] },
    })

    renderWithProviders(<HomePage />)

    expect(await screen.findByText('Ningún producto requiere reposición.')).toBeInTheDocument()
  })
})
