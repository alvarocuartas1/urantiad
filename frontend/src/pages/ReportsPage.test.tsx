import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router'
import { ApiError } from '@/services/apiClient'
import { listCashRegisters } from '@/services/cash'
import { listCategories } from '@/services/categories'
import {
  exportSalesReport,
  getCashReport,
  getPurchasesReport,
  getSalesReport,
} from '@/services/reports'
import { listSuppliers } from '@/services/suppliers'
import { adminUser, buildAuth, renderWithProviders } from '@/test/renderWithProviders'
import type { CashReportRow, SalesReportRow, SalesReportSummary } from '@/types/report'
import { saveFile } from '@/utils/download'
import ReportsPage from './ReportsPage'

vi.mock('@/services/reports')
vi.mock('@/services/categories')
vi.mock('@/services/cash')
vi.mock('@/services/suppliers')
vi.mock('@/utils/download')

const page = <T,>(items: T[]) => ({ items, total: items.length, page: 1, size: 20 })

const SALES_METRICS = {
  sales_count: 2,
  quantity: null,
  total: '12450.00',
  discount_total: '500.00',
  tax_total: '950.00',
  net_total: '11500.00',
  cost_total: '6850.00',
  gross_margin: '4650.00',
  margin_percent: '40.43',
}

const SALES_SUMMARY: SalesReportSummary = {
  ...SALES_METRICS,
  average_ticket: '6225.00',
  cancelled_count: 1,
  cancelled_total: '2000.00',
}

const SALES_DAY: SalesReportRow = {
  key: '2026-09-30',
  label: '2026-09-30',
  code: null,
  ...SALES_METRICS,
}

const CASH_ROW: CashReportRow = {
  key: '3',
  label: 'Caja Principal',
  code: null,
  sessions_count: 2,
  open_count: 1,
  opening_total: '100000.00',
  income_total: '0.00',
  withdrawals_total: '0.00',
  cash_sales_total: '20000.00',
  cash_cancellations_total: '0.00',
  expected_cash: '70000.00',
  counted_cash: '68000.00',
  surplus_total: '0.00',
  shortage_total: '2000.00',
  difference_total: '-2000.00',
  sessions_with_difference: 1,
}

function renderReports(permissions: string[], route = '/reportes') {
  const auth = buildAuth({ user: { ...adminUser, permissions } })
  return renderWithProviders(
    <Routes>
      <Route path="/reportes" element={<ReportsPage />} />
      <Route path="/reportes/:tab" element={<ReportsPage />} />
    </Routes>,
    { auth, route },
  )
}

describe('ReportsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.setSystemTime(new Date('2026-09-30T15:00:00Z'))
    vi.mocked(listCategories).mockResolvedValue(page([]))
    vi.mocked(listCashRegisters).mockResolvedValue(page([]))
    vi.mocked(listSuppliers).mockResolvedValue(page([]))
    vi.mocked(getSalesReport).mockResolvedValue({ ...page([SALES_DAY]), summary: SALES_SUMMARY })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens the first report the user may see and hides the others', async () => {
    vi.mocked(getPurchasesReport).mockResolvedValue({
      ...page([]),
      summary: {
        purchases_count: 0,
        quantity: null,
        subtotal: '0.00',
        discount_total: '0.00',
        tax_total: '0.00',
        total: '0.00',
        cancelled_count: 0,
        cancelled_total: '0.00',
      },
    })
    renderReports(['purchases.read', 'inventory.read', 'products.read'])

    const tabs = screen.getByRole('navigation', { name: 'Reportes' })
    expect(
      within(tabs)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Compras', 'Inventario'])
    expect(await screen.findByText('Total comprado')).toBeInTheDocument()
    expect(within(tabs).getByRole('link', { name: 'Compras' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(getSalesReport).not.toHaveBeenCalled()
  })

  it('shows the sales of the current month with margins', async () => {
    renderReports(['sales.read_all', 'products.view_costs'], '/reportes/ventas')

    expect(await screen.findByRole('columnheader', { name: 'Margen bruto' })).toBeInTheDocument()
    expect(getSalesReport).toHaveBeenCalledWith(
      expect.objectContaining({
        group_by: 'day',
        date_from: '2026-09-01T00:00:00-05:00',
        date_to: '2026-10-01T00:00:00-05:00',
      }),
    )
    const row = screen.getByRole('row', { name: /30 sept 2026/ })
    expect(within(row).getByText('40,43 %')).toBeInTheDocument()
    expect(screen.getByText('$ 6.225')).toBeInTheDocument()
    expect(screen.getByText(/no suman al total/)).toBeInTheDocument()
  })

  it('by payment method drops the line filters and the cost columns', async () => {
    const user = userEvent.setup()
    renderReports(['sales.read_all', 'products.view_costs'], '/reportes/ventas')
    await screen.findByRole('columnheader', { name: 'Costo' })

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Agrupar por' }),
      'payment_method',
    )

    await waitFor(() =>
      expect(getSalesReport).toHaveBeenLastCalledWith(
        expect.objectContaining({ group_by: 'payment_method', page: 1, product_id: undefined }),
      ),
    )
    expect(screen.queryByRole('combobox', { name: 'Categoría' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Filtrar por producto/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Costo' })).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Método de pago' })).toBeInTheDocument()
  })

  it('hides costs and margins without permission to view costs', async () => {
    renderReports(['sales.read_all'], '/reportes/ventas')

    await screen.findByText('Total vendido')
    expect(screen.queryByText(/Margen/)).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Costo' })).not.toBeInTheDocument()
  })

  it('shows cash differences with color, icon and text', async () => {
    const user = userEvent.setup()
    vi.mocked(getCashReport).mockImplementation(async ({ group_by }) => {
      const row = group_by === 'day' ? { ...CASH_ROW, key: '2026-09-30' } : CASH_ROW
      return { ...page([row]), summary: CASH_ROW }
    })
    renderReports(['cash.supervise', 'cash_registers.read'], '/reportes/caja')
    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Agrupar por' }),
      'cash_register',
    )

    const row = await screen.findByRole('row', { name: /Caja Principal/ })
    expect(within(row).getByText('Faltante $ 2.000')).toBeInTheDocument()
    expect(within(row).getByText('1 abierta')).toBeInTheDocument()

    // Rows of another grouping are never shown under the new columns (ids as dates).
    await user.selectOptions(screen.getByRole('combobox', { name: 'Agrupar por' }), 'day')
    expect(await screen.findByRole('row', { name: /30 sept 2026/ })).toBeInTheDocument()
  })

  it('exports the report on screen with its filters, without the page', async () => {
    const user = userEvent.setup()
    const file = { blob: new Blob(['csv']), filename: 'ventas-por-metodo-de-pago.csv' }
    vi.mocked(exportSalesReport).mockResolvedValue(file)
    renderReports(['sales.read_all'], '/reportes/ventas')
    await screen.findByText('Total vendido')

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Agrupar por' }),
      'payment_method',
    )
    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }))

    await waitFor(() => expect(saveFile).toHaveBeenCalledWith(file))
    const params = vi.mocked(exportSalesReport).mock.calls[0]?.[0]
    expect(params).toMatchObject({
      group_by: 'payment_method',
      date_from: '2026-09-01T00:00:00-05:00',
      date_to: '2026-10-01T00:00:00-05:00',
    })
    expect(params).not.toHaveProperty('page')
  })

  it('shows why an export failed', async () => {
    const user = userEvent.setup()
    vi.mocked(exportSalesReport).mockRejectedValue(
      new ApiError(422, { detail: 'Acote el periodo o los filtros.', code: 'REPORT_TOO_LARGE' }),
    )
    renderReports(['sales.read_all'], '/reportes/ventas')
    await screen.findByText('Total vendido')

    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Acote el periodo o los filtros.')
    expect(saveFile).not.toHaveBeenCalled()
  })
})
