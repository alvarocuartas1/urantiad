from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    CheckConstraint,
    ColumnElement,
    ForeignKey,
    Index,
    Numeric,
    String,
    case,
    func,
    null,
    text,
)
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.category import Category
from app.models.user import User


class ProductType(StrEnum):
    PRODUCT = "product"
    # Services (photocopies, prints) are sold like products but never move inventory.
    SERVICE = "service"


class UnitOfMeasure(StrEnum):
    UNIT = "unit"
    PACK = "pack"
    BOX = "box"
    KG = "kg"
    G = "g"
    L = "l"
    ML = "ml"
    PAGE = "page"


class StockStatus(StrEnum):
    OK = "ok"
    LOW = "low"
    CRITICAL = "critical"
    OUT_OF_STOCK = "out_of_stock"


def _in_values(column: str, enum: type[StrEnum]) -> str:
    return f"{column} IN ({', '.join(repr(item.value) for item in enum)})"


class Product(TimestampMixin, Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint(_in_values("type", ProductType), name="type_valid"),
        CheckConstraint(_in_values("unit_of_measure", UnitOfMeasure), name="unit_of_measure_valid"),
        CheckConstraint("sku = upper(sku)", name="sku_uppercase"),
        CheckConstraint("tax_rate >= 0 AND tax_rate <= 100", name="tax_rate_range"),
        CheckConstraint("sale_price >= 0", name="sale_price_non_negative"),
        CheckConstraint("average_cost >= 0", name="average_cost_non_negative"),
        CheckConstraint("last_cost >= 0", name="last_cost_non_negative"),
        # current_stock has no ">= 0" check on purpose: negative stock is a business setting.
        CheckConstraint(
            "min_stock >= 0 AND min_stock <= reorder_point AND reorder_point <= target_stock",
            name="stock_levels_order",
        ),
        CheckConstraint(
            "type = 'product' OR (current_stock = 0 AND min_stock = 0 "
            "AND reorder_point = 0 AND target_stock = 0)",
            name="service_without_stock",
        ),
        # Trigram indexes keep "contains" searches (ILIKE '%text%') fast as the catalog grows.
        Index(
            "ix_products_name_trgm",
            "name",
            postgresql_using="gin",
            postgresql_ops={"name": "gin_trgm_ops"},
        ),
        Index(
            "ix_products_sku_trgm",
            "sku",
            postgresql_using="gin",
            postgresql_ops={"sku": "gin_trgm_ops"},
        ),
        Index(
            "ix_products_barcode_trgm",
            "barcode",
            postgresql_using="gin",
            postgresql_ops={"barcode": "gin_trgm_ops"},
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String(20), server_default=ProductType.PRODUCT.value)
    sku: Mapped[str] = mapped_column(String(50), unique=True)
    barcode: Mapped[str | None] = mapped_column(String(50), unique=True)
    name: Mapped[str] = mapped_column(String(150))
    description: Mapped[str | None] = mapped_column(String(500))
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"), index=True
    )
    unit_of_measure: Mapped[str] = mapped_column(String(20))
    # Percentage (19.00 = 19 %). sale_price already includes this tax.
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), server_default=text("0"))
    sale_price: Mapped[Decimal]
    average_cost: Mapped[Decimal] = mapped_column(server_default=text("0"))
    last_cost: Mapped[Decimal] = mapped_column(server_default=text("0"))
    # Changed only through inventory movements, never edited directly.
    current_stock: Mapped[Decimal] = mapped_column(server_default=text("0"))
    min_stock: Mapped[Decimal] = mapped_column(server_default=text("0"))
    reorder_point: Mapped[Decimal] = mapped_column(server_default=text("0"))
    target_stock: Mapped[Decimal] = mapped_column(server_default=text("0"))
    is_active: Mapped[bool] = mapped_column(server_default=text("true"))

    category: Mapped[Category] = relationship()

    @hybrid_property
    def stock_status(self) -> StockStatus | None:
        """Inventory alert level; `None` for services, which have no stock."""
        if self.type == ProductType.SERVICE:
            return None
        if self.current_stock <= 0:
            return StockStatus.OUT_OF_STOCK
        if self.current_stock <= self.min_stock:
            return StockStatus.CRITICAL
        if self.current_stock <= self.reorder_point:
            return StockStatus.LOW
        return StockStatus.OK

    @stock_status.inplace.expression
    @classmethod
    def _stock_status_expression(cls) -> ColumnElement[str | None]:
        return case(
            (cls.type == ProductType.SERVICE.value, null()),
            (cls.current_stock <= 0, StockStatus.OUT_OF_STOCK.value),
            (cls.current_stock <= cls.min_stock, StockStatus.CRITICAL.value),
            (cls.current_stock <= cls.reorder_point, StockStatus.LOW.value),
            else_=StockStatus.OK.value,
        )


class ProductPriceHistory(Base):
    """Every sale price a product has had; `old_price` is NULL for the initial price."""

    __tablename__ = "product_price_history"
    __table_args__ = (
        CheckConstraint("new_price >= 0", name="new_price_non_negative"),
        Index("ix_product_price_history_product_id_changed_at", "product_id", "changed_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"))
    old_price: Mapped[Decimal | None]
    new_price: Mapped[Decimal]
    changed_by_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    changed_at: Mapped[datetime] = mapped_column(server_default=func.now())

    product: Mapped[Product] = relationship()
    changed_by: Mapped[User] = relationship()
