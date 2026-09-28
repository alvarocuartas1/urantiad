import type { Page } from '@/types/api'
import type { Role, User, UserCreate, UserListParams, UserUpdate } from '@/types/user'
import { apiRequest } from './apiClient'

export function listUsers(params: UserListParams): Promise<Page<User>> {
  return apiRequest<Page<User>>('/users', { query: { ...params } })
}

export function createUser(data: UserCreate): Promise<User> {
  return apiRequest<User>('/users', { method: 'POST', body: data })
}

export function updateUser(id: number, data: UserUpdate): Promise<User> {
  return apiRequest<User>(`/users/${id}`, { method: 'PATCH', body: data })
}

export async function resetUserPassword(id: number, newPassword: string): Promise<void> {
  await apiRequest<null>(`/users/${id}/password`, {
    method: 'PUT',
    body: { new_password: newPassword },
  })
}

export function listRoles(): Promise<Role[]> {
  return apiRequest<Role[]>('/roles')
}
