import { createContext } from 'react'
import type { CurrentUser, PermissionCode } from '@/types/auth'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export interface AuthContextValue {
  status: AuthStatus
  user: CurrentUser | null
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  hasPermission: (permission: PermissionCode) => boolean
}

export const AuthContext = createContext<AuthContextValue | null>(null)
