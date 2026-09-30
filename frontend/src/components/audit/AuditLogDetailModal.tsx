import { Modal } from '@/components/ui/Modal'
import type { AuditLog } from '@/types/audit'
import { AUDIT_ENTITY_LABELS, auditChanges } from '@/utils/audit'
import { formatDateTime } from '@/utils/format'
import { AuditActionBadge } from './AuditActionBadge'
import { AuditEntityLink } from './AuditEntityLink'

interface AuditLogDetailModalProps {
  log: AuditLog
  onClose: () => void
}

const HEADER_CLASS = 'px-3 py-2 font-semibold'
const CELL_CLASS = 'px-3 py-2'

export function AuditLogDetailModal({ log, onClose }: AuditLogDetailModalProps) {
  const changes = auditChanges(log)
  // Creations have only new values and removals only old ones: one value column then.
  const showBefore = log.old_values !== null
  const showAfter = log.new_values !== null

  return (
    <Modal title="Detalle de auditoría" size="lg" onClose={onClose}>
      <div className="space-y-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Fecha</dt>
            <dd className="font-medium text-slate-900">{formatDateTime(log.created_at)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Usuario</dt>
            <dd className="font-medium text-slate-900">{log.user?.full_name ?? 'Sistema'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Acción</dt>
            <dd>
              <AuditActionBadge action={log.action} />
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">{AUDIT_ENTITY_LABELS[log.entity_type]}</dt>
            <dd>
              <AuditEntityLink log={log} />
            </dd>
          </div>
        </dl>

        {changes.length === 0 ? (
          <p className="text-sm text-slate-600">Esta acción no registra valores.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 uppercase">
                <tr>
                  <th scope="col" className={HEADER_CLASS}>
                    Campo
                  </th>
                  {showBefore && (
                    <th scope="col" className={HEADER_CLASS}>
                      {showAfter ? 'Anterior' : 'Valor'}
                    </th>
                  )}
                  {showAfter && (
                    <th scope="col" className={HEADER_CLASS}>
                      {showBefore ? 'Nuevo' : 'Valor'}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {changes.map((change) => (
                  <tr key={change.field}>
                    <th scope="row" className={`${CELL_CLASS} font-medium text-slate-700`}>
                      {change.label}
                    </th>
                    {showBefore && (
                      <td className={`${CELL_CLASS} break-words text-slate-600`}>
                        {change.before}
                      </td>
                    )}
                    {showAfter && (
                      <td className={`${CELL_CLASS} font-medium break-words text-slate-900`}>
                        {change.after}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  )
}
