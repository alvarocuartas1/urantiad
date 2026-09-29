import { z } from 'zod'
import type { Product, ProductCreate, ProductUpdate, UnitOfMeasure } from '@/types/catalog'
import { UNIT_LABELS, labelEntries } from './catalog'
import { compareDecimals, isDecimalInput, normalizeDecimal, trimDecimal } from './decimal'
import { DECIMAL_MESSAGE, decimalSchema } from './validation'

const units = labelEntries(UNIT_LABELS).map(([unit]) => unit) as [UnitOfMeasure, ...UnitOfMeasure[]]

/** Mirrors the backend rules in `app/schemas/product.py` and `product_service.py`. */
export const productFormSchema = z
  .object({
    type: z.enum(['product', 'service']),
    sku: z
      .string()
      .trim()
      .toUpperCase()
      .min(1, 'Ingrese el SKU.')
      .max(50, 'El SKU no puede superar 50 caracteres.')
      .regex(/^[A-Z0-9][A-Z0-9._-]*$/, 'Use letras, números, punto, guion o guion bajo.'),
    barcode: z
      .string()
      .trim()
      .max(50, 'El código de barras no puede superar 50 caracteres.')
      .regex(/^[0-9A-Za-z-]*$/, 'Use solo letras, números o guion.'),
    name: z
      .string()
      .trim()
      .min(1, 'Ingrese el nombre.')
      .max(150, 'El nombre no puede superar 150 caracteres.'),
    description: z.string().trim().max(500, 'La descripción no puede superar 500 caracteres.'),
    category_id: z.coerce.number<string>().int().positive('Seleccione una categoría.'),
    unit_of_measure: z.enum(units),
    tax_rate: decimalSchema,
    sale_price: decimalSchema,
    min_stock: decimalSchema,
    reorder_point: decimalSchema,
    target_stock: decimalSchema,
    cost: z
      .string()
      .trim()
      .refine((value) => value === '' || isDecimalInput(value), DECIMAL_MESSAGE)
      .transform((value) => (value ? normalizeDecimal(value) : null)),
    is_active: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.type !== 'product') return
    if (compareDecimals(values.min_stock, values.reorder_point) > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['reorder_point'],
        message: 'Debe ser mayor o igual al stock mínimo.',
      })
    }
    if (compareDecimals(values.reorder_point, values.target_stock) > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['target_stock'],
        message: 'Debe ser mayor o igual al punto de reorden.',
      })
    }
  })

export type ProductFormInput = z.input<typeof productFormSchema>
export type ProductFormValues = z.output<typeof productFormSchema>

export function productToFormInput(product?: Product): ProductFormInput {
  if (!product) {
    return {
      type: 'product',
      sku: '',
      barcode: '',
      name: '',
      description: '',
      category_id: '',
      unit_of_measure: 'unit',
      tax_rate: '19',
      sale_price: '',
      min_stock: '0',
      reorder_point: '0',
      target_stock: '0',
      cost: '',
      is_active: true,
    }
  }
  return {
    type: product.type,
    sku: product.sku,
    barcode: product.barcode ?? '',
    name: product.name,
    description: product.description ?? '',
    category_id: String(product.category.id),
    unit_of_measure: product.unit_of_measure,
    tax_rate: trimDecimal(product.tax_rate),
    sale_price: trimDecimal(product.sale_price),
    min_stock: trimDecimal(product.min_stock),
    reorder_point: trimDecimal(product.reorder_point),
    target_stock: trimDecimal(product.target_stock),
    cost: product.average_cost === null ? '' : trimDecimal(product.average_cost),
    is_active: product.is_active,
  }
}

type ProductFields = Omit<ProductCreate, 'type'>

/** Stock levels are sent only for products and the cost only for services. */
function toProductFields(values: ProductFormValues): ProductFields {
  const common = {
    sku: values.sku,
    barcode: values.barcode || null,
    name: values.name,
    description: values.description || null,
    category_id: values.category_id,
    unit_of_measure: values.unit_of_measure,
    tax_rate: values.tax_rate,
    sale_price: values.sale_price,
  }
  if (values.type === 'service') {
    return values.cost === null ? common : { ...common, cost: values.cost }
  }
  return {
    ...common,
    min_stock: values.min_stock,
    reorder_point: values.reorder_point,
    target_stock: values.target_stock,
  }
}

/** Body for `POST /products`. */
export function toProductCreate(values: ProductFormValues): ProductCreate {
  return { type: values.type, ...toProductFields(values) }
}

/** Body for `PATCH /products/{id}`: the type cannot change, so it is not sent. */
export function toProductUpdate(values: ProductFormValues): ProductUpdate {
  return { ...toProductFields(values), is_active: values.is_active }
}
