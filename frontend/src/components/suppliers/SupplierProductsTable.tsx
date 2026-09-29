import { Pencil, Trash2 } from 'lucide-react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { SupplierProduct } from '@/types/supplier'
import { formatCurrency, formatDateTime } from '@/utils/format'
import { formatDocument } from '@/utils/supplier'

interface SupplierProductsTableProps {
  links: SupplierProduct[]
  /** Side of the relation shown in the first column. */
  show: 'product' | 'supplier'
  /** Management actions; omitted when the user lacks the permission. */
  onEdit?: (link: SupplierProduct) => void
  onRemove?: (link: SupplierProduct) => void
}

const HEADER_CLASS = 'px-3 py-2 font-semibold'
const ACTION_CLASS =
  'inline-flex items-center gap-1 rounded-md px-2 py-1 text-slate-700 hover:bg-slate-100'

function LinkedEntity({ link, show }: { link: SupplierProduct; show: 'product' | 'supplier' }) {
  const entity =
    show === 'product'
      ? { name: link.product.name, detail: link.product.sku, active: link.product.is_active }
      : {
          name: link.supplier.name,
          detail: formatDocument(link.supplier),
          active: link.supplier.is_active,
        }
  return (
    <>
      <p className="font-medium text-slate-900">{entity.name}</p>
      <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        {entity.detail}
        {!entity.active && <StatusBadge size="sm" tone="neutral" label="Inactivo" />}
      </p>
    </>
  )
}

export function SupplierProductsTable({
  links,
  show,
  onEdit,
  onRemove,
}: SupplierProductsTableProps) {
  const hasActions = Boolean(onEdit ?? onRemove)
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 uppercase">
          <tr>
            <th scope="col" className={HEADER_CLASS}>
              {show === 'product' ? 'Producto' : 'Proveedor'}
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Cód. proveedor
            </th>
            <th scope="col" className={`${HEADER_CLASS} text-right`}>
              Precio sin IVA
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Precio actualizado
            </th>
            {hasActions && (
              <th scope="col" className={`${HEADER_CLASS} text-right`}>
                Acciones
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {links.map((link) => (
            <tr key={link.id} className="align-top hover:bg-slate-50">
              <td className="px-3 py-2">
                <LinkedEntity link={link} show={show} />
                {link.notes && <p className="mt-1 text-xs text-slate-600">{link.notes}</p>}
              </td>
              <td className="px-3 py-2 text-slate-700">{link.supplier_sku ?? '—'}</td>
              <td className="px-3 py-2 text-right font-medium whitespace-nowrap text-slate-900">
                {formatCurrency(link.purchase_price)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                {formatDateTime(link.price_updated_at)}
              </td>
              {hasActions && (
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    {onEdit && (
                      <button type="button" onClick={() => onEdit(link)} className={ACTION_CLASS}>
                        <Pencil aria-hidden="true" className="size-4" />
                        Editar
                      </button>
                    )}
                    {onRemove && (
                      <button type="button" onClick={() => onRemove(link)} className={ACTION_CLASS}>
                        <Trash2 aria-hidden="true" className="size-4" />
                        Quitar
                      </button>
                    )}
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
