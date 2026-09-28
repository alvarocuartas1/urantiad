import { CircleAlert, CircleCheck, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type AlertTone = 'error' | 'success'

const TONES: Record<AlertTone, { icon: LucideIcon; className: string }> = {
  error: { icon: CircleAlert, className: 'border-red-200 bg-red-50 text-red-800' },
  success: { icon: CircleCheck, className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
}

export function Alert({ tone = 'error', children }: { tone?: AlertTone; children: ReactNode }) {
  const { icon: Icon, className } = TONES[tone]
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${className}`}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  )
}
