import { ArrowDown, ArrowUp } from 'lucide-react'
import { useState } from 'react'
import { CashMovementModal } from '@/components/cash/CashMovementModal'
import { CashMovementsList } from '@/components/cash/CashMovementsList'
import { CashSessionSummary } from '@/components/cash/CashSessionSummary'
import { OpenSessionForm } from '@/components/cash/OpenSessionForm'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { useCurrentCashSession } from '@/hooks/useCash'
import type { CashMovementType } from '@/types/cash'
import { getErrorMessage } from '@/utils/errors'

/** The cashier's own register: open it, or see its cash and record income and withdrawals. */
function MyCashPage() {
  const { data: session, isPending, isError, error } = useCurrentCashSession()
  const [movementType, setMovementType] = useState<CashMovementType | null>(null)

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
          </div>
        )}
      </div>

      {isError && <Alert>{getErrorMessage(error)}</Alert>}
      {isPending && <p className="text-sm text-slate-600">Cargando caja…</p>}
      {session === null && <OpenSessionForm />}
      {session && (
        <>
          <CashSessionSummary session={session} />
          <h2 className="text-lg font-semibold text-slate-900">Ingresos y retiros</h2>
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
    </section>
  )
}

export default MyCashPage
