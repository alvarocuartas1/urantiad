import { ArrowDown, ArrowUp, Lock, LockOpen } from 'lucide-react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { CashMovementType, CashSessionStatus } from '@/types/cash'
import {
  CASH_MOVEMENT_TYPE_LABELS,
  CASH_SESSION_STATUS_LABELS,
  isInboundCashMovement,
} from '@/utils/cash'

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
