import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Alert } from '@/components/ui/Alert'
import { FormActions } from '@/components/ui/FormActions'
import { TextField } from '@/components/ui/FormField'
import { useAddSupplierProduct, useUpdateSupplierProduct } from '@/hooks/useSuppliers'
import type { LinkedProduct, SupplierProduct } from '@/types/supplier'
import { isDecimalInput, normalizeDecimal, trimDecimal } from '@/utils/decimal'
import { getErrorMessage } from '@/utils/errors'
import { DECIMAL_MESSAGE } from '@/utils/validation'

/** Mirrors the backend rules in `app/schemas/supplier.py`. */
const linkSchema = z.object({
  supplier_sku: z
    .string()
    .trim()
    .max(50, 'El código no puede superar 50 caracteres.')
    .transform((value) => value || null),
  purchase_price: z
    .string()
    .trim()
    .refine((value) => !value || isDecimalInput(value), DECIMAL_MESSAGE)
    .transform((value) => (value ? normalizeDecimal(value) : null)),
  notes: z
    .string()
    .trim()
    .max(255, 'Las observaciones no pueden superar 255 caracteres.')
    .transform((value) => value || null),
})

type LinkInput = z.input<typeof linkSchema>
type LinkValues = z.output<typeof linkSchema>

interface SupplierProductFormProps {
  supplierId: number
  product: Pick<LinkedProduct, 'id' | 'sku' | 'name'>
  /** Link to edit; omit to associate `product` with the supplier. */
  link?: SupplierProduct
  onChangeProduct?: () => void
  onDone: () => void
}

export function SupplierProductForm({
  supplierId,
  product,
  link,
  onChangeProduct,
  onDone,
}: SupplierProductFormProps) {
  const addMutation = useAddSupplierProduct(supplierId)
  const updateMutation = useUpdateSupplierProduct(supplierId)
  const mutation = link ? updateMutation : addMutation
  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors },
  } = useForm<LinkInput, unknown, LinkValues>({
    resolver: zodResolver(linkSchema),
    defaultValues: {
      supplier_sku: link?.supplier_sku ?? '',
      purchase_price: link?.purchase_price ? trimDecimal(link.purchase_price) : '',
      notes: link?.notes ?? '',
    },
  })
  // After picking a product (e.g. with the scanner) the keyboard flow continues here.
  useEffect(() => setFocus('supplier_sku'), [setFocus])

  const onSubmit = handleSubmit((values) => {
    if (link) {
      updateMutation.mutate({ productId: product.id, data: values }, { onSuccess: onDone })
    } else {
      addMutation.mutate({ product_id: product.id, ...values }, { onSuccess: onDone })
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {mutation.isError && <Alert>{getErrorMessage(mutation.error)}</Alert>}
      <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div>
          <p className="font-medium text-slate-900">{product.name}</p>
          <p className="text-xs text-slate-500">{product.sku}</p>
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
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Código en el proveedor (opcional)"
          autoComplete="off"
          error={errors.supplier_sku?.message}
          {...register('supplier_sku')}
        />
        <TextField
          label="Precio de compra sin IVA (opcional)"
          inputMode="decimal"
          autoComplete="off"
          hint="Costo unitario antes de impuestos."
          error={errors.purchase_price?.message}
          {...register('purchase_price')}
        />
      </div>
      <TextField
        label="Observaciones (opcional)"
        autoComplete="off"
        error={errors.notes?.message}
        {...register('notes')}
      />
      <FormActions onClose={onDone} loading={mutation.isPending} />
    </form>
  )
}
