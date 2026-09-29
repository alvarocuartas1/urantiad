# Import every model module here so Alembic autogenerate sees all tables.
from app.models.base import Base
from app.models.cash import (
    CashMovement,
    CashMovementType,
    CashRegister,
    CashSession,
    CashSessionStatus,
)
from app.models.category import Category
from app.models.customer import Customer
from app.models.inventory import InventoryMovement, MovementType
from app.models.product import (
    COUNTABLE_UNITS,
    Product,
    ProductPriceHistory,
    ProductType,
    StockStatus,
    UnitOfMeasure,
)
from app.models.purchase import Purchase, PurchaseItem, PurchaseStatus
from app.models.refresh_token import RefreshToken
from app.models.role import Permission, Role, role_permissions
from app.models.sequence import DocumentSequence
from app.models.supplier import DocumentType, Supplier, SupplierProduct
from app.models.user import User

__all__ = [
    "COUNTABLE_UNITS",
    "Base",
    "CashMovement",
    "CashMovementType",
    "CashRegister",
    "CashSession",
    "CashSessionStatus",
    "Category",
    "Customer",
    "DocumentSequence",
    "DocumentType",
    "InventoryMovement",
    "MovementType",
    "Permission",
    "Product",
    "ProductPriceHistory",
    "ProductType",
    "Purchase",
    "PurchaseItem",
    "PurchaseStatus",
    "RefreshToken",
    "Role",
    "StockStatus",
    "Supplier",
    "SupplierProduct",
    "UnitOfMeasure",
    "User",
    "role_permissions",
]
