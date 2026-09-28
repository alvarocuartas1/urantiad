import { PackageX, Printer } from 'lucide-react'
import { StatusBadge, type StatusTone } from '@/components/ui/StatusBadge'
import type { StockStatus } from '@/types/catalog'
import { STOCK_STATUS_LABELS } from '@/utils/catalog'

const TONES: Record<StockStatus, StatusTone> = {
  ok: 'ok',
  low: 'warning',
  critical: 'error',
  out_of_stock: 'error',
}

/** Inventory alert level: color + icon + text. `null` means a service (no stock). */
export function StockStatusBadge({ status }: { status: StockStatus | null }) {
  if (status === null) {
    return <StatusBadge size="sm" tone="neutral" icon={Printer} label="Servicio" />
  }
  return (
    <StatusBadge
      size="sm"
      tone={TONES[status]}
      // "Agotado" and "Stock crítico" share the red color, so they differ by icon too.
      icon={status === 'out_of_stock' ? PackageX : undefined}
      label={STOCK_STATUS_LABELS[status]}
    />
  )
}
