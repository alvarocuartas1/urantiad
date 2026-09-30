/** Audit log: who changed what and when. Amounts in the values are decimal strings. */

export type AuditEntity = 'product' | 'supplier' | 'purchase' | 'sale' | 'cash_session' | 'user'

export type AuditAction =
  | 'product.create'
  | 'product.update'
  | 'product.stock_adjustment'
  | 'supplier.create'
  | 'supplier.update'
  | 'supplier.product_add'
  | 'supplier.product_update'
  | 'supplier.product_remove'
  | 'purchase.create'
  | 'purchase.discard'
  | 'purchase.confirm'
  | 'purchase.cancel'
  | 'sale.cancel'
  | 'cash_session.open'
  | 'cash_session.income'
  | 'cash_session.withdrawal'
  | 'cash_session.close'
  | 'user.create'
  | 'user.update'
  | 'user.password_reset'

export type AuditValue = string | number | boolean | null

/** Only the fields that changed (updates) or the data of the operation. */
export type AuditValues = Record<string, AuditValue>

export interface AuditLog {
  id: number
  created_at: string
  /** `null` for actions without a signed-in user (the `create-admin` command). */
  user: { id: number; full_name: string } | null
  action: AuditAction
  entity_type: AuditEntity
  entity_id: number
  /** How the entity was named when the action happened. */
  entity_label: string
  old_values: AuditValues | null
  new_values: AuditValues | null
}

export interface AuditLogListParams {
  page: number
  size: number
  entity_type?: AuditEntity
  action?: AuditAction
  user_id?: number
  search?: string
  date_from?: string
  date_to?: string
}
