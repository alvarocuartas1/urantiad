import { Banknote, Pencil } from 'lucide-react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { PaymentMethodDetail } from '@/types/paymentMethod'

interface PaymentMethodsTableProps {
  methods: PaymentMethodDetail[]
  onEdit: (method: PaymentMethodDetail) => void
}

const HEADER_CLASS = 'px-4 py-3 font-semibold'

/** Payment methods in the order the POS shows them. */
export function PaymentMethodsTable({ methods, onEdit }: PaymentMethodsTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[560px] text-left text-sm">
        <caption className="sr-only">Métodos de pago</caption>
        <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 uppercase">
          <tr>
            <th scope="col" className={`${HEADER_CLASS} text-right`}>
              Orden
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Método
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
          {methods.map((method) => (
            <tr key={method.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-right text-slate-700 tabular-nums">
                {method.sort_order}
              </td>
              <td className="px-4 py-3">
                <p className="font-medium text-slate-900">{method.name}</p>
                <p className="text-xs text-slate-500">{method.code}</p>
                {method.is_cash && (
                  <div className="mt-1">
                    <StatusBadge
                      size="sm"
                      tone="neutral"
                      icon={Banknote}
                      label="Efectivo · mueve la caja"
                    />
                  </div>
                )}
              </td>
              <td className="px-4 py-3">
                <StatusBadge
                  size="sm"
                  tone={method.is_active ? 'ok' : 'neutral'}
                  label={method.is_active ? 'Activo' : 'Inactivo'}
                />
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  type="button"
                  onClick={() => onEdit(method)}
                  aria-label={`Editar ${method.name}`}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-slate-700 hover:bg-slate-100"
                >
                  <Pencil aria-hidden="true" className="size-4" />
                  Editar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
