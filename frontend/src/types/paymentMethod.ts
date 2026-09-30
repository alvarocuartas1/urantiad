import type { PaymentMethod } from './sale'

/** A payment method with the fields its administration needs. */
export interface PaymentMethodDetail extends PaymentMethod {
  is_active: boolean
  /** Position in the POS: lower first. */
  sort_order: number
}

export interface PaymentMethodCreate {
  name: string
  sort_order: number
}

/** The cash method cannot be deactivated; `code` and `is_cash` never change. */
export type PaymentMethodUpdate = Partial<PaymentMethodCreate & { is_active: boolean }>
