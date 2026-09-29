import { Lock, LockOpen, Pencil } from 'lucide-react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { CashRegister } from '@/types/cash'
import { formatDateTime } from '@/utils/format'

interface CashRegistersTableProps {
  registers: CashRegister[]
  canManage: boolean
  onEdit: (register: CashRegister) => void
}

const HEADER_CLASS = 'px-4 py-3 font-semibold'

export function CashRegistersTable({ registers, canManage, onEdit }: CashRegistersTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 uppercase">
          <tr>
            <th scope="col" className={HEADER_CLASS}>
              Caja
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Apertura
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
          {registers.map((register) => (
            <tr key={register.id} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <p className="font-medium text-slate-900">{register.name}</p>
                {register.description && (
                  <p className="text-xs text-slate-500">{register.description}</p>
                )}
              </td>
              <td className="px-4 py-3">
                {register.open_session ? (
                  <div className="space-y-0.5">
                    <StatusBadge
                      size="sm"
                      tone="ok"
                      icon={LockOpen}
                      label={`Abierta por ${register.open_session.user.full_name}`}
                    />
                    <p className="text-xs text-slate-500">
                      Desde {formatDateTime(register.open_session.opened_at)}
                    </p>
                  </div>
                ) : (
                  <StatusBadge size="sm" tone="neutral" icon={Lock} label="Sin apertura" />
                )}
              </td>
              <td className="px-4 py-3">
                <StatusBadge
                  size="sm"
                  tone={register.is_active ? 'ok' : 'neutral'}
                  label={register.is_active ? 'Activa' : 'Inactiva'}
                />
              </td>
              {canManage && (
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onEdit(register)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-slate-700 hover:bg-slate-100"
                  >
                    <Pencil aria-hidden="true" className="size-4" />
                    Editar
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
