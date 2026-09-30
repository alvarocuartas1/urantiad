import type { UnitOfMeasure } from './catalog'
import type { ReportPage } from './report'

export type Granularity = 'day' | 'week' | 'month'

/** Local calendar days ("YYYY-MM-DD"), both included. */
interface Period {
  date_from: string
  date_to: string
}

export interface TrendPoint {
  /** First day of the period: the Monday of a week, the 1st of a month. */
  period_start: string
  sales_count: number
  total: string
  net_total: string
  /** Null without `products.view_costs`. */
  gross_margin: string | null
}

/** One point per period, periods without sales included (in zero). The range is widened
 * to whole periods. */
export interface SalesTrend {
  granularity: Granularity
  date_from: string
  date_to: string
  points: TrendPoint[]
}

export interface SalesTrendParams extends Period {
  granularity: Granularity
}

export type TopProductMetric = 'quantity' | 'total'

export interface TopProduct {
  product_id: number
  name: string
  sku: string
  unit_of_measure: UnitOfMeasure
  quantity: string
  total: string
  gross_margin: string | null
}

export interface TopProductsParams extends Period {
  metric: TopProductMetric
  limit: number
  category_id?: number
}

export type RotationOrder = 'slowest' | 'fastest'

export interface RotationRow {
  product_id: number
  name: string
  sku: string
  category_name: string
  unit_of_measure: UnitOfMeasure
  units_sold: string
  stock_start: string
  stock_end: string
  average_stock: string
  /** Units sold / average stock weighted by time; null without stock. */
  rotation: string | null
  /** Days the final stock lasts at the daily sales of the measured span; null without sales. */
  days_of_inventory: string | null
  /** From the start of the period (or the product's arrival, if it had no stock) to its end
   * or now. */
  measured_days: string
}

export interface RotationSummary {
  products_count: number
  without_sales_count: number
  period_days: number
}

export type RotationPage = ReportPage<RotationRow, RotationSummary>

export interface RotationParams extends Period {
  page: number
  size: number
  order: RotationOrder
  category_id?: number
}
