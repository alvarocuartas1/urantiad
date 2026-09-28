import { Pencil, Trash2 } from 'lucide-react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { Category } from '@/types/catalog'

interface CategoriesTableProps {
  categories: Category[]
  canManage: boolean
  onEdit: (category: Category) => void
  onDelete: (category: Category) => void
}

const ACTION_CLASS =
  'inline-flex items-center gap-1 rounded-md px-2 py-1 text-slate-700 hover:bg-slate-100'

export function CategoriesTable({ categories, canManage, onEdit, onDelete }: CategoriesTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 uppercase">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">
              Nombre
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Descripción
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Estado
            </th>
            {canManage && (
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                Acciones
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {categories.map((category) => (
            <tr key={category.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium text-slate-900">{category.name}</td>
              <td className="px-4 py-3 text-slate-600">{category.description ?? '—'}</td>
              <td className="px-4 py-3">
                <StatusBadge
                  size="sm"
                  tone={category.is_active ? 'ok' : 'neutral'}
                  label={category.is_active ? 'Activa' : 'Inactiva'}
                />
              </td>
              {canManage && (
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button type="button" onClick={() => onEdit(category)} className={ACTION_CLASS}>
                      <Pencil aria-hidden="true" className="size-4" />
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(category)}
                      className={ACTION_CLASS}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                      Eliminar
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
