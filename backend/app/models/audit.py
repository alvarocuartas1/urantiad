from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.product import in_values
from app.models.user import User


class AuditEntity(StrEnum):
    PRODUCT = "product"
    SUPPLIER = "supplier"
    PURCHASE = "purchase"
    SALE = "sale"
    CASH_SESSION = "cash_session"
    USER = "user"


class AuditAction(StrEnum):
    """Audited operations. The prefix before the dot is the entity type."""

    PRODUCT_CREATE = "product.create"
    PRODUCT_UPDATE = "product.update"
    PRODUCT_STOCK_ADJUSTMENT = "product.stock_adjustment"
    SUPPLIER_CREATE = "supplier.create"
    SUPPLIER_UPDATE = "supplier.update"
    SUPPLIER_PRODUCT_ADD = "supplier.product_add"
    SUPPLIER_PRODUCT_UPDATE = "supplier.product_update"
    SUPPLIER_PRODUCT_REMOVE = "supplier.product_remove"
    PURCHASE_CREATE = "purchase.create"
    PURCHASE_DISCARD = "purchase.discard"
    PURCHASE_CONFIRM = "purchase.confirm"
    PURCHASE_CANCEL = "purchase.cancel"
    SALE_CANCEL = "sale.cancel"
    CASH_SESSION_OPEN = "cash_session.open"
    CASH_SESSION_INCOME = "cash_session.income"
    CASH_SESSION_WITHDRAWAL = "cash_session.withdrawal"
    CASH_SESSION_CLOSE = "cash_session.close"
    USER_CREATE = "user.create"
    USER_UPDATE = "user.update"
    USER_PASSWORD_RESET = "user.password_reset"

    @property
    def entity_type(self) -> AuditEntity:
        return AuditEntity(self.value.split(".", 1)[0])


class AuditLog(Base):
    """Append-only record of who changed what and when, with the values before and after.

    Written by the services in the same transaction as the change, so a rolled back change
    leaves no record. `entity_id` has no foreign key on purpose: the record outlives any
    change to the entity, and `entity_label` keeps how it was named at that moment. A
    database trigger rejects updates and deletes (see the migration).
    """

    __tablename__ = "audit_logs"
    __table_args__ = (
        CheckConstraint(in_values("entity_type", AuditEntity), name="entity_type_valid"),
        CheckConstraint(in_values("action", AuditAction), name="action_valid"),
        CheckConstraint(
            "split_part(action, '.', 1) = entity_type", name="action_matches_entity_type"
        ),
        Index(
            "ix_audit_logs_entity_type_entity_id_created_at",
            "entity_type",
            "entity_id",
            "created_at",
        ),
        Index("ix_audit_logs_user_id_created_at", "user_id", "created_at"),
        Index("ix_audit_logs_action_created_at", "action", "created_at"),
        Index(
            "ix_audit_logs_entity_label_trgm",
            "entity_label",
            postgresql_using="gin",
            postgresql_ops={"entity_label": "gin_trgm_ops"},
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), index=True)
    # NULL only for actions without a signed-in user (the `create-admin` command).
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    action: Mapped[str] = mapped_column(String(50))
    entity_type: Mapped[str] = mapped_column(String(30))
    entity_id: Mapped[int] = mapped_column(BigInteger)
    entity_label: Mapped[str] = mapped_column(String(200))
    # Only the fields that changed (updates) or the relevant data (creations, operations).
    old_values: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    new_values: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    user: Mapped[User | None] = relationship()
