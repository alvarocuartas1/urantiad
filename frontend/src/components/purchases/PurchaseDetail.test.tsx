import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { cancelPurchase } from '@/services/purchases'
import { adminUser, buildAuth, renderWithProviders } from '@/test/renderWithProviders'
import type { Purchase } from '@/types/purchase'
import { PurchaseDetail } from './PurchaseDetail'

vi.mock('@/services/purchases')

const purchase = {
  id: 12,
  number: 'COMPRA-000007',
  status: 'confirmed',
  supplier: { id: 3, name: 'Distribuidora Andina' },
  supplier_invoice_number: 'FE-1',
  subtotal: '43200.00',
  discount_total: '0.00',
  tax_total: '8208.00',
  total: '51408.00',
  amount_paid: '0.00',
  balance_due: '51408.00',
  notes: null,
  created_by: { id: 1, full_name: 'Marta' },
  created_at: '2026-09-29T14:00:00Z',
  confirmed_by: { id: 1, full_name: 'Marta' },
  confirmed_at: '2026-09-29T14:05:00Z',
  cancelled_by: null,
  cancelled_at: null,
  cancellation_reason: null,
  items: [],
} as unknown as Purchase

function renderDetail(permissions: string[]) {
  renderWithProviders(<PurchaseDetail purchase={purchase} />, {
    auth: buildAuth({ user: { ...adminUser, permissions } }),
  })
}

describe('PurchaseDetail', () => {
  it('lets only users with purchases.cancel cancel, with a reason', async () => {
    vi.mocked(cancelPurchase).mockResolvedValue({ ...purchase, status: 'cancelled' })
    renderDetail(['purchases.read', 'purchases.cancel'])

    await userEvent.click(screen.getByRole('button', { name: 'Anular compra' }))
    const dialog = screen.getByRole('dialog', { name: 'Anular COMPRA-000007' })
    const submit = within(dialog).getByRole('button', { name: 'Anular compra' })
    await userEvent.click(submit)
    expect(await screen.findByText(/mínimo 3 caracteres/)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Motivo de la anulación'), 'Costos errados')
    await userEvent.click(submit)

    expect(cancelPurchase).toHaveBeenCalledWith(12, 'Costos errados')
  })

  it('does not offer cancelling without the permission', () => {
    renderDetail(['purchases.read', 'purchases.manage'])

    expect(screen.getByText('Total', { selector: 'dt' }).parentElement).toHaveTextContent(
      '$ 51.408',
    )
    expect(screen.queryByRole('button', { name: 'Anular compra' })).not.toBeInTheDocument()
  })
})
