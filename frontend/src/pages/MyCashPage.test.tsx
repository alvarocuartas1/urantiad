import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/services/apiClient'
import {
  createCashMovement,
  getCurrentCashSession,
  listCashMovements,
  listCashRegisters,
  openCashSession,
} from '@/services/cash'
import { adminUser, buildAuth, renderWithProviders } from '@/test/renderWithProviders'
import type { CashRegister, CashSession } from '@/types/cash'
import MyCashPage from './MyCashPage'

vi.mock('@/services/cash')

const cashier = buildAuth({
  user: { ...adminUser, permissions: ['cash.operate', 'cash_registers.read'] },
})

const MAIN: CashRegister = {
  id: 1,
  name: 'Caja Principal',
  description: null,
  is_active: true,
  open_session: null,
  created_at: '2026-09-29T12:00:00Z',
  updated_at: '2026-09-29T12:00:00Z',
}

const BUSY: CashRegister = {
  ...MAIN,
  id: 2,
  name: 'Caja 2',
  open_session: { id: 9, user: { id: 5, full_name: 'Ana Pérez' }, opened_at: MAIN.created_at },
}

const SESSION: CashSession = {
  id: 3,
  cash_register: { id: 1, name: 'Caja Principal' },
  user: { id: 1, full_name: 'Administrador' },
  status: 'open',
  opening_amount: '100000.00',
  opening_notes: null,
  opened_at: '2026-09-29T13:00:00Z',
  summary: {
    opening_amount: '100000.00',
    total_income: '20000.00',
    total_withdrawals: '5000.00',
    total_cash_sales: '0.00',
    total_cash_cancellations: '0.00',
    expected_cash: '115000.00',
  },
}

const page = <T,>(items: T[]) => ({ items, total: items.length, page: 1, size: 20 })

function renderPage() {
  renderWithProviders(<MyCashPage />, { auth: cashier })
}

describe('MyCashPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listCashRegisters).mockResolvedValue(page([MAIN, BUSY]))
    vi.mocked(listCashMovements).mockResolvedValue(page([]))
  })

  it('opens a free register when the user has no session', async () => {
    vi.mocked(getCurrentCashSession).mockResolvedValue(null)
    vi.mocked(openCashSession).mockResolvedValue(SESSION)
    renderPage()

    const select = await screen.findByLabelText('Caja')
    expect(
      await within(select).findByRole('option', { name: 'Caja 2 (abierta por Ana Pérez)' }),
    ).toBeDisabled()

    await userEvent.selectOptions(select, 'Caja Principal')
    await userEvent.type(screen.getByLabelText('Dinero inicial'), '100000,50')
    await userEvent.click(screen.getByRole('button', { name: 'Abrir caja' }))

    expect(openCashSession).toHaveBeenCalledWith({
      cash_register_id: 1,
      opening_amount: '100000.50',
      opening_notes: null,
    })
    // The returned session replaces the form without another request.
    expect(await screen.findByText('Efectivo esperado')).toBeInTheDocument()
    expect(getCurrentCashSession).toHaveBeenCalledTimes(1)
  })

  it('validates the opening form and shows a busy register next to the field', async () => {
    vi.mocked(getCurrentCashSession).mockResolvedValue(null)
    vi.mocked(openCashSession).mockRejectedValue(
      new ApiError(409, { detail: 'La caja ya está abierta.', code: 'CASH_REGISTER_BUSY' }),
    )
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Abrir caja' }))
    expect(await screen.findByText('Seleccione una caja.')).toBeInTheDocument()
    expect(openCashSession).not.toHaveBeenCalled()

    await screen.findByRole('option', { name: 'Caja Principal' })
    await userEvent.selectOptions(screen.getByLabelText('Caja'), 'Caja Principal')
    await userEvent.type(screen.getByLabelText('Dinero inicial'), '0')
    await userEvent.click(screen.getByRole('button', { name: 'Abrir caja' }))

    expect(await screen.findByText('La caja ya está abierta.')).toBeInTheDocument()
    expect(screen.getByLabelText('Caja')).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows the summary and rejects a withdrawal above the expected cash', async () => {
    vi.mocked(getCurrentCashSession).mockResolvedValue(SESSION)
    renderPage()

    const expected = await screen.findByText('Efectivo esperado')
    expect(expected.parentElement).toHaveTextContent('115.000')

    await userEvent.click(screen.getByRole('button', { name: 'Registrar retiro' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Valor'), '115000,01')
    await userEvent.type(within(dialog).getByLabelText('Concepto'), 'Pago a proveedor')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar retiro' }))

    expect(
      await within(dialog).findByText(/El retiro no puede superar el efectivo en caja/),
    ).toBeInTheDocument()
    expect(createCashMovement).not.toHaveBeenCalled()
  })

  it('records an income and shows the updated summary', async () => {
    vi.mocked(getCurrentCashSession).mockResolvedValue(SESSION)
    vi.mocked(createCashMovement).mockResolvedValue({
      movement: {} as never,
      session: { ...SESSION, summary: { ...SESSION.summary, expected_cash: '125000.00' } },
    })
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Registrar ingreso' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Valor'), '10000')
    await userEvent.type(within(dialog).getByLabelText('Concepto'), ' Cambio en monedas ')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar ingreso' }))

    expect(createCashMovement).toHaveBeenCalledWith(3, {
      movement_type: 'income',
      amount: '10000',
      concept: 'Cambio en monedas',
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Efectivo esperado').parentElement).toHaveTextContent('125.000')
  })
})
