import { Lock, Pencil } from 'lucide-react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { Customer } from '@/types/customer'
import { formatDocument } from '@/utils/document'

interface CustomersTableProps {
  customers: Customer[]
  canManage: boolean
  onEdit: (customer: Customer) => void
}

const HEADER_CLASS = 'px-4 py-3 font-semibold'

export function CustomersTable({ customers, canManage, onEdit }: CustomersTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 uppercase">
          <tr>
            <th scope="col" className={HEADER_CLASS}>
              Cliente
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Contacto
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Dirección
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Estado
            </th>
            {canManage && (
              <th scope="col" className={`${HEADER_CLASS} text-right`}>
                Acciones
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {customers.map((customer) => (
            <tr key={customer.id} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <p className="font-medium text-slate-900">{customer.name}</p>
                <p className="text-xs text-slate-500">{formatDocument(customer)}</p>
              </td>
              <td className="px-4 py-3 text-slate-700">
                {[customer.phone, customer.email].filter(Boolean).join(' · ') || '—'}
              </td>
              <td className="px-4 py-3 text-slate-700">{customer.address ?? '—'}</td>
              <td className="px-4 py-3">
                {customer.is_default ? (
                  <StatusBadge size="sm" tone="neutral" icon={Lock} label="Por defecto" />
                ) : (
                  <StatusBadge
                    size="sm"
                    tone={customer.is_active ? 'ok' : 'neutral'}
                    label={customer.is_active ? 'Activo' : 'Inactivo'}
                  />
                )}
              </td>
              {canManage && (
                <td className="px-4 py-3 text-right">
                  {customer.is_default ? (
                    <span className="text-xs text-slate-500">No editable</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onEdit(customer)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-slate-700 hover:bg-slate-100"
                    >
                      <Pencil aria-hidden="true" className="size-4" />
                      Editar
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
