import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AuthContext, type AuthContextValue, type AuthStatus } from '@/hooks/authContext'
import { refreshSession, setAccessToken, setSessionListener } from '@/services/apiClient'
import * as authService from '@/services/auth'
import type { CurrentUser, PermissionCode } from '@/types/auth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')

  useEffect(() => {
    setSessionListener((sessionUser) => {
      setUser(sessionUser)
      setStatus(sessionUser ? 'authenticated' : 'anonymous')
    })
    // Restore the session from the refresh-token cookie after a page reload.
    refreshSession().catch(() => undefined)
    return () => setSessionListener(null)
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const session = await authService.login(username, password)
    setAccessToken(session.access_token)
    setUser(session.user)
    setStatus('authenticated')
  }, [])

  const logout = useCallback(async () => {
    try {
      await authService.logout()
    } finally {
      setAccessToken(null)
      setUser(null)
      setStatus('anonymous')
      queryClient.clear()
    }
  }, [queryClient])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      login,
      logout,
      hasPermission: (permission: PermissionCode) =>
        user?.permissions.includes(permission) ?? false,
    }),
    [status, user, login, logout],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
