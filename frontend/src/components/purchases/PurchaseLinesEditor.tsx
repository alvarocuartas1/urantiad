import { Trash2 } from 'lucide-react'
import { useId, type KeyboardEvent } from 'react'
import {
  useWatch,
  type Control,
  type FieldArrayWithId,
  type FieldErrors,
  type UseFormRegister,
} from 'react-hook-form'
import { UNIT_ABBREVIATIONS } from '@/utils/catalog'
import { fromCents } from '@/utils/decimal'
import { formatCurrency } from '@/utils/format'
import { formLineAmounts, type PurchaseFormInput } from '@/utils/purchase'

type LineField = 'quantity' | 'unit_cost' | 'discount' | 'tax_rate'

const COLUMNS: { field: LineField; label: string; width: string }[] = [
  { field: 'quantity', label: 'Cantidad', width: 'w-24' },
  { field: 'unit_cost', label: 'Costo unit. sin IVA', width: 'w-32' },
  { field: 'discount', label: 'Descuento', width: 'w-28' },
  { field: 'tax_rate', label: 'IVA %', width: 'w-20' },
]

const HEADER_CLASS = 'px-3 py-2 font-semibold'

interface PurchaseLinesEditorProps {
  fields: FieldArrayWithId<PurchaseFormInput, 'items'>[]
  control: Control<PurchaseFormInput>
  register: UseFormRegister<PurchaseFormInput>
  errors?: FieldErrors<PurchaseFormInput>['items']
  onRemove: (index: number) => void
  /** Enter inside a line: the caller moves on to the next product. */
  onLineEnter: () => void
}

/** Editable purchase lines with their amounts, recomputed as the user types. */
export function PurchaseLinesEditor({
  fields,
  control,
  register,
  errors,
  onRemove,
  onLineEnter,
}: PurchaseLinesEditorProps) {
  const errorPrefix = useId()
  const lines = useWatch({ control, name: 'items' })

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    // Enter must not submit the purchase: it finishes the line, as after a scan.
    event.preventDefault()
    onLineEnter()
  }

  if (fields.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
        Escanee o busque productos para agregarlos a la compra.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 uppercase">
          <tr>
            <th scope="col" className={HEADER_CLASS}>
              Producto
            </th>
            {COLUMNS.map(({ field, label }) => (
              <th key={field} scope="col" className={HEADER_CLASS}>
                {label}
              </th>
            ))}
            <th scope="col" className={`${HEADER_CLASS} text-right`}>
              Subtotal
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
          {fields.map((field, index) => {
            const { product } = field
            const line = lines[index] ?? field
            const amounts = formLineAmounts(line)
            return (
              <tr key={field.id} className="align-top">
                <td className="px-3 py-2">
                  <p className="font-medium text-slate-900">{product.name}</p>
                  <p className="text-xs text-slate-500">
                    {product.sku} · {UNIT_ABBREVIATIONS[product.unit_of_measure]}
                  </p>
                </td>
                {COLUMNS.map(({ field: name, label, width }) => {
                  const message = errors?.[index]?.[name]?.message
                  const errorId = `${errorPrefix}-${index}-${name}`
                  return (
                    <td key={name} className="px-3 py-2">
                      <input
                        aria-label={`${label} de ${product.name}`}
                        aria-invalid={message ? true : undefined}
                        aria-describedby={message ? errorId : undefined}
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder={name === 'discount' ? '0' : undefined}
                        onKeyDown={onKeyDown}
                        className={`${width} rounded-lg border border-slate-300 px-2 py-1.5 text-right text-sm focus:outline-2 focus:outline-slate-900 aria-invalid:border-red-500`}
                        {...register(`items.${index}.${name}`)}
                      />
                      {message && (
                        <p id={errorId} className="mt-1 max-w-40 text-xs text-red-700">
                          {message}
                        </p>
                      )}
                    </td>
                  )
                })}
                <td className="px-3 py-2 text-right whitespace-nowrap text-slate-700">
                  {amounts ? formatCurrency(fromCents(amounts.subtotal)) : '—'}
                </td>
                <td className="px-3 py-2 text-right font-medium whitespace-nowrap text-slate-900">
                  {amounts ? formatCurrency(fromCents(amounts.total)) : '—'}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onRemove(index)}
                    aria-label={`Quitar ${product.name}`}
                    className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700"
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
