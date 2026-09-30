import { Ban, CircleCheck, type LucideIcon } from 'lucide-react'
import { StatusBadge, type StatusTone } from '@/components/ui/StatusBadge'
import type { SaleStatus } from '@/types/sale'
import { SALE_STATUS_LABELS } from '@/utils/sale'

const APPEARANCE: Record<SaleStatus, { tone: StatusTone; icon: LucideIcon }> = {
  completed: { tone: 'ok', icon: CircleCheck },
  cancelled: { tone: 'error', icon: Ban },
}

export function SaleStatusBadge({ status }: { status: SaleStatus }) {
  const { tone, icon } = APPEARANCE[status]
  return <StatusBadge size="sm" tone={tone} icon={icon} label={SALE_STATUS_LABELS[status]} />
}
