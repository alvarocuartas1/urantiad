import {
  ArrowLeftRight,
  ClipboardList,
  House,
  KeyRound,
  LogOut,
  Package,
  Tags,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { ChangePasswordModal } from '@/components/auth/ChangePasswordModal'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'
import { PERMISSIONS, type PermissionCode } from '@/types/auth'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  permission?: PermissionCode
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Inicio', icon: House },
  { to: '/productos', label: 'Productos', icon: Package, permission: PERMISSIONS.productsRead },
  { to: '/categorias', label: 'Categorías', icon: Tags, permission: PERMISSIONS.productsRead },
  {
    to: '/inventario/movimientos',
    label: 'Movimientos',
    icon: ArrowLeftRight,
    permission: PERMISSIONS.inventoryRead,
  },
  {
    to: '/inventario/reposicion',
    label: 'Reposición',
    icon: ClipboardList,
    permission: PERMISSIONS.inventoryRead,
  },
  { to: '/usuarios', label: 'Usuarios', icon: Users, permission: PERMISSIONS.usersRead },
]

export function AppLayout() {
  const { user, logout, hasPermission } = useAuth()
  const [changingPassword, setChangingPassword] = useState(false)
  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.permission || hasPermission(item.permission),
  )

  return (
    <div className="flex min-h-svh flex-col bg-slate-100 md:flex-row">
      <aside className="flex flex-col bg-slate-900 text-slate-100 md:w-60 md:shrink-0">
        <div className="px-5 py-4 text-lg font-bold tracking-tight">URANTIAD</div>
        <nav aria-label="Principal" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col">
          {visibleItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap ${
                  isActive ? 'bg-white/15 text-white' : 'text-slate-300 hover:bg-white/10'
                }`
              }
            >
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-end gap-2 border-b border-slate-200 bg-white px-4 py-2">
          <div className="mr-auto text-sm md:mr-2 md:text-right">
            <p className="font-medium text-slate-900">{user?.full_name}</p>
            <p className="text-xs text-slate-500">{user?.role.name}</p>
          </div>
          <Button variant="ghost" onClick={() => setChangingPassword(true)}>
            <KeyRound aria-hidden="true" className="size-4" />
            Contraseña
          </Button>
          <Button variant="secondary" onClick={() => void logout()}>
            <LogOut aria-hidden="true" className="size-4" />
            Cerrar sesión
          </Button>
        </header>
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>

      {changingPassword && <ChangePasswordModal onClose={() => setChangingPassword(false)} />}
    </div>
  )
}
