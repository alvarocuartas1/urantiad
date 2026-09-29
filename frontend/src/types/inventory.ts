/** Inventory movements and replenishment. Quantities and costs are decimal strings. */
import type { CategorySummary, Product, StockStatus, UnitOfMeasure } from './catalog'

export type MovementType =
  | 'purchase_entry'
  | 'sale'
  | 'adjustment_in'
  | 'adjustment_out'
  | 'purchase_return'
  | 'sale_return'
  | 'sale_cancellation'

export type AdjustmentDirection = 'in' | 'out'

export interface InventoryMovement {
  id: number
  product: { id: number; sku: string; name: string; unit_of_measure: UnitOfMeasure }
  movement_type: MovementType
  /** Always positive: the movement type tells whether it entered or left. */
  quantity: string
  stock_before: string
  stock_after: string
  /** `null` when the user lacks the `products.view_costs` permission. */
  unit_cost: string | null
  average_cost_after: string | null
  reason: string | null
  user: { id: number; full_name: string }
  created_at: string
}

export interface AdjustmentCreate {
  product_id: number
  direction: AdjustmentDirection
  quantity: string
  /** Entries only: recalculates the weighted average cost. */
  unit_cost?: string
  reason: string
}

export interface AdjustmentResult {
  movement: InventoryMovement
  product: Product
}

export interface MovementListParams {
  page: number
  size: number
  product_id?: number
  movement_type?: MovementType
  /** ISO timestamps with offset; `date_to` is exclusive. */
  date_from?: string
  date_to?: string
}

export interface ReplenishmentItem {
  id: number
  sku: string
  barcode: string | null
  name: string
  category: CategorySummary
  unit_of_measure: UnitOfMeasure
  current_stock: string
  min_stock: string
  reorder_point: string
  target_stock: string
  stock_status: StockStatus
  /** Target stock − current stock, never negative. */
  suggested_quantity: string
}

export interface ReplenishmentListParams {
  page: number
  size: number
  search?: string
  category_id?: number
  stock_status?: StockStatus
}

/** The product data an adjustment needs, available from both products and replenishment. */
export type AdjustableProduct = Pick<
  Product,
  'id' | 'sku' | 'name' | 'unit_of_measure' | 'current_stock'
>
