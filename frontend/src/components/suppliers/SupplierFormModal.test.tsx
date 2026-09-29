import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/services/apiClient'
import { createSupplier } from '@/services/suppliers'
import { renderWithProviders } from '@/test/renderWithProviders'
import { SupplierFormModal } from './SupplierFormModal'

vi.mock('@/services/suppliers')

function renderForm() {
  const onClose = vi.fn()
  renderWithProviders(<SupplierFormModal onClose={onClose} />)
  return onClose
}

describe('SupplierFormModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('normalizes the document and sends empty optional fields as null', async () => {
    vi.mocked(createSupplier).mockResolvedValue({} as never)
    const onClose = renderForm()

    await userEvent.type(screen.getByLabelText('Número de documento'), '900.123.456-7')
    await userEvent.type(screen.getByLabelText('Nombre o razón social'), ' Distribuidora Andina ')
    await userEvent.type(screen.getByLabelText('Correo (opcional)'), 'Ventas@Andina.CO')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(createSupplier).toHaveBeenCalledWith({
      document_type: 'nit',
      document_number: '900123456-7',
      name: 'Distribuidora Andina',
      contact_name: null,
      phone: null,
      email: 'ventas@andina.co',
      address: null,
      city: null,
      notes: null,
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('validates the document, phone and email', async () => {
    renderForm()

    await userEvent.type(screen.getByLabelText('Número de documento'), '900#123')
    await userEvent.type(screen.getByLabelText('Nombre o razón social'), 'Proveedor')
    await userEvent.type(screen.getByLabelText('Teléfono (opcional)'), '300-ABC')
    await userEvent.type(screen.getByLabelText('Correo (opcional)'), 'no-es-correo')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('Use solo letras, números y guion.')).toBeInTheDocument()
    expect(screen.getByText('Use solo números, espacios y los signos + - ( ).')).toBeInTheDocument()
    expect(screen.getByText('Ingrese un correo válido.')).toBeInTheDocument()
    expect(createSupplier).not.toHaveBeenCalled()
  })

  it('shows a duplicated document next to the field', async () => {
    const message = 'Ya existe un proveedor con ese tipo y número de documento.'
    vi.mocked(createSupplier).mockRejectedValue(
      new ApiError(409, { detail: message, code: 'SUPPLIER_DOCUMENT_TAKEN' }),
    )
    const onClose = renderForm()

    await userEvent.type(screen.getByLabelText('Número de documento'), '900123456')
    await userEvent.type(screen.getByLabelText('Nombre o razón social'), 'Copia')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.getByLabelText('Número de documento')).toHaveAttribute('aria-invalid', 'true')
    expect(onClose).not.toHaveBeenCalled()
  })
})
