import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/services/apiClient'
import { createCashRegister, updateCashRegister } from '@/services/cash'
import { renderWithProviders } from '@/test/renderWithProviders'
import type { CashRegister } from '@/types/cash'
import { CashRegisterFormModal } from './CashRegisterFormModal'

vi.mock('@/services/cash')

const REGISTER: CashRegister = {
  id: 4,
  name: 'Caja Fotocopias',
  description: 'Junto a la fotocopiadora',
  is_active: true,
  open_session: null,
  created_at: '2026-09-29T12:00:00Z',
  updated_at: '2026-09-29T12:00:00Z',
}

describe('CashRegisterFormModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a register and shows a duplicated name next to the field', async () => {
    vi.mocked(createCashRegister).mockRejectedValueOnce(
      new ApiError(409, {
        detail: 'Ya existe una caja con ese nombre.',
        code: 'CASH_REGISTER_NAME_TAKEN',
      }),
    )
    vi.mocked(createCashRegister).mockResolvedValueOnce(REGISTER)
    const onClose = vi.fn()
    renderWithProviders(<CashRegisterFormModal onClose={onClose} />)

    await userEvent.type(screen.getByLabelText('Nombre'), ' Caja Principal ')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('Ya existe una caja con ese nombre.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'true')
    expect(createCashRegister).toHaveBeenCalledWith({ name: 'Caja Principal', description: null })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('explains why an open register cannot be deactivated', async () => {
    vi.mocked(updateCashRegister).mockRejectedValue(
      new ApiError(409, {
        detail: 'La caja tiene una apertura activa. Ciérrela antes de desactivarla.',
        code: 'CASH_REGISTER_OPEN',
      }),
    )
    renderWithProviders(<CashRegisterFormModal register={REGISTER} onClose={vi.fn()} />)

    await userEvent.click(screen.getByLabelText('Caja activa'))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(updateCashRegister).toHaveBeenCalledWith(4, {
      name: 'Caja Fotocopias',
      description: 'Junto a la fotocopiadora',
      is_active: false,
    })
    expect(await screen.findByText(/tiene una apertura activa/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
