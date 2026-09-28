import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { Alert } from '@/components/ui/Alert'
import { FormActions } from '@/components/ui/FormActions'
import { SelectField, TextField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { useActiveCategories } from '@/hooks/useCategories'
import { useCreateProduct, useUpdateProduct } from '@/hooks/useProducts'
import type { CategorySummary, Product } from '@/types/catalog'
import { PRODUCT_TYPE_LABELS, TAX_RATES, UNIT_LABELS, labelEntries } from '@/utils/catalog'
import { getErrorMessage, isApiErrorCode } from '@/utils/errors'
import {
  productFormSchema,
  productToFormInput,
  toProductCreate,
  toProductUpdate,
  type ProductFormInput,
  type ProductFormValues,
} from '@/utils/productForm'

/** API conflicts shown next to the field that caused them. */
const FIELD_ERRORS = { SKU_TAKEN: 'sku', BARCODE_TAKEN: 'barcode' } as const

interface ProductFormModalProps {
  /** Product to edit; omit to create a new one. */
  product?: Product
  onClose: () => void
}

export function ProductFormModal({ product, onClose }: ProductFormModalProps) {
  const createMutation = useCreateProduct()
  const updateMutation = useUpdateProduct()
  const mutation = product ? updateMutation : createMutation
  const { categories } = useActiveCategories()
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm<ProductFormInput, unknown, ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: productToFormInput(product),
  })
  const isService = useWatch({ control, name: 'type' }) === 'service'

  // An inactive category cannot be chosen, but a product may keep the one it already has.
  const categoryOptions: CategorySummary[] =
    product && !categories.some((c) => c.id === product.category.id)
      ? [product.category, ...categories]
      : categories
  const taxRates: string[] = [...TAX_RATES]
  const currentTaxRate = productToFormInput(product).tax_rate
  if (!taxRates.includes(currentTaxRate)) taxRates.push(currentTaxRate)

  const onError = (error: Error) => {
    for (const [code, field] of Object.entries(FIELD_ERRORS)) {
      if (isApiErrorCode(error, code)) setError(field, { message: getErrorMessage(error) })
    }
  }

  const onSubmit = handleSubmit((values) => {
    if (product) {
      updateMutation.mutate(
        { id: product.id, data: toProductUpdate(values) },
        { onSuccess: onClose, onError },
      )
    } else {
      createMutation.mutate(toProductCreate(values), { onSuccess: onClose, onError })
    }
  })

  const hasFieldError = Boolean(errors.sku || errors.barcode)
  const decimalProps = { inputMode: 'decimal', autoComplete: 'off' } as const

  return (
    <Modal title={product ? 'Editar producto' : 'Nuevo producto'} onClose={onClose} size="lg">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {mutation.isError && !hasFieldError && <Alert>{getErrorMessage(mutation.error)}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          {product ? (
            <TextField label="Tipo" value={PRODUCT_TYPE_LABELS[product.type]} disabled readOnly />
          ) : (
            <SelectField label="Tipo" error={errors.type?.message} {...register('type')}>
              {labelEntries(PRODUCT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>
          )}
          <SelectField
            label="Categoría"
            error={errors.category_id?.message}
            {...register('category_id')}
          >
            <option value="">Seleccione…</option>
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
                {!category.is_active && ' (inactiva)'}
              </option>
            ))}
          </SelectField>
          <TextField
            label="SKU"
            autoComplete="off"
            autoCapitalize="characters"
            error={errors.sku?.message}
            {...register('sku')}
          />
          <TextField
            label="Código de barras (opcional)"
            autoComplete="off"
            error={errors.barcode?.message}
            {...register('barcode')}
          />
          <div className="sm:col-span-2">
            <TextField
              label="Nombre"
              autoComplete="off"
              error={errors.name?.message}
              {...register('name')}
            />
          </div>
          <div className="sm:col-span-2">
            <TextField
              label="Descripción (opcional)"
              autoComplete="off"
              error={errors.description?.message}
              {...register('description')}
            />
          </div>
          <SelectField
            label="Unidad de medida"
            error={errors.unit_of_measure?.message}
            {...register('unit_of_measure')}
          >
            {labelEntries(UNIT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          <SelectField label="IVA" error={errors.tax_rate?.message} {...register('tax_rate')}>
            {taxRates.map((rate) => (
              <option key={rate} value={rate}>
                {rate} %
              </option>
            ))}
          </SelectField>
          <TextField
            label="Precio de venta"
            hint="Precio al público, con IVA incluido."
            error={errors.sale_price?.message}
            {...decimalProps}
            {...register('sale_price')}
          />
          {isService && (
            <TextField
              label="Costo de referencia (opcional)"
              hint="Papel, tinta, etc. Se usa para calcular márgenes."
              error={errors.cost?.message}
              {...decimalProps}
              {...register('cost')}
            />
          )}
        </div>

        {isService ? (
          <p className="text-sm text-slate-600">Los servicios no manejan inventario.</p>
        ) : (
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-slate-900">Niveles de stock</legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField
                label="Stock mínimo"
                error={errors.min_stock?.message}
                {...decimalProps}
                {...register('min_stock')}
              />
              <TextField
                label="Punto de reorden"
                error={errors.reorder_point?.message}
                {...decimalProps}
                {...register('reorder_point')}
              />
              <TextField
                label="Stock objetivo"
                error={errors.target_stock?.message}
                {...decimalProps}
                {...register('target_stock')}
              />
            </div>
            <p className="text-xs text-slate-500">
              El stock y el costo cambian solo con compras y ajustes de inventario.
            </p>
          </fieldset>
        )}

        {product && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="size-4 rounded border-slate-300"
              {...register('is_active')}
            />
            Producto activo
          </label>
        )}
        <FormActions onClose={onClose} loading={mutation.isPending} />
      </form>
    </Modal>
  )
}
