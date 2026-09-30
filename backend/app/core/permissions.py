"""Catalog of roles and permissions.

The database rows are created by Alembic migrations; these enums let the code reference
them without magic strings. Each stage adds its permissions here and in its migration.
"""

from enum import StrEnum


class RoleCode(StrEnum):
    ADMIN = "admin"
    CASHIER = "cashier"
    INVENTORY = "inventory"


class PermissionCode(StrEnum):
    USERS_READ = "users.read"
    USERS_MANAGE = "users.manage"
    ROLES_READ = "roles.read"
    PRODUCTS_READ = "products.read"
    PRODUCTS_MANAGE = "products.manage"
    PRODUCTS_VIEW_COSTS = "products.view_costs"
    INVENTORY_READ = "inventory.read"
    INVENTORY_ADJUST = "inventory.adjust"
    SUPPLIERS_READ = "suppliers.read"
    SUPPLIERS_MANAGE = "suppliers.manage"
    PURCHASES_READ = "purchases.read"
    PURCHASES_MANAGE = "purchases.manage"
    PURCHASES_CANCEL = "purchases.cancel"
    CUSTOMERS_READ = "customers.read"
    CUSTOMERS_MANAGE = "customers.manage"
    CASH_REGISTERS_READ = "cash_registers.read"
    CASH_REGISTERS_MANAGE = "cash_registers.manage"
    CASH_OPERATE = "cash.operate"
    CASH_SUPERVISE = "cash.supervise"
    SALES_CREATE = "sales.create"
    SALES_READ = "sales.read"
    SALES_READ_ALL = "sales.read_all"
    SALES_CANCEL = "sales.cancel"
