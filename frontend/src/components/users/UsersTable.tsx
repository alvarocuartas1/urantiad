import { KeyRound, Pencil } from 'lucide-react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { User } from '@/types/user'
import { formatDateTime } from '@/utils/format'

interface UsersTableProps {
  users: User[]
  canManage: boolean
  onEdit: (user: User) => void
  onResetPassword: (user: User) => void
}

export function UsersTable({ users, canManage, onEdit, onResetPassword }: UsersTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 uppercase">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">
              Usuario
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Nombre
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Rol
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Estado
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Último ingreso
            </th>
            {canManage && (
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                Acciones
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {users.map((user) => (
            <tr key={user.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium text-slate-900">{user.username}</td>
              <td className="px-4 py-3 text-slate-700">{user.full_name}</td>
              <td className="px-4 py-3 text-slate-700">{user.role.name}</td>
              <td className="px-4 py-3">
                <StatusBadge
                  size="sm"
                  tone={user.is_active ? 'ok' : 'neutral'}
                  label={user.is_active ? 'Activo' : 'Inactivo'}
                />
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                {formatDateTime(user.last_login_at)}
              </td>
              {canManage && (
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onEdit(user)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-slate-700 hover:bg-slate-100"
                    >
                      <Pencil aria-hidden="true" className="size-4" />
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => onResetPassword(user)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-slate-700 hover:bg-slate-100"
                    >
                      <KeyRound aria-hidden="true" className="size-4" />
                      Contraseña
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
