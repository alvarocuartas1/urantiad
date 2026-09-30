import { LoaderCircle, UserRound } from 'lucide-react'
import { useId, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useCustomers } from '@/hooks/useCustomers'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import type { CustomerSummary } from '@/types/customer'
import { formatDocument } from '@/utils/document'

const RESULT_LIMIT = 8

interface CustomerPickerModalProps {
  /** `null` selects "Consumidor final". */
  onSelect: (customer: CustomerSummary | null) => void
  onClose: () => void
}

/** Search an active customer by name, document or phone for the sale. */
export function CustomerPickerModal({ onSelect, onClose }: CustomerPickerModalProps) {
  const inputId = useId()
  const [term, setTerm] = useState('')
  const search = useDebouncedValue(term.trim())
  const { data, isFetching } = useCustomers({
    page: 1,
    size: RESULT_LIMIT,
    search: search || undefined,
    is_active: true,
  })
  const customers = (data?.items ?? []).filter((customer) => !customer.is_default)

  return (
    <Modal title="Cliente de la venta" onClose={onClose}>
      <div className="space-y-3">
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
          Buscar cliente
        </label>
        <div className="relative">
          <input
            id={inputId}
            type="search"
            value={term}
            autoComplete="off"
            placeholder="Nombre, documento o teléfono…"
            onChange={(event) => setTerm(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-9 text-sm focus:outline-2 focus:outline-slate-900"
          />
          {isFetching && (
            <LoaderCircle
              aria-label="Buscando"
              className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-slate-500"
            />
          )}
        </div>
        <ul
          aria-label="Clientes"
          className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200"
        >
          <li>
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 focus-visible:bg-slate-100 focus-visible:outline-none"
            >
              <UserRound aria-hidden="true" className="size-4 text-slate-500" />
              <span className="font-medium text-slate-900">Consumidor final</span>
            </button>
          </li>
          {customers.map((customer) => (
            <li key={customer.id}>
              <button
                type="button"
                onClick={() => onSelect(customer)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 focus-visible:bg-slate-100 focus-visible:outline-none"
              >
                <span className="block font-medium text-slate-900">{customer.name}</span>
                <span className="block text-xs text-slate-500">{formatDocument(customer)}</span>
              </button>
            </li>
          ))}
        </ul>
        {search && data && customers.length === 0 && (
          <p className="text-sm text-slate-600">No se encontraron clientes activos.</p>
        )}
      </div>
    </Modal>
  )
}
