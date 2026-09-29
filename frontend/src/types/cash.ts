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
  /** Opening amount + income - withdrawals. */
  expected_cash: string
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
  date_from?: string
  date_to?: string
}

export type CashMovementType = 'income' | 'withdrawal'

export interface CashMovement {
  id: number
  cash_session_id: number
  movement_type: CashMovementType
  amount: string
  concept: string
  user: UserSummary
  created_at: string
}

export interface CashMovementCreate {
  movement_type: CashMovementType
  amount: string
  concept: string
}

export interface CashMovementResult {
  movement: CashMovement
  session: CashSession
}
