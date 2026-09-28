import type { RoleSummary } from './auth'

export interface User {
  id: number
  username: string
  full_name: string
  role: RoleSummary
  is_active: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
}

export interface Role extends RoleSummary {
  description: string
  permissions: { code: string; description: string }[]
}

export interface UserCreate {
  username: string
  full_name: string
  password: string
  role_id: number
}

export interface UserUpdate {
  full_name?: string
  role_id?: number
  is_active?: boolean
}

export interface UserListParams {
  page: number
  size: number
  search?: string
  is_active?: boolean
}
