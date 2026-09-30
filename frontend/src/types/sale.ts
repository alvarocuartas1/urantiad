/** Sales (POS). Money and quantities are decimal strings; prices include tax. */
import type { CashRegisterSummary } from './cash'
import type { ProductType, UnitOfMeasure } from './catalog'
import type { CustomerSummary } from './customer'

export type SaleStatus = 'completed' | 'cancelled'

export interface PaymentMethod {
  id: number
  code: string
  name: string
  /** Only cash enters the drawer and accepts an amount handed over (with change). */
  is_cash: boolean
}

export interface SaleProduct {
  id: number
  type: ProductType
  sku: string
  barcode: string | null
  name: string
  unit_of_measure: UnitOfMeasure
}

export interface SaleItem {
  id: number
  product: SaleProduct
  quantity: string
  /** Price with tax at the moment of the sale. */
  unit_price: string
  /** Discount of the line. */
  discount: string
  /** Part of the sale discount assigned to the line. */
  sale_discount_share: string
  tax_rate: string
  /** Tax included in `total`. */
  tax_amount: string
  total: string
  /** Average cost at the moment of the sale; `null` without `products.view_costs`. */
  unit_cost: string | null
}

export interface SalePayment {
  id: number
  payment_method: PaymentMethod
  amount: string
  amount_tendered: string | null
  change_amount: string
  reference: string | null
}

interface UserSummary {
  id: number
  full_name: string
}

export interface SaleSummary {
  id: number
  number: string
  status: SaleStatus
  customer: CustomerSummary
  user: UserSummary
  cash_session_id: number
  cash_register: CashRegisterSummary
  /** Gross value of the lines (tax included), before discounts. */
  subtotal: string
  lines_discount: string
  sale_discount: string
  discount_total: string
  /** Tax included in the total. */
  tax_total: string
  total: string
  created_at: string
  cancelled_at: string | null
}

export interface Sale extends SaleSummary {
  notes: string | null
  change_amount: string
  cancelled_by: UserSummary | null
  cancellation_reason: string | null
  items: SaleItem[]
  payments: SalePayment[]
}

export interface SaleItemInput {
  product_id: number
  quantity: string
  discount: string
}

export interface SalePaymentInput {
  payment_method_id: number
  amount: string
  amount_tendered: string | null
  reference: string | null
}

/** Body of `POST /sales`. Prices and costs come from the catalog on the server. */
export interface SaleCreate {
  customer_id: number | null
  items: SaleItemInput[]
  sale_discount: string
  payments: SalePaymentInput[]
  notes: string | null
}

export interface SaleListParams {
  page: number
  size: number
  search?: string
  status?: SaleStatus
  customer_id?: number
  cash_session_id?: number
  /** ISO timestamps with offset; `date_to` is exclusive. */
  date_from?: string
  date_to?: string
}
