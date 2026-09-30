import type { AuditLog } from '@/types/audit'
import {
  auditActionsOf,
  auditChanges,
  auditEntityPath,
  auditSummary,
  formatAuditValue,
  describeUserAgent,
} from './audit'

const spaces = (text: string) => text.replace(/\s/g, ' ')

function buildLog(overrides: Partial<AuditLog>): AuditLog {
  return {
    id: 1,
    created_at: '2026-09-30T15:00:00Z',
    user: { id: 1, full_name: 'Administrador' },
    action: 'product.update',
    entity_type: 'product',
    entity_id: 7,
    entity_label: 'AGUA-1 · Agua 600 ml',
    old_values: null,
    new_values: null,
    ip_address: null,
    user_agent: null,
    ...overrides,
  }
}

describe('formatAuditValue', () => {
  it('formats each kind of field', () => {
    expect(spaces(formatAuditValue('product', 'sale_price', '2500.00'))).toBe('$ 2.500')
    expect(formatAuditValue('product', 'tax_rate', '19.00')).toBe('19 %')
    expect(formatAuditValue('product', 'current_stock', '12.50')).toBe('12,5')
    expect(formatAuditValue('product', 'is_active', false)).toBe('Inactivo')
    expect(formatAuditValue('product', 'unit_of_measure', 'page')).toBe('Página')
    expect(formatAuditValue('product', 'barcode', null)).toBe('—')
    expect(formatAuditValue('sale', 'refund_cash_session_id', 4)).toBe('Apertura #4')
    expect(formatAuditValue('supplier', 'unknown_field', 'texto')).toBe('texto')
  })

  it('reads the status with the labels of the entity', () => {
    expect(formatAuditValue('sale', 'status', 'cancelled')).toBe('Anulada')
    expect(formatAuditValue('cash_session', 'status', 'closed')).toBe('Cerrada')
    expect(formatAuditValue('purchase', 'status', 'draft')).toBe('Borrador')
  })
})

describe('auditChanges', () => {
  it('pairs old and new values of every recorded field', () => {
    const log = buildLog({
      action: 'product.stock_adjustment',
      old_values: { current_stock: '10.00' },
      new_values: { reason: 'Conteo', current_stock: '20.00' },
    })

    expect(auditChanges(log)).toEqual([
      { field: 'reason', label: 'Motivo', before: '—', after: 'Conteo' },
      { field: 'current_stock', label: 'Stock', before: '10', after: '20' },
    ])
  })
})

describe('auditSummary', () => {
  it('lists the changed fields of an update in a stable order', () => {
    // JSONB returns keys sorted by length, not in the order they were written.
    const log = buildLog({
      old_values: { is_active: true, min_stock: '0.00', sale_price: '2000.00' },
      new_values: { is_active: false, min_stock: '2.00', sale_price: '2500.00' },
    })

    expect(auditSummary(log)).toBe('Cambió: Precio de venta, Stock mínimo, Estado')
  })

  it('describes operations with their key data', () => {
    const closing = buildLog({
      action: 'cash_session.close',
      entity_type: 'cash_session',
      new_values: { counted_cash: '114000.00', difference: '-1000.00' },
    })
    const removal = buildLog({
      action: 'supplier.product_remove',
      entity_type: 'supplier',
      old_values: { product: 'AGUA-1 · Agua 600 ml', purchase_price: '1150.00' },
    })

    expect(spaces(auditSummary(closing))).toBe('Contado $ 114.000 · diferencia -$ 1.000')
    expect(auditSummary(removal)).toBe('AGUA-1 · Agua 600 ml')
  })
})

describe('auditEntityPath', () => {
  it('links sales and existing purchases', () => {
    expect(auditEntityPath(buildLog({ action: 'sale.cancel', entity_type: 'sale' }))).toBe(
      '/ventas/7',
    )
    expect(auditEntityPath(buildLog({ action: 'purchase.confirm', entity_type: 'purchase' }))).toBe(
      '/compras/7',
    )
    expect(
      auditEntityPath(buildLog({ action: 'purchase.discard', entity_type: 'purchase' })),
    ).toBeNull()
    expect(auditEntityPath(buildLog({}))).toBeNull()
  })
})

describe('auditActionsOf', () => {
  it('returns the actions of an area', () => {
    expect(auditActionsOf('sale')).toEqual(['sale.cancel'])
    expect(auditActionsOf('cash_session')).toHaveLength(4)
  })
})

describe('describeUserAgent', () => {
  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
      'Edge · Windows',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
      'Chrome · Android',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      'Safari · iOS',
    ],
    [
      'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
      'Firefox · Linux',
    ],
    ['PostmanRuntime/7.42.0', null],
  ])('%s', (userAgent, expected) => {
    expect(describeUserAgent(userAgent)).toBe(expected)
  })
})
