import { Link } from 'react-router'
import type { AuditLog } from '@/types/audit'
import { auditEntityPath } from '@/utils/audit'

/** Name of the audited entity, linked to its page when it has one. */
export function AuditEntityLink({ log }: { log: AuditLog }) {
  const path = auditEntityPath(log)
  if (path === null) return <span className="font-medium text-slate-900">{log.entity_label}</span>
  return (
    <Link to={path} className="font-medium text-slate-900 underline-offset-2 hover:underline">
      {log.entity_label}
    </Link>
  )
}
