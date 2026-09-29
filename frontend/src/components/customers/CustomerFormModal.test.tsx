import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/services/apiClient'
import { createCustomer, updateCustomer } from '@/services/customers'
import { renderWithProviders } from '@/test/renderWithProviders'
import type { Customer } from '@/types/customer'
import { CustomerFormModal } from './CustomerFormModal'

vi.mock('@/services/customers')

const CUSTOMER: Customer = {
  id: 7,
  document_type: 'cc',
  document_number: '1020304050',
  name: 'Laura Martínez',
  phone: '3001234567',
  email: null,
  address: null,
  is_active: true,
  is_default: false,
  created_at: '2026-09-29T12:00:00Z',
  updated_at: '2026-09-29T12:00:00Z',
}

function renderForm(customer?: Customer) {
  const onClose = vi.fn()
  renderWithProviders(<CustomerFormModal customer={customer} onClose={onClose} />)
  return onClose
}

describe('CustomerFormModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('normalizes the document and sends empty optional fields as null', async () => {
    vi.mocked(createCustomer).mockResolvedValue({} as never)
    const onClose = renderForm()

    await userEvent.type(screen.getByLabelText('Número de documento'), '1.020.304.050')
    await userEvent.type(screen.getByLabelText('Nombre'), ' Laura Martínez ')
    await userEvent.type(screen.getByLabelText('Correo (opcional)'), 'Laura@Correo.CO')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(createCustomer).toHaveBeenCalledWith({
      document_type: 'cc',
      document_number: '1020304050',
      name: 'Laura Martínez',
      phone: null,
      email: 'laura@correo.co',
      address: null,
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('validates the required fields, phone and email', async () => {
    renderForm()

    await userEvent.type(screen.getByLabelText('Teléfono (opcional)'), '300-ABC')
    await userEvent.type(screen.getByLabelText('Correo (opcional)'), 'no-es-correo')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('Ingrese el número de documento.')).toBeInTheDocument()
    expect(screen.getByText('Ingrese el nombre del cliente.')).toBeInTheDocument()
    expect(screen.getByText('Use solo números, espacios y los signos + - ( ).')).toBeInTheDocument()
    expect(screen.getByText('Ingrese un correo válido.')).toBeInTheDocument()
    expect(createCustomer).not.toHaveBeenCalled()
  })

  it('deactivates an existing customer', async () => {
    vi.mocked(updateCustomer).mockResolvedValue({} as never)
    renderForm(CUSTOMER)

    await userEvent.click(screen.getByLabelText('Cliente activo'))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(updateCustomer).toHaveBeenCalledWith(7, {
      document_type: 'cc',
      document_number: '1020304050',
      name: 'Laura Martínez',
      phone: '3001234567',
      email: null,
      address: null,
      is_active: false,
    })
  })

  it('shows a duplicated document next to the field', async () => {
    const message = 'Ya existe un cliente con ese tipo y número de documento.'
    vi.mocked(createCustomer).mockRejectedValue(
      new ApiError(409, { detail: message, code: 'CUSTOMER_DOCUMENT_TAKEN' }),
    )
    const onClose = renderForm()

    await userEvent.type(screen.getByLabelText('Número de documento'), '1020304050')
    await userEvent.type(screen.getByLabelText('Nombre'), 'Copia')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.getByLabelText('Número de documento')).toHaveAttribute('aria-invalid', 'true')
    expect(onClose).not.toHaveBeenCalled()
  })
})
