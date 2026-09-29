from sqlalchemy import CheckConstraint, Index, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin
from app.models.product import in_values
from app.models.supplier import DocumentType


class Customer(TimestampMixin, Base):
    """Customers are never deleted: they are deactivated.

    The default customer ("Consumidor final", seeded by the migration) is used for sales
    without a registered customer and cannot be edited or deactivated.
    """

    __tablename__ = "customers"
    __table_args__ = (
        CheckConstraint(in_values("document_type", DocumentType), name="document_type_valid"),
        CheckConstraint("document_number = upper(document_number)", name="document_uppercase"),
        UniqueConstraint("document_type", "document_number"),
        # At most one default customer.
        Index("uq_customers_is_default", "is_default", unique=True, postgresql_where="is_default"),
        Index(
            "ix_customers_name_trgm",
            "name",
            postgresql_using="gin",
            postgresql_ops={"name": "gin_trgm_ops"},
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    document_type: Mapped[str] = mapped_column(String(10))
    # Stored without dots or spaces, in uppercase.
    document_number: Mapped[str] = mapped_column(String(30))
    name: Mapped[str] = mapped_column(String(150))
    phone: Mapped[str | None] = mapped_column(String(30))
    email: Mapped[str | None] = mapped_column(String(255))
    address: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(server_default=text("true"))
    is_default: Mapped[bool] = mapped_column(server_default=text("false"))
