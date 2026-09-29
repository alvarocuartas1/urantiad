import { Package, Pencil } from 'lucide-react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { Supplier } from '@/types/supplier'
import { formatDocument } from '@/utils/document'

interface SuppliersTableProps {
  suppliers: Supplier[]
  canManage: boolean
  onEdit: (supplier: Supplier) => void
  onProducts: (supplier: Supplier) => void
}

const HEADER_CLASS = 'px-4 py-3 font-semibold'
const ACTION_CLASS =
  'inline-flex items-center gap-1 rounded-md px-2 py-1 text-slate-700 hover:bg-slate-100'

export function SuppliersTable({ suppliers, canManage, onEdit, onProducts }: SuppliersTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 uppercase">
          <tr>
            <th scope="col" className={HEADER_CLASS}>
              Proveedor
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Contacto
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Ciudad
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Estado
            </th>
            <th scope="col" className={`${HEADER_CLASS} text-right`}>
              Acciones
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {suppliers.map((supplier) => (
            <tr key={supplier.id} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <p className="font-medium text-slate-900">{supplier.name}</p>
                <p className="text-xs text-slate-500">{formatDocument(supplier)}</p>
              </td>
              <td className="px-4 py-3 text-slate-700">
                <p>{supplier.contact_name ?? '—'}</p>
                {(supplier.phone ?? supplier.email) && (
                  <p className="text-xs text-slate-500">
                    {[supplier.phone, supplier.email].filter(Boolean).join(' · ')}
                  </p>
                )}
              </td>
              <td className="px-4 py-3 text-slate-700">{supplier.city ?? '—'}</td>
              <td className="px-4 py-3">
                <StatusBadge
                  size="sm"
                  tone={supplier.is_active ? 'ok' : 'neutral'}
                  label={supplier.is_active ? 'Activo' : 'Inactivo'}
                />
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap justify-end gap-1">
                  {canManage && (
                    <button type="button" onClick={() => onEdit(supplier)} className={ACTION_CLASS}>
                      <Pencil aria-hidden="true" className="size-4" />
                      Editar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onProducts(supplier)}
                    className={ACTION_CLASS}
                  >
                    <Package aria-hidden="true" className="size-4" />
                    Productos
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
