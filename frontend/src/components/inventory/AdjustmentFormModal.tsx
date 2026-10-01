import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowDown, ArrowRight, ArrowUp, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Alert } from '@/components/ui/Alert'
import { FormActions } from '@/components/ui/FormActions'
import { TextField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAuth } from '@/hooks/useAuth'
import { useCreateAdjustment } from '@/hooks/useInventory'
import { PERMISSIONS } from '@/types/auth'
import type { AdjustableProduct, AdjustmentDirection } from '@/types/inventory'
import { UNIT_ABBREVIATIONS } from '@/utils/catalog'
import { toCents } from '@/utils/decimal'
import { getErrorMessage, isApiErrorCode } from '@/utils/errors'
import { formatQuantity } from '@/utils/format'
import {
  ADJUSTMENT_REASONS,
  EMPTY_ADJUSTMENT,
  buildAdjustmentSchema,
  resultingStock,
  toAdjustmentCreate,
  type AdjustmentFormInput,
  type AdjustmentFormValues,
} from '@/utils/inventory'
import { ProductPicker } from '@/components/products/ProductPicker'

/** API errors shown next to the quantity field. */
const QUANTITY_ERRORS = ['INSUFFICIENT_STOCK', 'FRACTIONAL_QUANTITY']

const DIRECTIONS: { value: AdjustmentDirection; label: string; icon: LucideIcon }[] = [
  { value: 'in', label: 'Entrada', icon: ArrowUp },
  { value: 'out', label: 'Salida', icon: ArrowDown },
]

interface AdjustmentFormModalProps {
  /** Product to adjust; omit to pick one inside the modal. */
  product?: AdjustableProduct
  onClose: () => void
}

export function AdjustmentFormModal({ product, onClose }: AdjustmentFormModalProps) {
  const [selected, setSelected] = useState<AdjustableProduct | undefined>(product)

  return (
    <Modal title="Ajuste de inventario" onClose={onClose}>
      {selected ? (
        <AdjustmentForm
          key={selected.id}
          product={selected}
          onChangeProduct={product ? undefined : () => setSelected(undefined)}
          onClose={onClose}
        />
      ) : (
        <ProductPicker onSelect={setSelected} />
      )}
    </Modal>
  )
}

interface AdjustmentFormProps {
  product: AdjustableProduct
  onChangeProduct?: () => void
  onClose: () => void
}

function AdjustmentForm({ product, onChangeProduct, onClose }: AdjustmentFormProps) {
  const { hasPermission } = useAuth()
  const canSetCost = hasPermission(PERMISSIONS.productsViewCosts)
  const mutation = useCreateAdjustment()
  const reasonsId = useId()
  const schema = useMemo(() => buildAdjustmentSchema(product.unit_of_measure), [product])
  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    control,
    formState: { errors },
  } = useForm<AdjustmentFormInput, unknown, AdjustmentFormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY_ADJUSTMENT,
  })
  // After picking a product (e.g. with the scanner) the keyboard flow continues here.
  useEffect(() => setFocus('direction'), [setFocus])
  const [direction, quantity] = useWatch({ control, name: ['direction', 'quantity'] })
  const unit = UNIT_ABBREVIATIONS[product.unit_of_measure]
  const newStock = resultingStock(product.current_stock, direction, quantity)

  const onSubmit = handleSubmit((values) => {
    mutation.mutate(toAdjustmentCreate(product.id, values), {
      onSuccess: onClose,
      onError: (error) => {
        if (QUANTITY_ERRORS.some((code) => isApiErrorCode(error, code))) {
          setError('quantity', { message: getErrorMessage(error) })
        }
      },
    })
  })

  const hasFieldError = QUANTITY_ERRORS.some((code) => isApiErrorCode(mutation.error, code))

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {mutation.isError && !hasFieldError && <Alert>{getErrorMessage(mutation.error)}</Alert>}

      <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div>
          <p className="font-medium text-slate-900">{product.name}</p>
          <p className="text-xs text-slate-500">{product.sku}</p>
          <p className="mt-1 text-sm text-slate-700">
            Stock actual: {formatQuantity(product.current_stock)} {unit}
          </p>
        </div>
        {onChangeProduct && (
          <button
            type="button"
            onClick={onChangeProduct}
            className="rounded-md px-2 py-1 text-sm text-slate-700 hover:bg-slate-200"
          >
            Cambiar
          </button>
        )}
      </div>

      <fieldset>
        <legend className="mb-1 text-sm font-medium text-slate-700">Tipo de ajuste</legend>
        <div className="grid grid-cols-2 gap-2">
          {DIRECTIONS.map(({ value, label, icon: Icon }) => (
            <label
              key={value}
              className="has-checked:border-brand-700 has-checked:bg-brand-700 has-focus-visible:outline-brand-600 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 has-checked:text-white has-focus-visible:outline-2 has-focus-visible:outline-offset-2"
            >
              <input type="radio" value={value} className="sr-only" {...register('direction')} />
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={`Cantidad (${unit})`}
          inputMode="decimal"
          autoComplete="off"
          error={errors.quantity?.message}
          {...register('quantity')}
        />
        {direction === 'in' && canSetCost && (
          <TextField
            label="Costo unitario (opcional)"
            hint="Recalcula el costo promedio. Vacío: se usa el costo actual."
            inputMode="decimal"
            autoComplete="off"
            error={errors.unit_cost?.message}
            {...register('unit_cost')}
          />
        )}
      </div>

      <div>
        <TextField
          label="Motivo"
          list={reasonsId}
          autoComplete="off"
          error={errors.reason?.message}
          {...register('reason')}
        />
        <datalist id={reasonsId}>
          {ADJUSTMENT_REASONS.map((reason) => (
            <option key={reason} value={reason} />
          ))}
        </datalist>
      </div>

      {newStock !== null && (
        <div
          aria-live="polite"
          className="flex flex-wrap items-center gap-2 text-sm text-slate-700"
        >
          <span>Stock resultante:</span>
          <span className="inline-flex items-center gap-1 font-medium text-slate-900">
            {formatQuantity(product.current_stock)}
            <ArrowRight aria-label="pasará a" className="size-4 text-slate-400" />
            {formatQuantity(newStock)} {unit}
          </span>
          {toCents(newStock) < 0n && (
            <StatusBadge size="sm" tone="warning" label="Quedaría en negativo" />
          )}
        </div>
      )}

      <FormActions onClose={onClose} loading={mutation.isPending} submitLabel="Registrar ajuste" />
    </form>
  )
}
