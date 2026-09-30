import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { listCategories } from '@/services/categories'
import { getSalesReport } from '@/services/reports'
import { getInventoryRotation, getSalesTrend, getTopProducts } from '@/services/statistics'
import { adminUser, buildAuth, renderWithProviders } from '@/test/renderWithProviders'
import type { SalesReportParams, SalesReportRow, SalesReportSummary } from '@/types/report'
import type { RotationRow, SalesTrend, SalesTrendParams, TopProduct } from '@/types/statistics'
import StatisticsPage from './StatisticsPage'

vi.mock('@/services/statistics')
vi.mock('@/services/reports')
vi.mock('@/services/categories')

const page = <T,>(items: T[]) => ({ items, total: items.length, page: 1, size: 20 })

const SUMMARY: SalesReportSummary = {
  sales_count: 3,
  quantity: null,
  total: '30000.00',
  discount_total: '0.00',
  tax_total: '0.00',
  net_total: '30000.00',
  cost_total: '18000.00',
  gross_margin: '12000.00',
  margin_percent: '40.00',
  average_ticket: '10000.00',
  cancelled_count: 0,
  cancelled_total: '0.00',
}

function group(key: string, label: string, total: string, sales_count: number): SalesReportRow {
  return { ...SUMMARY, key, label, code: null, total, sales_count }
}

function trend({ granularity, date_from, date_to }: SalesTrendParams): SalesTrend {
  return {
    granularity,
    date_from,
    date_to,
    points: [
      {
        period_start: date_from,
        sales_count: 1,
        total: '10000.00',
        net_total: '10000.00',
        gross_margin: '4000.00',
      },
      {
        period_start: date_to,
        sales_count: 2,
        total: '20000.00',
        net_total: '20000.00',
        gross_margin: '8000.00',
      },
    ],
  }
}

const WATER: TopProduct = {
  product_id: 1,
  name: 'Agua',
  sku: 'AGUA-1',
  unit_of_measure: 'unit',
  quantity: '12.00',
  total: '24000.00',
  gross_margin: '9600.00',
}

const IDLE: RotationRow = {
  product_id: 2,
  name: 'Gaseosa',
  sku: 'GASEOSA-1',
  category_name: 'Bebidas',
  unit_of_measure: 'unit',
  units_sold: '0.00',
  stock_start: '4.00',
  stock_end: '4.00',
  average_stock: '4.00',
  rotation: '0.00',
  days_of_inventory: null,
  measured_days: '30.00',
}

function renderStatistics(permissions: string[]) {
  const auth = buildAuth({ user: { ...adminUser, permissions } })
  return renderWithProviders(<StatisticsPage />, { auth })
}

describe('StatisticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.setSystemTime(new Date('2026-09-30T15:00:00Z'))
    vi.mocked(listCategories).mockResolvedValue(page([]))
    vi.mocked(getSalesTrend).mockImplementation(async (params) => trend(params))
    vi.mocked(getTopProducts).mockResolvedValue([WATER])
    vi.mocked(getSalesReport).mockImplementation(async (params: SalesReportParams) => ({
      ...page(
        params.group_by === 'category'
          ? [group('1', 'Bebidas', '30000.00', 3)]
          : [group('1', 'Efectivo', '20000.00', 2), group('2', 'Nequi', '10000.00', 1)],
      ),
      summary: SUMMARY,
    }))
    vi.mocked(getInventoryRotation).mockResolvedValue({
      ...page([IDLE]),
      summary: { products_count: 1, without_sales_count: 1, period_days: 30 },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows every section to the administrator', async () => {
    const user = userEvent.setup()
    renderStatistics(['sales.read_all', 'inventory.read', 'products.view_costs'])

    expect((await screen.findByText('Total vendido')).nextSibling).toHaveTextContent('$ 30.000')
    expect(screen.getByText('Mejor día')).toBeInTheDocument()
    expect(getSalesTrend).toHaveBeenCalledWith({
      granularity: 'day',
      date_from: '2026-09-01',
      date_to: '2026-09-30',
    })

    await user.click(await screen.findByRole('button', { name: 'Ver tabla' }))
    const table = screen.getByRole('table', { name: 'Evolución de ventas' })
    expect(within(table).getAllByRole('row')).toHaveLength(3)
    expect(within(table).getByText('$ 8.000')).toBeInTheDocument()

    expect(await screen.findByText('Agua')).toBeInTheDocument()
    expect(screen.getByText('12 und')).toBeInTheDocument()
    expect(await screen.findByText('67 % · 2 ventas')).toBeInTheDocument()
    expect(await screen.findByText('Sin ventas')).toBeInTheDocument()
  })

  it('asks the trend of whole weeks when grouping by week', async () => {
    const user = userEvent.setup()
    renderStatistics(['sales.read_all'])

    await user.selectOptions(screen.getByLabelText('Agrupar por'), 'week')

    expect(getSalesTrend).toHaveBeenLastCalledWith({
      granularity: 'week',
      date_from: '2026-07-13',
      date_to: '2026-09-30',
    })
    expect(await screen.findByText('Mejor semana')).toBeInTheDocument()
    // Rotation needs `inventory.read`.
    expect(screen.queryByText('Rotación de inventario')).not.toBeInTheDocument()
    expect(getInventoryRotation).not.toHaveBeenCalled()
  })

  it('ranks best sellers by value on request', async () => {
    const user = userEvent.setup()
    renderStatistics(['sales.read_all'])

    await user.click(await screen.findByRole('button', { name: 'Valor' }))

    expect(getTopProducts).toHaveBeenLastCalledWith(expect.objectContaining({ metric: 'total' }))
    expect(screen.getByRole('button', { name: 'Valor' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows only the rotation to the inventory role', async () => {
    renderStatistics(['inventory.read'])

    expect(await screen.findByText('Gaseosa')).toBeInTheDocument()
    expect(screen.queryByLabelText('Agrupar por')).not.toBeInTheDocument()
    expect(getSalesTrend).not.toHaveBeenCalled()
    expect(getSalesReport).not.toHaveBeenCalled()
    expect(getTopProducts).not.toHaveBeenCalled()
  })
})
