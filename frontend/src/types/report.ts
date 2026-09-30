import type { Page } from './api'

/** A report: a page of groups plus the summary of everything the filters select. */
export interface ReportPage<Row, Summary> extends Page<Row> {
  summary: Summary
}

export interface ReportGroup {
  /** Id of the group, or the local date ("YYYY-MM-DD") when grouped by day. */
  key: string
  label: string
  /** Product SKU or supplier document, when it applies. */
  code: string | null
}

interface PeriodParams {
  page: number
  size: number
  date_from?: string
  date_to?: string
}

// --- Sales ----------------------------------------------------------------------------

export type SalesGroupBy =
  'day' | 'user' | 'cash_register' | 'product' | 'category' | 'payment_method'

/** Null where it does not apply (e.g. costs by payment method) or without `products.view_costs`. */
export interface SalesMetrics {
  sales_count: number
  quantity: string | null
  total: string
  discount_total: string | null
  tax_total: string | null
  net_total: string | null
  cost_total: string | null
  gross_margin: string | null
  margin_percent: string | null
}

export type SalesReportRow = ReportGroup & SalesMetrics

export interface SalesReportSummary extends SalesMetrics {
  average_ticket: string | null
  cancelled_count: number
  cancelled_total: string
}

export interface SalesReportParams extends PeriodParams {
  group_by: SalesGroupBy
  user_id?: number
  cash_register_id?: number
  category_id?: number
  product_id?: number
}

// --- Purchases ------------------------------------------------------------------------

export type PurchasesGroupBy = 'supplier' | 'product' | 'category' | 'day'

export interface PurchasesMetrics {
  purchases_count: number
  quantity: string | null
  subtotal: string
  discount_total: string
  tax_total: string
  total: string
}

export type PurchasesReportRow = ReportGroup & PurchasesMetrics

export interface PurchasesReportSummary extends PurchasesMetrics {
  cancelled_count: number
  cancelled_total: string
}

export interface PurchasesReportParams extends PeriodParams {
  group_by: PurchasesGroupBy
  supplier_id?: number
  category_id?: number
  product_id?: number
}

// --- Inventory ------------------------------------------------------------------------

export interface InventoryMetrics {
  products_count: number
  out_of_stock_count: number
  critical_count: number
  low_count: number
  ok_count: number
  inventory_value: string | null
}

export type InventoryReportRow = ReportGroup & InventoryMetrics
export type InventoryReportSummary = InventoryMetrics

export interface InventoryReportParams {
  page: number
  size: number
  category_id?: number
}

// --- Cash -----------------------------------------------------------------------------

export type CashGroupBy = 'day' | 'cash_register' | 'user'

export interface CashMetrics {
  sessions_count: number
  open_count: number
  opening_total: string
  income_total: string
  withdrawals_total: string
  cash_sales_total: string
  cash_cancellations_total: string
  expected_cash: string
  counted_cash: string
  surplus_total: string
  /** Positive amount. */
  shortage_total: string
  difference_total: string
  sessions_with_difference: number
}

export type CashReportRow = ReportGroup & CashMetrics
export type CashReportSummary = CashMetrics

export interface CashReportParams extends PeriodParams {
  group_by: CashGroupBy
  cash_register_id?: number
  user_id?: number
}
