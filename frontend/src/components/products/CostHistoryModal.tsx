import { ArrowDown, ArrowUp, Equal, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { useCostHistory } from '@/hooks/usePurchases'
import type { Product } from '@/types/catalog'
import type { CostSummary } from '@/types/purchase'
import { UNIT_ABBREVIATIONS } from '@/utils/catalog'
import { toCents } from '@/utils/decimal'
import { getErrorMessage } from '@/utils/errors'
import { formatCurrency, formatDateTime, formatQuantity } from '@/utils/format'

const PAGE_SIZE = 10

/** Cost change against the previous purchase: arrow + sign + text, never color alone. */
function Variation({ percent }: { percent: string | null }) {
  if (percent === null) return <span className="text-xs text-slate-500">Primera compra</span>
  const cents = toCents(percent)
  const [Icon, className, label]: [LucideIcon, string, string] =
    cents > 0n
      ? [ArrowUp, 'text-red-700', 'Subió']
      : cents < 0n
        ? [ArrowDown, 'text-emerald-800', 'Bajó']
        : [Equal, 'text-slate-600', 'Igual']
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${className}`}>
      <Icon aria-hidden="true" className="size-3.5" />
      {label} {cents === 0n ? '' : `${formatQuantity(percent.replace('-', ''))} %`}
    </span>
  )
}

function Summary({ summary }: { summary: CostSummary }) {
  const items: [string, string][] = [
    ['Costo promedio', formatCurrency(summary.average_cost)],
    ['Último costo', formatCurrency(summary.last_cost)],
    ['Precio sin IVA', formatCurrency(summary.sale_price_before_tax)],
    [
      'Margen bruto',
      `${formatCurrency(summary.gross_margin)}${
        summary.gross_margin_percent === null
          ? ''
          : ` (${formatQuantity(summary.gross_margin_percent)} %)`
      }`,
    ],
  ]
  return (
    <dl className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-slate-500">{label}</dt>
          <dd className="text-sm font-medium text-slate-900">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

interface CostHistoryModalProps {
  product: Product
  onClose: () => void
}

export function CostHistoryModal({ product, onClose }: CostHistoryModalProps) {
  const [page, setPage] = useState(1)
  const { data, isPending, isError, error } = useCostHistory(product.id, page, PAGE_SIZE)

  return (
    <Modal title={`Historial de costos · ${product.name}`} onClose={onClose} size="lg">
      <div className="space-y-4">
        {isError && <Alert>{getErrorMessage(error)}</Alert>}
        {isPending && <p className="text-sm text-slate-600">Cargando historial…</p>}
        {data && (
          <>
            <Summary summary={data.summary} />
            <p className="text-xs text-slate-500">
              Costos netos sin IVA de las compras confirmadas. El margen bruto usa el costo
              promedio; no es la utilidad neta.
            </p>
            {data.items.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">
                El producto aún no tiene compras confirmadas.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {data.items.map((entry) => (
                  <li
                    key={entry.purchase_id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-sm"
                  >
                    <div className="min-w-40">
                      <p className="font-medium text-slate-900">
                        {formatCurrency(entry.unit_cost)}
                      </p>
                      <Variation percent={entry.variation_percent} />
                    </div>
                    <div className="text-slate-700">
                      <p>{entry.supplier.name}</p>
                      <p className="text-xs text-slate-500">
                        {entry.purchase_number} · {formatQuantity(entry.quantity)}{' '}
                        {UNIT_ABBREVIATIONS[product.unit_of_measure]}
                      </p>
                    </div>
                    <p className="ml-auto text-xs text-slate-500">
                      {formatDateTime(entry.confirmed_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <Pagination
              page={data.page}
              size={data.size}
              total={data.total}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </Modal>
  )
}
