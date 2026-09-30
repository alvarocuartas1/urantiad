import type { AuditAction, AuditEntity, AuditLog, AuditValue, AuditValues } from '@/types/audit'
import { CASH_SESSION_STATUS_LABELS } from './cash'
import { PRODUCT_TYPE_LABELS, UNIT_LABELS } from './catalog'
import { DOCUMENT_TYPE_LABELS } from './document'
import { formatCurrency, formatQuantity } from './format'
import { MOVEMENT_TYPE_LABELS } from './inventory'
import { PURCHASE_STATUS_LABELS } from './purchase'
import { SALE_STATUS_LABELS } from './sale'

export const AUDIT_ENTITY_LABELS: Record<AuditEntity, string> = {
  product: 'Productos',
  supplier: 'Proveedores',
  purchase: 'Compras',
  sale: 'Ventas',
  cash_session: 'Caja',
  user: 'Usuarios',
}

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  'product.create': 'Producto creado',
  'product.update': 'Producto editado',
  'product.stock_adjustment': 'Ajuste de inventario',
  'supplier.create': 'Proveedor creado',
  'supplier.update': 'Proveedor editado',
  'supplier.product_add': 'Producto asociado',
  'supplier.product_update': 'Producto del proveedor editado',
  'supplier.product_remove': 'Producto desasociado',
  'purchase.create': 'Compra creada',
  'purchase.discard': 'Borrador descartado',
  'purchase.confirm': 'Compra confirmada',
  'purchase.cancel': 'Compra anulada',
  'sale.cancel': 'Venta anulada',
  'cash_session.open': 'Caja abierta',
  'cash_session.income': 'Ingreso de caja',
  'cash_session.withdrawal': 'Retiro de caja',
  'cash_session.close': 'Caja cerrada',
  'user.create': 'Usuario creado',
  'user.update': 'Usuario editado',
  'user.password_reset': 'Contraseña restablecida',
}

/** Actions of one entity type (their code starts with the entity type). */
export function auditActionsOf(entity: AuditEntity): AuditAction[] {
  return (Object.keys(AUDIT_ACTION_LABELS) as AuditAction[]).filter((action) =>
    action.startsWith(`${entity}.`),
  )
}

type FieldFormat = 'money' | 'quantity' | 'percent' | 'active'

interface FieldSpec {
  label: string
  format?: FieldFormat
  options?: Record<string, string>
}

const FIELDS: Record<string, FieldSpec> = {
  // Products and inventory
  type: { label: 'Tipo', options: PRODUCT_TYPE_LABELS },
  sku: { label: 'SKU' },
  barcode: { label: 'Código de barras' },
  name: { label: 'Nombre' },
  description: { label: 'Descripción' },
  category: { label: 'Categoría' },
  unit_of_measure: { label: 'Unidad de medida', options: UNIT_LABELS },
  tax_rate: { label: 'IVA', format: 'percent' },
  sale_price: { label: 'Precio de venta', format: 'money' },
  cost: { label: 'Costo', format: 'money' },
  min_stock: { label: 'Stock mínimo', format: 'quantity' },
  reorder_point: { label: 'Punto de reorden', format: 'quantity' },
  target_stock: { label: 'Stock objetivo', format: 'quantity' },
  is_active: { label: 'Estado', format: 'active' },
  movement_type: { label: 'Movimiento', options: MOVEMENT_TYPE_LABELS },
  quantity: { label: 'Cantidad', format: 'quantity' },
  unit_cost: { label: 'Costo unitario', format: 'money' },
  reason: { label: 'Motivo' },
  current_stock: { label: 'Stock', format: 'quantity' },
  average_cost: { label: 'Costo promedio', format: 'money' },
  last_cost: { label: 'Último costo', format: 'money' },
  // Suppliers
  document_type: { label: 'Tipo de documento', options: DOCUMENT_TYPE_LABELS },
  document_number: { label: 'Número de documento' },
  contact_name: { label: 'Contacto' },
  phone: { label: 'Teléfono' },
  email: { label: 'Correo' },
  address: { label: 'Dirección' },
  city: { label: 'Ciudad' },
  notes: { label: 'Observaciones' },
  product: { label: 'Producto' },
  supplier_sku: { label: 'Código del proveedor' },
  purchase_price: { label: 'Precio de compra', format: 'money' },
  // Purchases and sales
  status: { label: 'Estado' },
  number: { label: 'Consecutivo' },
  supplier: { label: 'Proveedor' },
  supplier_invoice_number: { label: 'Factura del proveedor' },
  item_count: { label: 'Productos' },
  total: { label: 'Total', format: 'money' },
  amount_paid: { label: 'Pagado', format: 'money' },
  balance_due: { label: 'Saldo', format: 'money' },
  cancellation_reason: { label: 'Motivo de anulación' },
  cash_refunded: { label: 'Efectivo devuelto', format: 'money' },
  refund_cash_session_id: { label: 'Apertura del reintegro' },
  // Cash
  cash_register: { label: 'Caja' },
  opening_amount: { label: 'Base inicial', format: 'money' },
  opening_notes: { label: 'Observaciones de apertura' },
  expected_cash: { label: 'Efectivo esperado', format: 'money' },
  amount: { label: 'Valor', format: 'money' },
  concept: { label: 'Concepto' },
  opened_by: { label: 'Abierta por' },
  counted_cash: { label: 'Efectivo contado', format: 'money' },
  difference: { label: 'Diferencia', format: 'money' },
  closing_notes: { label: 'Observaciones de cierre' },
  // Users
  username: { label: 'Usuario' },
  full_name: { label: 'Nombre completo' },
  role: { label: 'Rol' },
}

// `status` means something different for each entity.
const STATUS_LABELS: Partial<Record<AuditEntity, Record<string, string>>> = {
  purchase: PURCHASE_STATUS_LABELS,
  sale: SALE_STATUS_LABELS,
  cash_session: CASH_SESSION_STATUS_LABELS,
}

const FIELD_ORDER = new Map(Object.keys(FIELDS).map((field, index) => [field, index]))

/**
 * Fields in the order declared above (unknown ones last). PostgreSQL's JSONB does not keep
 * the order in which the backend wrote them.
 */
function sortFields(fields: Iterable<string>): string[] {
  const position = (field: string) => FIELD_ORDER.get(field) ?? FIELD_ORDER.size
  return [...new Set(fields)].sort((a, b) => position(a) - position(b))
}

export function auditFieldLabel(field: string): string {
  return FIELDS[field]?.label ?? field
}

/** Readable value of an audited field ("2500.00" → "$ 2.500", true → "Activo"). */
export function formatAuditValue(entity: AuditEntity, field: string, value: AuditValue): string {
  if (value === null || value === '') return '—'
  const text = String(value)
  if (field === 'status') return STATUS_LABELS[entity]?.[text] ?? text
  if (field === 'refund_cash_session_id') return `Apertura #${text}`
  const spec = FIELDS[field]
  switch (spec?.format) {
    case 'money':
      return formatCurrency(text)
    case 'quantity':
      return formatQuantity(text)
    case 'percent':
      return `${formatQuantity(text)} %`
    case 'active':
      return value ? 'Activo' : 'Inactivo'
  }
  if (spec?.options) return spec.options[text] ?? text
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  return text
}

export interface AuditChange {
  field: string
  label: string
  before: string
  after: string
}

/** One row per recorded field. */
export function auditChanges(log: AuditLog): AuditChange[] {
  const oldValues = log.old_values ?? {}
  const newValues = log.new_values ?? {}
  return sortFields([...Object.keys(newValues), ...Object.keys(oldValues)]).map((field) => ({
    field,
    label: auditFieldLabel(field),
    before: formatAuditValue(log.entity_type, field, oldValues[field] ?? null),
    after: formatAuditValue(log.entity_type, field, newValues[field] ?? null),
  }))
}

function changedLabels(values: AuditValues, except: string[] = []): string {
  return sortFields(Object.keys(values))
    .filter((field) => !except.includes(field))
    .map(auditFieldLabel)
    .join(', ')
}

/** One-line description of what happened, for the audit table. */
export function auditSummary(log: AuditLog): string {
  const oldValues = log.old_values ?? {}
  const newValues = log.new_values ?? {}
  const value = (values: AuditValues, field: string) =>
    formatAuditValue(log.entity_type, field, values[field] ?? null)

  switch (log.action) {
    case 'product.create':
      return `Precio ${value(newValues, 'sale_price')} · ${value(newValues, 'category')}`
    case 'product.update':
    case 'supplier.update':
    case 'user.update':
      return `Cambió: ${changedLabels(newValues)}`
    case 'product.stock_adjustment':
      return `${value(newValues, 'movement_type')} de ${value(newValues, 'quantity')} · ${value(newValues, 'reason')}`
    case 'supplier.create':
      return `${value(newValues, 'document_type')} ${value(newValues, 'document_number')}`
    case 'supplier.product_add':
      return value(newValues, 'product')
    case 'supplier.product_update':
      return `${value(newValues, 'product')} · cambió: ${changedLabels(newValues, ['product'])}`
    case 'supplier.product_remove':
      return value(oldValues, 'product')
    case 'purchase.create':
      return `Total ${value(newValues, 'total')}`
    case 'purchase.discard':
      return `Total ${value(oldValues, 'total')}`
    case 'purchase.confirm':
      return `${value(newValues, 'number')} · total ${value(newValues, 'total')}`
    case 'purchase.cancel':
    case 'sale.cancel':
      return `Motivo: ${value(newValues, 'cancellation_reason')}`
    case 'cash_session.open':
      return `Base inicial ${value(newValues, 'opening_amount')}`
    case 'cash_session.income':
    case 'cash_session.withdrawal':
      return `${value(newValues, 'amount')} · ${value(newValues, 'concept')}`
    case 'cash_session.close':
      return `Contado ${value(newValues, 'counted_cash')} · diferencia ${value(newValues, 'difference')}`
    case 'user.create':
      return `Rol ${value(newValues, 'role')}`
    case 'user.password_reset':
      return 'Sesiones cerradas'
  }
}

/** Page of the audited document, for entities that have one. */
export function auditEntityPath(log: AuditLog): string | null {
  if (log.entity_type === 'sale') return `/ventas/${log.entity_id}`
  // A discarded draft no longer exists.
  if (log.entity_type === 'purchase' && log.action !== 'purchase.discard') {
    return `/compras/${log.entity_id}`
  }
  return null
}
