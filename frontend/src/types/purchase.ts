/** Purchases from suppliers. Money and quantities are decimal strings; costs exclude tax. */
import type { UnitOfMeasure } from './catalog'
import type { SupplierSummary } from './supplier'

export type PurchaseStatus = 'draft' | 'confirmed' | 'cancelled'

export interface PurchaseProduct {
  id: number
  sku: string
  barcode: string | null
  name: string
  unit_of_measure: UnitOfMeasure
}

export interface PurchaseItem {
  id: number
  product: PurchaseProduct
  quantity: string
  /** Unit cost before tax and before the line discount. */
  unit_cost: string
  /** Discount of the whole line, as a value. */
  discount: string
  tax_rate: string
  tax_amount: string
  /** Quantity × unit cost − discount, before tax. */
  subtotal: string
  total: string
  /** Cost per unit after the discount: the cost that enters inventory. */
  net_unit_cost: string
}

interface UserSummary {
  id: number
  full_name: string
}

export interface PurchaseSummary {
  id: number
  /** Assigned on confirmation; `null` for drafts. */
  number: string | null
  status: PurchaseStatus
  supplier: SupplierSummary
  supplier_invoice_number: string | null
  /** Gross value of the items, before discounts and tax. */
  subtotal: string
  discount_total: string
  tax_total: string
  total: string
  amount_paid: string
  balance_due: string
  created_by: UserSummary
  created_at: string
  confirmed_at: string | null
  cancelled_at: string | null
}

export interface Purchase extends PurchaseSummary {
  notes: string | null
  confirmed_by: UserSummary | null
  cancelled_by: UserSummary | null
  cancellation_reason: string | null
  updated_at: string
  items: PurchaseItem[]
}

export interface PurchaseItemInput {
  product_id: number
  quantity: string
  unit_cost: string
  discount: string
  tax_rate: string
}

/** Body of `POST /purchases` and `PUT /purchases/{id}`: the whole draft. */
export interface PurchaseInput {
  supplier_id: number
  supplier_invoice_number: string | null
  amount_paid: string
  notes: string | null
  items: PurchaseItemInput[]
}

export interface PurchaseListParams {
  page: number
  size: number
  search?: string
  supplier_id?: number
  status?: PurchaseStatus
  /** ISO timestamps with offset; `date_to` is exclusive. */
  date_from?: string
  date_to?: string
}

export interface CostHistoryEntry {
  purchase_id: number
  purchase_number: string
  supplier: { id: number; name: string }
  confirmed_at: string
  quantity: string
  /** Net unit cost (after discount, before tax). */
  unit_cost: string
  previous_unit_cost: string | null
  /** Percentage change against the previous purchase. */
  variation_percent: string | null
}

export interface CostSummary {
  average_cost: string
  last_cost: string
  sale_price: string
  sale_price_before_tax: string
  /** Sale price before tax − average cost. */
  gross_margin: string
  gross_margin_percent: string | null
}

export interface CostHistoryPage {
  items: CostHistoryEntry[]
  total: number
  page: number
  size: number
  summary: CostSummary
}
