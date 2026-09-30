import { ArrowDown, ArrowUp, Lock } from 'lucide-react'
import { useState } from 'react'
import { CashMovementModal } from '@/components/cash/CashMovementModal'
import { CashMovementsList } from '@/components/cash/CashMovementsList'
import { CashSalesByMethod } from '@/components/cash/CashSalesByMethod'
import { CashSessionSummary } from '@/components/cash/CashSessionSummary'
import { CloseSessionModal } from '@/components/cash/CloseSessionModal'
import { OpenSessionForm } from '@/components/cash/OpenSessionForm'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useCurrentCashSession } from '@/hooks/useCash'
import type { CashSession, ManualCashMovementType } from '@/types/cash'
import { getErrorMessage } from '@/utils/errors'

/** The cashier's own register: open it, see its cash, record income and withdrawals, and
 * close it with the cash count. */
function MyCashPage() {
  const { data: session, isPending, isError, error } = useCurrentCashSession()
  const [movementType, setMovementType] = useState<ManualCashMovementType | null>(null)
  const [closing, setClosing] = useState(false)
  const [closed, setClosed] = useState<CashSession | null>(null)

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Mi caja</h1>
        {session && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setMovementType('income')}>
              <ArrowUp aria-hidden="true" className="size-4" />
              Registrar ingreso
            </Button>
            <Button variant="secondary" onClick={() => setMovementType('withdrawal')}>
              <ArrowDown aria-hidden="true" className="size-4" />
              Registrar retiro
            </Button>
            <Button onClick={() => setClosing(true)}>
              <Lock aria-hidden="true" className="size-4" />
              Cerrar caja
            </Button>
          </div>
        )}
      </div>

      {isError && <Alert>{getErrorMessage(error)}</Alert>}
      {isPending && <p className="text-sm text-slate-600">Cargando caja…</p>}
      {session === null && <OpenSessionForm />}
      {session && (
        <>
          <CashSessionSummary session={session} />
          <h2 className="text-lg font-semibold text-slate-900">Movimientos de caja</h2>
          <CashMovementsList sessionId={session.id} />
        </>
      )}

      {session && movementType && (
        <CashMovementModal
          session={session}
          type={movementType}
          onClose={() => setMovementType(null)}
        />
      )}

      {session && closing && (
        <CloseSessionModal
          session={session}
          onClose={() => setClosing(false)}
          onClosed={(result) => {
            setClosing(false)
            setClosed(result)
          }}
        />
      )}

      {closed && (
        <Modal title="Caja cerrada" size="lg" onClose={() => setClosed(null)}>
          <div className="space-y-4">
            <CashSessionSummary session={closed} />
            <CashSalesByMethod sessionId={closed.id} />
            <div className="flex justify-end">
              <Button onClick={() => setClosed(null)}>Aceptar</Button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  )
}

export default MyCashPage
