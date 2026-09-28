import {
  CircleAlert,
  CircleCheck,
  CircleMinus,
  LoaderCircle,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'

export type StatusTone = 'loading' | 'ok' | 'warning' | 'error' | 'neutral'

const TONES: Record<StatusTone, { icon: LucideIcon; className: string }> = {
  loading: { icon: LoaderCircle, className: 'border-slate-200 bg-slate-50 text-slate-700' },
  ok: { icon: CircleCheck, className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  warning: { icon: TriangleAlert, className: 'border-amber-200 bg-amber-50 text-amber-900' },
  error: { icon: CircleAlert, className: 'border-red-200 bg-red-50 text-red-800' },
  neutral: { icon: CircleMinus, className: 'border-slate-200 bg-slate-100 text-slate-700' },
}

const SIZES = {
  sm: { badge: 'gap-1 px-2 py-0.5 text-xs', icon: 'size-3.5' },
  md: { badge: 'gap-2 px-4 py-3 text-sm', icon: 'size-5' },
}

interface StatusBadgeProps {
  tone: StatusTone
  label: string
  size?: keyof typeof SIZES
  /** Replaces the tone's default icon (e.g. to tell apart two states with the same color). */
  icon?: LucideIcon
}

/** State indicator that never relies on color alone: color + icon + text. */
export function StatusBadge({ tone, label, size = 'md', icon }: StatusBadgeProps) {
  const { icon: defaultIcon, className } = TONES[tone]
  const Icon = icon ?? defaultIcon
  const sizing = SIZES[size]
  return (
    <span
      className={`inline-flex items-center rounded-lg border font-medium ${sizing.badge} ${className}`}
    >
      <Icon
        aria-hidden="true"
        className={`${sizing.icon} ${tone === 'loading' ? 'animate-spin' : ''}`}
      />
      {label}
    </span>
  )
}
