import type { ReplenishmentItem } from './inventory'
import type { PurchaseSummary } from './purchase'
import type { SaleSummary } from './sale'

/** `all`: every sale (`sales.read_all`); `own`: only the user's. */
export type SalesScope = 'all' | 'own'

export interface PaymentMethodSales {
  id: number
  name: string
  sales_count: number
  total: string
}

export interface SalesToday {
  scope: SalesScope
  /** Current day in the business time zone ("YYYY-MM-DD"). */
  business_date: string
  sales_count: number
  total: string
  average_ticket: string | null
  cancelled_count: number
  cancelled_total: string
  /** Largest total first. */
  by_payment_method: PaymentMethodSales[]
}

export interface DashboardOpenSession {
  id: number
  user: { id: number; full_name: string }
  opened_at: string
  /** Only with `cash.supervise`. */
  expected_cash: string | null
}

export interface DashboardCashRegister {
  id: number
  name: string
  open_session: DashboardOpenSession | null
}

export interface StockAlerts {
  out_of_stock_count: number
  critical_count: number
  low_count: number
  most_urgent: ReplenishmentItem[]
}

/** Each section is `null` when the user lacks the permission of its area. */
export interface Dashboard {
  sales_today: SalesToday | null
  recent_sales: SaleSummary[] | null
  cash_registers: DashboardCashRegister[] | null
  stock: StockAlerts | null
  recent_purchases: PurchaseSummary[] | null
}
