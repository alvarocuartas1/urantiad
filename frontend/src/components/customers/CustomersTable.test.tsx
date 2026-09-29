import { render, screen, within } from '@testing-library/react'
import type { Customer } from '@/types/customer'
import { CustomersTable } from './CustomersTable'

function customer(overrides: Partial<Customer>): Customer {
  return {
    id: 1,
    document_type: 'cc',
    document_number: '222222222222',
    name: 'Consumidor final',
    phone: null,
    email: null,
    address: null,
    is_active: true,
    is_default: false,
    created_at: '2026-09-29T12:00:00Z',
    updated_at: '2026-09-29T12:00:00Z',
    ...overrides,
  }
}

describe('CustomersTable', () => {
  it('marks the default customer as read-only', () => {
    render(
      <CustomersTable
        customers={[
          customer({ is_default: true }),
          customer({ id: 2, name: 'Laura', document_number: '10', is_active: false }),
        ]}
        canManage
        onEdit={vi.fn()}
      />,
    )

    const defaultRow = screen.getByRole('row', { name: /Consumidor final/ })
    const laura = screen.getByRole('row', { name: /Laura/ })
    expect(within(defaultRow).getByText('Por defecto')).toBeInTheDocument()
    expect(within(defaultRow).getByText('No editable')).toBeInTheDocument()
    expect(within(defaultRow).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    expect(within(laura).getByText('Inactivo')).toBeInTheDocument()
    expect(within(laura).getByRole('button', { name: 'Editar' })).toBeInTheDocument()
  })
})
