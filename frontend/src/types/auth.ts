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
  purchasesRead: 'purchases.read',
  purchasesManage: 'purchases.manage',
  purchasesCancel: 'purchases.cancel',
  customersRead: 'customers.read',
  customersManage: 'customers.manage',
  cashRegistersRead: 'cash_registers.read',
  cashRegistersManage: 'cash_registers.manage',
  cashOperate: 'cash.operate',
  cashSupervise: 'cash.supervise',
  salesCreate: 'sales.create',
  salesRead: 'sales.read',
  salesReadAll: 'sales.read_all',
  salesCancel: 'sales.cancel',
  auditRead: 'audit.read',
} as const

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

/** One permission, or a list of which any one is enough (e.g. a section with several tabs). */
export type PermissionRequirement = PermissionCode | readonly PermissionCode[]

export function meetsRequirement(
  requirement: PermissionRequirement,
  hasPermission: (permission: PermissionCode) => boolean,
): boolean {
  return typeof requirement === 'string'
    ? hasPermission(requirement)
    : requirement.some(hasPermission)
}

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
