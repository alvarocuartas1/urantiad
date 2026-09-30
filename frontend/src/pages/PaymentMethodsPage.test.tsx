import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/services/apiClient'
import {
  createPaymentMethod,
  listAllPaymentMethods,
  updatePaymentMethod,
} from '@/services/paymentMethods'
import { renderWithProviders } from '@/test/renderWithProviders'
import type { PaymentMethodDetail } from '@/types/paymentMethod'
import PaymentMethodsPage from './PaymentMethodsPage'

vi.mock('@/services/paymentMethods')

const CASH: PaymentMethodDetail = {
  id: 1,
  code: 'cash',
  name: 'Efectivo',
  is_cash: true,
  is_active: true,
  sort_order: 1,
}
const OTHER: PaymentMethodDetail = {
  id: 7,
  code: 'other',
  name: 'Otro',
  is_cash: false,
  is_active: false,
  sort_order: 7,
}

describe('PaymentMethodsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listAllPaymentMethods).mockResolvedValue([CASH, OTHER])
  })

  it('lists every method with its type and state', async () => {
    renderWithProviders(<PaymentMethodsPage />)

    const table = await screen.findByRole('table', { name: 'Métodos de pago' })
    const [, cashRow, otherRow] = within(table).getAllByRole('row')
    expect(cashRow).toHaveTextContent('Efectivo')
    expect(cashRow).toHaveTextContent('Efectivo · mueve la caja')
    expect(cashRow).toHaveTextContent('Activo')
    expect(otherRow).toHaveTextContent('Inactivo')
  })

  it('creates a method after the last one', async () => {
    const user = userEvent.setup()
    vi.mocked(createPaymentMethod).mockResolvedValue({
      ...OTHER,
      id: 8,
      code: 'bre_b',
      name: 'Bre-B',
      is_active: true,
      sort_order: 8,
    })
    renderWithProviders(<PaymentMethodsPage />)
    await screen.findByRole('table', { name: 'Métodos de pago' })

    await user.click(screen.getByRole('button', { name: 'Nuevo método' }))
    const dialog = screen.getByRole('dialog', { name: 'Nuevo método de pago' })
    expect(within(dialog).getByLabelText('Orden en el POS')).toHaveValue('8')
    await user.type(within(dialog).getByLabelText('Nombre'), 'Bre-B')
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }))

    expect(createPaymentMethod).toHaveBeenCalledWith({ name: 'Bre-B', sort_order: 8 })
  })

  it('shows a taken name next to the field', async () => {
    const user = userEvent.setup()
    vi.mocked(createPaymentMethod).mockRejectedValue(
      new ApiError(409, {
        detail: 'Ya existe un método de pago con ese nombre.',
        code: 'PAYMENT_METHOD_NAME_TAKEN',
      }),
    )
    renderWithProviders(<PaymentMethodsPage />)
    await screen.findByRole('table', { name: 'Métodos de pago' })

    await user.click(screen.getByRole('button', { name: 'Nuevo método' }))
    const dialog = screen.getByRole('dialog', { name: 'Nuevo método de pago' })
    await user.type(within(dialog).getByLabelText('Nombre'), 'nequi')
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }))

    expect(
      await within(dialog).findByText('Ya existe un método de pago con ese nombre.'),
    ).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'true')
  })

  it('does not let the cash method be deactivated', async () => {
    const user = userEvent.setup()
    vi.mocked(updatePaymentMethod).mockResolvedValue({ ...CASH, name: 'Contado' })
    renderWithProviders(<PaymentMethodsPage />)

    await user.click(await screen.findByRole('button', { name: 'Editar Efectivo' }))
    const dialog = screen.getByRole('dialog', { name: 'Editar método de pago' })
    const active = within(dialog).getByRole('checkbox', { name: 'Método activo' })
    expect(active).toBeDisabled()
    expect(active).toHaveAccessibleDescription(
      'El efectivo no se puede desactivar: es el método que mueve la caja.',
    )

    const name = within(dialog).getByLabelText('Nombre')
    await user.clear(name)
    await user.type(name, 'Contado')
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }))

    expect(updatePaymentMethod).toHaveBeenCalledWith(1, { name: 'Contado', sort_order: 1 })
  })

  it('reactivates another method', async () => {
    const user = userEvent.setup()
    vi.mocked(updatePaymentMethod).mockResolvedValue({ ...OTHER, is_active: true })
    renderWithProviders(<PaymentMethodsPage />)

    await user.click(await screen.findByRole('button', { name: 'Editar Otro' }))
    const dialog = screen.getByRole('dialog', { name: 'Editar método de pago' })
    await user.click(within(dialog).getByRole('checkbox', { name: 'Método activo' }))
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }))

    expect(updatePaymentMethod).toHaveBeenCalledWith(7, {
      name: 'Otro',
      sort_order: 7,
      is_active: true,
    })
  })
})
