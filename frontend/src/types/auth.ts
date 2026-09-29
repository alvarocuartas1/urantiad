/** Permission codes defined by the backend (`app/core/permissions.py`). */
export const PERMISSIONS = {
  usersRead: 'users.read',
  usersManage: 'users.manage',
  rolesRead: 'roles.read',
  productsRead: 'products.read',
  productsManage: 'products.manage',
  productsViewCosts: 'products.view_costs',
  inventoryRead: 'inventory.read',
  inventoryAdjust: 'inventory.adjust',
  suppliersRead: 'suppliers.read',
  suppliersManage: 'suppliers.manage',
} as const

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export interface RoleSummary {
  id: number
  code: string
  name: string
}

export interface CurrentUser {
  id: number
  username: string
  full_name: string
  role: RoleSummary
  permissions: string[]
}

export interface TokenResponse {
  access_token: string
  token_type: 'bearer'
  expires_in: number
  user: CurrentUser
}
