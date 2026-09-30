import { ShieldAlert } from 'lucide-react'
import { Outlet } from 'react-router'
import { useAuth } from '@/hooks/useAuth'
import { meetsRequirement, type PermissionRequirement } from '@/types/auth'

/** Renders child routes only if the user has `permission` (or any of a list). The backend
 * enforces it too. */
export function RequirePermission({ permission }: { permission: PermissionRequirement }) {
  const { hasPermission } = useAuth()

  if (!meetsRequirement(permission, hasPermission)) {
    return (
      <div
        role="alert"
        className="mx-auto mt-12 flex max-w-md flex-col items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center text-amber-900"
      >
        <ShieldAlert aria-hidden="true" className="size-8" />
        <p className="font-semibold">Sin acceso</p>
        <p className="text-sm">No tiene permisos para ver esta sección.</p>
      </div>
    )
  }
  return <Outlet />
}
