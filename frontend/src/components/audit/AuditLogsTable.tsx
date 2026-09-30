import { Eye } from 'lucide-react'
import type { AuditLog } from '@/types/audit'
import { AUDIT_ENTITY_LABELS, auditSummary } from '@/utils/audit'
import { formatDateTime } from '@/utils/format'
import { AuditActionBadge } from './AuditActionBadge'
import { AuditEntityLink } from './AuditEntityLink'

interface AuditLogsTableProps {
  logs: AuditLog[]
  onSelect: (log: AuditLog) => void
}

const HEADER_CLASS = 'px-4 py-3 font-semibold'
const CELL_CLASS = 'px-4 py-3'

export function AuditLogsTable({ logs, onSelect }: AuditLogsTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 uppercase">
          <tr>
            <th scope="col" className={HEADER_CLASS}>
              Fecha
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Usuario
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Acción
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Entidad
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Resumen
            </th>
            <th scope="col" className={`${HEADER_CLASS} text-right`}>
              Acciones
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {logs.map((log) => (
            <tr key={log.id} className="hover:bg-slate-50">
              <td className={`${CELL_CLASS} whitespace-nowrap text-slate-700`}>
                {formatDateTime(log.created_at)}
              </td>
              <td className={`${CELL_CLASS} text-slate-700`}>{log.user?.full_name ?? 'Sistema'}</td>
              <td className={`${CELL_CLASS} whitespace-nowrap`}>
                <AuditActionBadge action={log.action} />
              </td>
              <td className={CELL_CLASS}>
                <AuditEntityLink log={log} />
                <p className="text-xs text-slate-500">{AUDIT_ENTITY_LABELS[log.entity_type]}</p>
              </td>
              <td className={`${CELL_CLASS} max-w-sm text-slate-700`}>{auditSummary(log)}</td>
              <td className={`${CELL_CLASS} text-right`}>
                <button
                  type="button"
                  onClick={() => onSelect(log)}
                  aria-label={`Ver detalle de ${log.entity_label}`}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-slate-700 hover:bg-slate-100"
                >
                  <Eye aria-hidden="true" className="size-4" />
                  Ver
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
