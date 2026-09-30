import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { cancelSale } from '@/services/sales'
import { adminUser, buildAuth, renderWithProviders } from '@/test/renderWithProviders'
import type { Sale } from '@/types/sale'
import { SaleDetail } from './SaleDetail'

vi.mock('@/services/sales')

const SALE: Sale = {
  id: 40,
  number: 'VENTA-000040',
  status: 'completed',
  customer: {
    id: 1,
    document_type: 'cc',
    document_number: '222222222222',
    name: 'Consumidor final',
    is_active: true,
    is_default: true,
  },
  user: { id: 2, full_name: 'Carla Cajera' },
  cash_session_id: 3,
  cash_register: { id: 1, name: 'Caja Principal' },
  subtotal: '6000.00',
  lines_discount: '0.00',
  sale_discount: '0.00',
  discount_total: '0.00',
  tax_total: '0.00',
  total: '6000.00',
  created_at: '2026-09-30T15:00:00Z',
  cancelled_at: null,
  notes: null,
  change_amount: '0.00',
  cancelled_by: null,
  cancellation_reason: null,
  items: [
    {
      id: 1,
      product: {
        id: 7,
        type: 'product',
        sku: 'AGUA-1',
        barcode: null,
        name: 'Agua 600 ml',
        unit_of_measure: 'unit',
      },
      quantity: '3.00',
      unit_price: '2000.00',
      discount: '0.00',
      sale_discount_share: '0.00',
      tax_rate: '0.00',
      tax_amount: '0.00',
      total: '6000.00',
      unit_cost: null,
    },
  ],
  payments: [
    {
      id: 1,
      payment_method: { id: 1, code: 'cash', name: 'Efectivo', is_cash: true },
      amount: '5000.00',
      amount_tendered: null,
      change_amount: '0.00',
      reference: null,
    },
    {
      id: 2,
      payment_method: { id: 2, code: 'nequi', name: 'Nequi', is_cash: false },
      amount: '1000.00',
      amount_tendered: null,
      change_amount: '0.00',
      reference: 'M123',
    },
  ],
}

const withPermissions = (permissions: string[]) =>
  buildAuth({ user: { ...adminUser, permissions } })

describe('SaleDetail', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lets the administrator cancel with a reason', async () => {
    vi.mocked(cancelSale).mockResolvedValue({ ...SALE, status: 'cancelled' })
    renderWithProviders(<SaleDetail sale={SALE} />, {
      auth: withPermissions(['sales.read', 'sales.cancel']),
    })

    expect(screen.getByText('Ref. M123')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Anular venta' }))
    expect(screen.getByText(/se retiran \$\s?5\.000 en efectivo/)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Motivo de la anulación'), 'Cobro duplicado')
    const dialog = screen.getByRole('dialog', { name: 'Anular VENTA-000040' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Anular venta' }))

    expect(cancelSale).toHaveBeenCalledWith(40, 'Cobro duplicado')
  })

  it('does not offer cancelling without the permission', () => {
    renderWithProviders(<SaleDetail sale={SALE} />, { auth: withPermissions(['sales.read']) })

    expect(screen.queryByRole('button', { name: 'Anular venta' })).not.toBeInTheDocument()
  })
})
