from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.product import Product, in_values
from app.models.user import User


class MovementType(StrEnum):
    PURCHASE_ENTRY = "purchase_entry"
    SALE = "sale"
    ADJUSTMENT_IN = "adjustment_in"
    ADJUSTMENT_OUT = "adjustment_out"
    PURCHASE_RETURN = "purchase_return"
    SALE_RETURN = "sale_return"
    SALE_CANCELLATION = "sale_cancellation"

    @property
    def is_inbound(self) -> bool:
        return self in INBOUND_MOVEMENT_TYPES


INBOUND_MOVEMENT_TYPES = frozenset(
    {
        MovementType.PURCHASE_ENTRY,
        MovementType.ADJUSTMENT_IN,
        MovementType.SALE_RETURN,
        MovementType.SALE_CANCELLATION,
    }
)
ADJUSTMENT_TYPES = frozenset({MovementType.ADJUSTMENT_IN, MovementType.ADJUSTMENT_OUT})


def _type_in(types: frozenset[MovementType]) -> str:
    return f"movement_type IN ({', '.join(repr(t.value) for t in sorted(types))})"


class InventoryMovement(Base):
    """Immutable stock change of a physical product: the only way `current_stock` changes.

    `quantity` is always positive; the movement type gives the direction. Source documents
    (purchases, sales) are linked in their own stages through nullable foreign keys.
    """

    __tablename__ = "inventory_movements"
    __table_args__ = (
        CheckConstraint(in_values("movement_type", MovementType), name="movement_type_valid"),
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("unit_cost >= 0", name="unit_cost_non_negative"),
        CheckConstraint("average_cost_after >= 0", name="average_cost_after_non_negative"),
        CheckConstraint(
            f"({_type_in(INBOUND_MOVEMENT_TYPES)} AND stock_after = stock_before + quantity) "
            f"OR (NOT {_type_in(INBOUND_MOVEMENT_TYPES)} "
            "AND stock_after = stock_before - quantity)",
            name="stock_after_consistent",
        ),
        CheckConstraint(
            f"NOT {_type_in(ADJUSTMENT_TYPES)} OR (reason IS NOT NULL AND btrim(reason) <> '')",
            name="adjustment_reason_required",
        ),
        Index("ix_inventory_movements_product_id_created_at", "product_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"))
    movement_type: Mapped[str] = mapped_column(String(30), index=True)
    quantity: Mapped[Decimal]
    stock_before: Mapped[Decimal]
    stock_after: Mapped[Decimal]
    # Cost per unit moved: the entry cost, or the average cost for outgoing movements.
    unit_cost: Mapped[Decimal]
    average_cost_after: Mapped[Decimal]
    reason: Mapped[str | None] = mapped_column(String(255))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), index=True)

    product: Mapped[Product] = relationship()
    user: Mapped[User] = relationship()
