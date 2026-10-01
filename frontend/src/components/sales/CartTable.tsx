import { TriangleAlert, Trash2 } from 'lucide-react'
import { useId, type KeyboardEvent } from 'react'
import { UNIT_ABBREVIATIONS } from '@/utils/catalog'
import { fromCents } from '@/utils/decimal'
import { formatCurrency } from '@/utils/format'
import { lineErrors, stockWarning, type CartLine, type LineAmounts } from '@/utils/sale'

const HEADER_CLASS = 'px-3 py-2 font-semibold'
const INPUT_CLASS =
  'w-full rounded-md border border-slate-300 px-2 py-1 text-right text-sm tabular-nums focus:outline-2 focus:outline-brand-600 aria-invalid:border-red-500'

interface CartTableProps {
  lines: CartLine[]
  amounts: LineAmounts[]
  onQuantityChange: (productId: number, value: string) => void
  onDiscountChange: (productId: number, value: string) => void
  onRemove: (productId: number) => void
  /** Enter inside a line: the caller returns to the scanner. */
  onLineEnter: () => void
}

/** Lines of the POS cart: quantity and discount are edited in place. */
export function CartTable({
  lines,
  amounts,
  onQuantityChange,
  onDiscountChange,
  onRemove,
  onLineEnter,
}: CartTableProps) {
  const errorPrefix = useId()

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    onLineEnter()
  }

  if (lines.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
        Escanee o busque productos y servicios para agregarlos a la venta.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 uppercase">
          <tr>
            <th scope="col" className={HEADER_CLASS}>
              Producto
            </th>
            <th scope="col" className={`${HEADER_CLASS} w-28`}>
              Cantidad
            </th>
            <th scope="col" className={`${HEADER_CLASS} text-right`}>
              Precio
            </th>
            <th scope="col" className={`${HEADER_CLASS} w-32`}>
              Descuento
            </th>
            <th scope="col" className={`${HEADER_CLASS} text-right`}>
              Total
            </th>
            <th scope="col" className={HEADER_CLASS}>
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {lines.map((line, index) => {
            const { product } = line
            const errors = lineErrors(line)
            const warning = stockWarning(line)
            const quantityErrorId = `${errorPrefix}-q-${product.id}`
            const discountErrorId = `${errorPrefix}-d-${product.id}`
            const amount = amounts[index]
            return (
              <tr key={product.id} className="align-top">
                <td className="px-3 py-2">
                  <p className="font-medium text-slate-900">{product.name}</p>
                  <p className="text-xs text-slate-500">
                    {product.sku}
                    {product.type === 'service' && ' · Servicio'}
                  </p>
                  {warning && (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-amber-800">
                      <TriangleAlert aria-hidden="true" className="size-3.5" />
                      {warning}
                    </p>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <input
                      aria-label={`Cantidad de ${product.name}`}
                      inputMode="decimal"
                      autoComplete="off"
                      value={line.quantity}
                      aria-invalid={errors.quantity ? true : undefined}
                      aria-describedby={errors.quantity ? quantityErrorId : undefined}
                      onChange={(event) => onQuantityChange(product.id, event.target.value)}
                      onKeyDown={onKeyDown}
                      className={INPUT_CLASS}
                    />
                    <span className="text-xs text-slate-500">
                      {UNIT_ABBREVIATIONS[product.unit_of_measure]}
                    </span>
                  </div>
                  {errors.quantity && (
                    <p id={quantityErrorId} className="mt-1 text-xs text-red-700">
                      {errors.quantity}
                    </p>
                  )}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                  {formatCurrency(product.sale_price)}
                </td>
                <td className="px-3 py-2">
                  <input
                    aria-label={`Descuento de ${product.name}`}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
                    value={line.discount}
                    aria-invalid={errors.discount ? true : undefined}
                    aria-describedby={errors.discount ? discountErrorId : undefined}
                    onChange={(event) => onDiscountChange(product.id, event.target.value)}
                    onKeyDown={onKeyDown}
                    className={INPUT_CLASS}
                  />
                  {errors.discount && (
                    <p id={discountErrorId} className="mt-1 text-xs text-red-700">
                      {errors.discount}
                    </p>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-medium whitespace-nowrap text-slate-900 tabular-nums">
                  {amount && formatCurrency(fromCents(amount.gross - amount.discount))}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onRemove(product.id)}
                    aria-label={`Quitar ${product.name}`}
                    className="rounded-md p-1 text-slate-500 hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
