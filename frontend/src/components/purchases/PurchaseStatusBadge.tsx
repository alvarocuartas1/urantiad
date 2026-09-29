import { Ban, CircleCheck, FilePen, type LucideIcon } from 'lucide-react'
import { StatusBadge, type StatusTone } from '@/components/ui/StatusBadge'
import type { PurchaseStatus } from '@/types/purchase'
import { PURCHASE_STATUS_LABELS } from '@/utils/purchase'

const APPEARANCE: Record<PurchaseStatus, { tone: StatusTone; icon: LucideIcon }> = {
  draft: { tone: 'neutral', icon: FilePen },
  confirmed: { tone: 'ok', icon: CircleCheck },
  cancelled: { tone: 'error', icon: Ban },
}

export function PurchaseStatusBadge({ status }: { status: PurchaseStatus }) {
  const { tone, icon } = APPEARANCE[status]
  return <StatusBadge size="sm" tone={tone} icon={icon} label={PURCHASE_STATUS_LABELS[status]} />
}
