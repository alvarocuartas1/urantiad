# Import every model module here so Alembic autogenerate sees all tables.
from app.models.base import Base
from app.models.category import Category
from app.models.inventory import InventoryMovement, MovementType
from app.models.product import (
    COUNTABLE_UNITS,
    Product,
    ProductPriceHistory,
    ProductType,
    StockStatus,
    UnitOfMeasure,
)
from app.models.refresh_token import RefreshToken
from app.models.role import Permission, Role, role_permissions
from app.models.user import User

__all__ = [
    "COUNTABLE_UNITS",
    "Base",
    "Category",
    "InventoryMovement",
    "MovementType",
    "Permission",
    "Product",
    "ProductPriceHistory",
    "ProductType",
    "RefreshToken",
    "Role",
    "StockStatus",
    "UnitOfMeasure",
    "User",
    "role_permissions",
]
