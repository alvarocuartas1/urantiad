import {
  ArrowDown,
  ArrowUp,
  Ban,
  CircleCheck,
  KeyRound,
  Link2,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
  Unlink,
  type LucideIcon,
} from 'lucide-react'
import { StatusBadge, type StatusTone } from '@/components/ui/StatusBadge'
import type { AuditAction } from '@/types/audit'
import { AUDIT_ACTION_LABELS } from '@/utils/audit'

const STYLES: Record<AuditAction, { tone: StatusTone; icon: LucideIcon }> = {
  'product.create': { tone: 'ok', icon: Plus },
  'product.update': { tone: 'neutral', icon: Pencil },
  'product.stock_adjustment': { tone: 'neutral', icon: SlidersHorizontal },
  'supplier.create': { tone: 'ok', icon: Plus },
  'supplier.update': { tone: 'neutral', icon: Pencil },
  'supplier.product_add': { tone: 'ok', icon: Link2 },
  'supplier.product_update': { tone: 'neutral', icon: Pencil },
  'supplier.product_remove': { tone: 'warning', icon: Unlink },
  'purchase.create': { tone: 'neutral', icon: Plus },
  'purchase.discard': { tone: 'warning', icon: Trash2 },
  'purchase.confirm': { tone: 'ok', icon: CircleCheck },
  'purchase.cancel': { tone: 'error', icon: Ban },
  'sale.cancel': { tone: 'error', icon: Ban },
  'cash_session.open': { tone: 'ok', icon: LockOpen },
  'cash_session.income': { tone: 'ok', icon: ArrowUp },
  'cash_session.withdrawal': { tone: 'neutral', icon: ArrowDown },
  'cash_session.close': { tone: 'neutral', icon: Lock },
  'user.create': { tone: 'ok', icon: Plus },
  'user.update': { tone: 'neutral', icon: Pencil },
  'user.password_reset': { tone: 'warning', icon: KeyRound },
}

/** Audited action with color + icon + text: reversals in red, creations in green. */
export function AuditActionBadge({ action }: { action: AuditAction }) {
  const { tone, icon } = STYLES[action]
  return <StatusBadge size="sm" tone={tone} icon={icon} label={AUDIT_ACTION_LABELS[action]} />
}
