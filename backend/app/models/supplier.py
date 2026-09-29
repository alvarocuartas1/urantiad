from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.product import Product, in_values


class DocumentType(StrEnum):
    NIT = "nit"
    CC = "cc"  # cédula de ciudadanía
    CE = "ce"  # cédula de extranjería
    PASSPORT = "passport"
    OTHER = "other"


class Supplier(TimestampMixin, Base):
    """Suppliers are never deleted: they are deactivated."""

    __tablename__ = "suppliers"
    __table_args__ = (
        CheckConstraint(in_values("document_type", DocumentType), name="document_type_valid"),
        CheckConstraint("document_number = upper(document_number)", name="document_uppercase"),
        # A person's CC and the base of their NIT share digits, so uniqueness includes the type.
        UniqueConstraint("document_type", "document_number"),
        Index(
            "ix_suppliers_name_trgm",
            "name",
            postgresql_using="gin",
            postgresql_ops={"name": "gin_trgm_ops"},
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    document_type: Mapped[str] = mapped_column(String(10))
    # Stored as typed (NIT check digit included), without dots or spaces.
    document_number: Mapped[str] = mapped_column(String(30))
    name: Mapped[str] = mapped_column(String(150))
    contact_name: Mapped[str | None] = mapped_column(String(100))
    phone: Mapped[str | None] = mapped_column(String(30))
    email: Mapped[str | None] = mapped_column(String(255))
    address: Mapped[str | None] = mapped_column(String(255))
    city: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(server_default=text("true"))


class SupplierProduct(TimestampMixin, Base):
    """A product a supplier sells, with its latest purchase price (catalog data, deletable)."""

    __tablename__ = "supplier_products"
    __table_args__ = (
        UniqueConstraint("supplier_id", "product_id"),
        CheckConstraint("purchase_price >= 0", name="purchase_price_non_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id", ondelete="RESTRICT"))
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="RESTRICT"), index=True
    )
    supplier_sku: Mapped[str | None] = mapped_column(String(50))
    # Unit cost before tax, the same basis as the product's average cost.
    purchase_price: Mapped[Decimal | None]
    price_updated_at: Mapped[datetime | None]
    notes: Mapped[str | None] = mapped_column(String(255))

    supplier: Mapped[Supplier] = relationship()
    product: Mapped[Product] = relationship()
