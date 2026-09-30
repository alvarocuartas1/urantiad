import { Lock } from 'lucide-react'
import { useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useCashSession } from '@/hooks/useCash'
import type { CashSession } from '@/types/cash'
import { getErrorMessage } from '@/utils/errors'
import { CashMovementsList } from './CashMovementsList'
import { CashSalesByMethod } from './CashSalesByMethod'
import { CashSessionSummary } from './CashSessionSummary'
import { CloseSessionModal } from './CloseSessionModal'

interface CashSessionDetailModalProps {
  /** The row picked from the list, shown while the session reloads. */
  session: CashSession
  onClose: () => void
}

/** A session's summary, sales by method and movements (supervision). An open session can be
 * closed from here, e.g. when its cashier left without closing it. */
export function CashSessionDetailModal({ session: listed, onClose }: CashSessionDetailModalProps) {
  const { data: session = listed, isError, error } = useCashSession(listed.id, listed)
  const [closing, setClosing] = useState(false)

  if (closing) {
    return (
      <CloseSessionModal
        session={session}
        onClose={() => setClosing(false)}
        onClosed={() => setClosing(false)}
      />
    )
  }

  return (
    <Modal title="Detalle de la apertura" size="lg" onClose={onClose}>
      <div className="space-y-4">
        {isError && <Alert>{getErrorMessage(error)}</Alert>}
        <CashSessionSummary session={session} />
        {session.status === 'open' && (
          <div className="flex justify-end">
            <Button onClick={() => setClosing(true)}>
              <Lock aria-hidden="true" className="size-4" />
              Cerrar caja
            </Button>
          </div>
        )}
        <CashSalesByMethod sessionId={session.id} />
        <h3 className="text-sm font-semibold text-slate-900">Movimientos de caja</h3>
        <CashMovementsList sessionId={session.id} />
      </div>
    </Modal>
  )
}
