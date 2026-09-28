import type { TokenResponse } from '@/types/auth'
import { apiRequest } from './apiClient'

export function login(username: string, password: string): Promise<TokenResponse> {
  return apiRequest<TokenResponse>('/auth/login', {
    method: 'POST',
    body: { username, password },
    // A 401 here means wrong credentials, not an expired session.
    retryOnUnauthorized: false,
  })
}

export async function logout(): Promise<void> {
  await apiRequest<null>('/auth/logout', { method: 'POST', retryOnUnauthorized: false })
}

export async function changeOwnPassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await apiRequest<null>('/auth/me/password', {
    method: 'PUT',
    body: { current_password: currentPassword, new_password: newPassword },
  })
}
