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
