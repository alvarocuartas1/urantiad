/**
 * Categories and products. Money and quantities arrive as decimal strings ("2500.00") and are
 * never converted to `number` for arithmetic (see `utils/decimal.ts`).
 */

export interface CategorySummary {
  id: number
  name: string
  is_active: boolean
}

export interface Category extends CategorySummary {
  description: string | null
  created_at: string
  updated_at: string
}

export interface CategoryCreate {
  name: string
  description: string | null
}

export interface CategoryUpdate {
  name?: string
  description?: string | null
  is_active?: boolean
}

export interface CategoryListParams {
  page: number
  size: number
  search?: string
  is_active?: boolean
}

export type ProductType = 'product' | 'service'
export type UnitOfMeasure = 'unit' | 'pack' | 'box' | 'kg' | 'g' | 'l' | 'ml' | 'page'
export type StockStatus = 'ok' | 'low' | 'critical' | 'out_of_stock'

export interface Product {
  id: number
  type: ProductType
  sku: string
  barcode: string | null
  name: string
  description: string | null
  category: CategorySummary
  unit_of_measure: UnitOfMeasure
  tax_rate: string
  /** Price to the public, tax included. */
  sale_price: string
  /** `null` when the user lacks the `products.view_costs` permission. */
  average_cost: string | null
  last_cost: string | null
  current_stock: string
  min_stock: string
  reorder_point: string
  target_stock: string
  /** `null` for services, which have no stock. */
  stock_status: StockStatus | null
  is_active: boolean
  created_at: string
  updated_at: string
}

interface ProductEditableFields {
  sku: string
  barcode: string | null
  name: string
  description: string | null
  category_id: number
  unit_of_measure: UnitOfMeasure
  tax_rate: string
  sale_price: string
  /** Physical products only. */
  min_stock?: string
  reorder_point?: string
  target_stock?: string
  /** Services only: reference cost. */
  cost?: string
}

export interface ProductCreate extends ProductEditableFields {
  type: ProductType
}

export interface ProductUpdate extends Partial<ProductEditableFields> {
  is_active?: boolean
}

export interface ProductListParams {
  page: number
  size: number
  search?: string
  category_id?: number
  type?: ProductType
  is_active?: boolean
  stock_status?: StockStatus
}

export interface PriceHistoryEntry {
  id: number
  old_price: string | null
  new_price: string
  changed_by: { id: number; full_name: string }
  changed_at: string
}
