import {
  ArrowDown,
  ArrowUp,
  CircleCheck,
  Lock,
  LockOpen,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import { StatusBadge, type StatusTone } from '@/components/ui/StatusBadge'
import type { CashMovementType, CashSessionStatus } from '@/types/cash'
import {
  CASH_DIFFERENCE_LABELS,
  CASH_MOVEMENT_TYPE_LABELS,
  CASH_SESSION_STATUS_LABELS,
  cashDifferenceKind,
  isInboundCashMovement,
  type CashDifferenceKind,
} from '@/utils/cash'
import { formatCurrency } from '@/utils/format'

/** Session status with color + icon + text: open lock in green, closed lock in gray. */
export function CashSessionStatusBadge({ status }: { status: CashSessionStatus }) {
  const open = status === 'open'
  return (
    <StatusBadge
      size="sm"
      tone={open ? 'ok' : 'neutral'}
      icon={open ? LockOpen : Lock}
      label={CASH_SESSION_STATUS_LABELS[status]}
    />
  )
}

/** Movement type with color + icon + text: green up arrow for cash in (income, sales), gray
 * down arrow for cash out (withdrawals, cancelled sales). */
export function CashMovementTypeBadge({ type }: { type: CashMovementType }) {
  const inbound = isInboundCashMovement(type)
  return (
    <StatusBadge
      size="sm"
      tone={inbound ? 'ok' : 'neutral'}
      icon={inbound ? ArrowUp : ArrowDown}
      label={CASH_MOVEMENT_TYPE_LABELS[type]}
    />
  )
}

const DIFFERENCE_STYLES: Record<CashDifferenceKind, { tone: StatusTone; icon: LucideIcon }> = {
  balanced: { tone: 'ok', icon: CircleCheck },
  surplus: { tone: 'warning', icon: TrendingUp },
  shortage: { tone: 'error', icon: TrendingDown },
}

/** Result of a cash count with color + icon + text, and the amount when it is not balanced:
 * "Cuadrada", "Sobrante $500", "Faltante $1.000". */
export function CashDifferenceBadge({
  difference,
  size = 'sm',
}: {
  difference: string
  size?: 'sm' | 'md'
}) {
  const kind = cashDifferenceKind(difference)
  const { tone, icon } = DIFFERENCE_STYLES[kind]
  const amount = kind === 'balanced' ? '' : ` ${formatCurrency(difference.replace('-', ''))}`
  return (
    <StatusBadge
      size={size}
      tone={tone}
      icon={icon}
      label={`${CASH_DIFFERENCE_LABELS[kind]}${amount}`}
    />
  )
}
