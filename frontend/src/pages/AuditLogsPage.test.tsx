import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { listAuditLogs } from '@/services/audit'
import { listUsers } from '@/services/users'
import { adminUser, buildAuth, renderWithProviders } from '@/test/renderWithProviders'
import type { AuditLog } from '@/types/audit'
import AuditLogsPage from './AuditLogsPage'

vi.mock('@/services/audit')
vi.mock('@/services/users')

const auditor = buildAuth({
  user: { ...adminUser, permissions: ['audit.read', 'users.read'] },
})

const PRICE_CHANGE: AuditLog = {
  id: 2,
  created_at: '2026-09-30T15:00:00Z',
  user: { id: 1, full_name: 'Administrador' },
  action: 'product.update',
  entity_type: 'product',
  entity_id: 7,
  entity_label: 'AGUA-1 · Agua 600 ml',
  old_values: { sale_price: '2000.00' },
  new_values: { sale_price: '2500.00' },
  ip_address: '192.168.1.20',
  user_agent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
}

const CANCELLED_SALE: AuditLog = {
  id: 1,
  created_at: '2026-09-30T14:00:00Z',
  user: { id: 1, full_name: 'Administrador' },
  action: 'sale.cancel',
  entity_type: 'sale',
  entity_id: 12,
  entity_label: 'VENTA-000012',
  old_values: { status: 'completed' },
  new_values: { status: 'cancelled', cancellation_reason: 'Cobro duplicado' },
  ip_address: null,
  user_agent: null,
}

const page = <T,>(items: T[]) => ({ items, total: items.length, page: 1, size: 20 })

describe('AuditLogsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listAuditLogs).mockResolvedValue(page([PRICE_CHANGE, CANCELLED_SALE]))
    vi.mocked(listUsers).mockResolvedValue(page([]))
  })

  it('lists the records with their action and summary', async () => {
    renderWithProviders(<AuditLogsPage />, { auth: auditor })

    const priceRow = await screen.findByRole('row', { name: /AGUA-1/ })
    expect(within(priceRow).getByText('Producto editado')).toBeInTheDocument()
    expect(within(priceRow).getByText('Cambió: Precio de venta')).toBeInTheDocument()
    const saleRow = screen.getByRole('row', { name: /VENTA-000012/ })
    expect(within(saleRow).getByRole('link', { name: 'VENTA-000012' })).toHaveAttribute(
      'href',
      '/ventas/12',
    )
    expect(within(saleRow).getByText('Motivo: Cobro duplicado')).toBeInTheDocument()
  })

  it('shows the old and new values in the detail', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AuditLogsPage />, { auth: auditor })

    await user.click(
      await screen.findByRole('button', { name: 'Ver detalle de AGUA-1 · Agua 600 ml' }),
    )

    const dialog = screen.getByRole('dialog', { name: 'Detalle de auditoría' })
    const row = within(dialog).getByRole('row', { name: /Precio de venta/ })
    expect(row.textContent?.replace(/\s/g, ' ')).toBe('Precio de venta$ 2.000$ 2.500')
    expect(within(dialog).getByRole('columnheader', { name: 'Anterior' })).toBeInTheDocument()
    expect(within(dialog).getByText('192.168.1.20')).toBeInTheDocument()
    expect(within(dialog).getByText('Edge · Windows')).toHaveAttribute(
      'title',
      expect.stringContaining('Edg/140'),
    )
  })

  it('filters by area and clears an action of another area', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AuditLogsPage />, { auth: auditor })
    await screen.findAllByRole('row')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Acción' }), 'user.update')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Área' }), 'sale')

    await waitFor(() =>
      expect(listAuditLogs).toHaveBeenLastCalledWith(
        expect.objectContaining({ entity_type: 'sale', action: undefined, page: 1 }),
      ),
    )
    const actions = screen.getByRole('combobox', { name: 'Acción' })
    expect(
      within(actions)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Todas las acciones', 'Venta anulada'])
  })

  it('hides the user filter without permission to list users', async () => {
    const auth = buildAuth({ user: { ...adminUser, permissions: ['audit.read'] } })
    renderWithProviders(<AuditLogsPage />, { auth })
    await screen.findAllByRole('row')

    expect(screen.queryByRole('combobox', { name: 'Usuario' })).not.toBeInTheDocument()
    expect(listUsers).not.toHaveBeenCalled()
  })
})
