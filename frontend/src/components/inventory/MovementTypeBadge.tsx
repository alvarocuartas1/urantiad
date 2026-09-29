import { ArrowDown, ArrowUp } from 'lucide-react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { MovementType } from '@/types/inventory'
import { MOVEMENT_TYPE_LABELS, isInbound } from '@/utils/inventory'

/** Movement type with color + icon + text: green up arrow for entries, gray down for exits. */
export function MovementTypeBadge({ type }: { type: MovementType }) {
  const inbound = isInbound(type)
  return (
    <StatusBadge
      size="sm"
      tone={inbound ? 'ok' : 'neutral'}
      icon={inbound ? ArrowUp : ArrowDown}
      label={MOVEMENT_TYPE_LABELS[type]}
    />
  )
}
