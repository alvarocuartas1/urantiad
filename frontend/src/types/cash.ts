import type { PaymentMethod } from './sale'

interface UserSummary {
  id: number
  full_name: string
}

export interface CashRegisterSummary {
  id: number
  name: string
}

export interface OpenSessionReference {
  id: number
  user: UserSummary
  opened_at: string
}

export interface CashRegister extends CashRegisterSummary {
  description: string | null
  is_active: boolean
  /** Who has the register open right now, if anyone. */
  open_session: OpenSessionReference | null
  created_at: string
  updated_at: string
}

export interface CashRegisterCreate {
  name: string
  description: string | null
}

export interface CashRegisterUpdate extends Partial<CashRegisterCreate> {
  is_active?: boolean
}

export interface CashRegisterListParams {
  page: number
  size: number
  search?: string
  is_active?: boolean
}

export type CashSessionStatus = 'open' | 'closed'

export interface CashSummary {
  opening_amount: string
  total_income: string
  total_withdrawals: string
  /** Cash part of the sales. */
  total_cash_sales: string
  /** Cash given back for cancelled sales. */
  total_cash_cancellations: string
  /** Opening amount + income + cash sales − withdrawals − cash cancellations. */
  expected_cash: string
}

/** Cash count and closing of a session. */
export interface CashSessionClosing {
  closed_at: string
  /** The owner, or a supervisor closing a session someone left open. */
  closed_by: UserSummary
  /** Expected cash frozen when it was closed. */
  expected_cash: string
  counted_cash: string
  /** Counted − expected: positive = surplus, negative = shortage. */
  difference: string
  closing_notes: string | null
}

export interface CashSession {
  id: number
  cash_register: CashRegisterSummary
  user: UserSummary
  status: CashSessionStatus
  opening_amount: string
  opening_notes: string | null
  opened_at: string
  summary: CashSummary
  /** `null` while the session is open. */
  closing: CashSessionClosing | null
}

export interface CashSessionOpen {
  cash_register_id: number
  opening_amount: string
  opening_notes: string | null
}

export interface CashSessionListParams {
  page: number
  size: number
  cash_register_id?: number
  status?: CashSessionStatus
  /** `true`: closed with a surplus or shortage; `false`: the rest. */
  has_difference?: boolean
  date_from?: string
  date_to?: string
}

/** Types a user registers by hand; sales register their own. */
export type ManualCashMovementType = 'income' | 'withdrawal'
export type CashMovementType = ManualCashMovementType | 'sale' | 'sale_cancellation'

export interface CashMovement {
  id: number
  cash_session_id: number
  movement_type: CashMovementType
  amount: string
  concept: string
  /** Sale that originated the movement. */
  sale: { id: number; number: string } | null
  user: UserSummary
  created_at: string
}

export interface CashMovementCreate {
  movement_type: ManualCashMovementType
  amount: string
  concept: string
}

export interface CashMovementResult {
  movement: CashMovement
  session: CashSession
}

export interface CashSessionClose {
  counted_cash: string
  /** The expected cash the user saw: rejected (`CASH_EXPECTED_CHANGED`) if it changed. */
  expected_cash: string
  closing_notes: string | null
}

export interface PaymentMethodTotal {
  payment_method: PaymentMethod
  payments_count: number
  total: string
}

/** Sales of a session; for a closed one, as they were when it was closed. */
export interface CashSessionSalesSummary {
  sales_count: number
  total_sales: string
  by_method: PaymentMethodTotal[]
}
