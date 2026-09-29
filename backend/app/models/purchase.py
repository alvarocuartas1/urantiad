from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from enum import StrEnum

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.product import Product, in_values
from app.models.supplier import Supplier
from app.models.user import User

CENT = Decimal("0.01")


class PurchaseStatus(StrEnum):
    DRAFT = "draft"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"


class Purchase(TimestampMixin, Base):
    """Purchase from a supplier. Drafts are editable and have no number yet; a confirmed
    purchase has moved inventory and can only be cancelled (with reverse movements).

    Amounts are before tax except `tax_total` and the totals that include it. They are
    computed by the service from the items; the checks keep them consistent.
    """

    __tablename__ = "purchases"
    __table_args__ = (
        CheckConstraint(in_values("status", PurchaseStatus), name="status_valid"),
        CheckConstraint("(status = 'draft') = (number IS NULL)", name="number_after_draft"),
        CheckConstraint(
            "status = 'draft' OR (confirmed_at IS NOT NULL AND confirmed_by_id IS NOT NULL)",
            name="confirmation_recorded",
        ),
        CheckConstraint(
            "status <> 'cancelled' OR (cancelled_at IS NOT NULL AND cancelled_by_id IS NOT NULL "
            "AND cancellation_reason IS NOT NULL AND btrim(cancellation_reason) <> '')",
            name="cancellation_recorded",
        ),
        CheckConstraint(
            "subtotal >= 0 AND discount_total >= 0 AND discount_total <= subtotal "
            "AND tax_total >= 0",
            name="amounts_non_negative",
        ),
        CheckConstraint("total = subtotal - discount_total + tax_total", name="total_consistent"),
        CheckConstraint("amount_paid >= 0 AND amount_paid <= total", name="amount_paid_range"),
        CheckConstraint("balance_due = total - amount_paid", name="balance_due_consistent"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # Assigned on confirmation from `document_sequences` (COMPRA-000001).
    number: Mapped[str | None] = mapped_column(String(20), unique=True)
    status: Mapped[str] = mapped_column(
        String(20), server_default=PurchaseStatus.DRAFT.value, index=True
    )
    supplier_id: Mapped[int] = mapped_column(
        ForeignKey("suppliers.id", ondelete="RESTRICT"), index=True
    )
    supplier_invoice_number: Mapped[str | None] = mapped_column(String(50))
    # Gross value of the items (quantity x unit cost), before discounts and tax.
    subtotal: Mapped[Decimal] = mapped_column(server_default=text("0"))
    discount_total: Mapped[Decimal] = mapped_column(server_default=text("0"))
    tax_total: Mapped[Decimal] = mapped_column(server_default=text("0"))
    total: Mapped[Decimal] = mapped_column(server_default=text("0"))
    # Accounts payable: payments to suppliers are a future stage.
    amount_paid: Mapped[Decimal] = mapped_column(server_default=text("0"))
    balance_due: Mapped[Decimal] = mapped_column(server_default=text("0"))
    notes: Mapped[str | None] = mapped_column(String(500))
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    confirmed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    confirmed_at: Mapped[datetime | None] = mapped_column(index=True)
    cancelled_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    cancelled_at: Mapped[datetime | None]
    cancellation_reason: Mapped[str | None] = mapped_column(String(255))

    supplier: Mapped[Supplier] = relationship()
    created_by: Mapped[User] = relationship(foreign_keys=[created_by_id])
    confirmed_by: Mapped[User | None] = relationship(foreign_keys=[confirmed_by_id])
    cancelled_by: Mapped[User | None] = relationship(foreign_keys=[cancelled_by_id])
    items: Mapped[list["PurchaseItem"]] = relationship(
        back_populates="purchase", cascade="all, delete-orphan", order_by="PurchaseItem.id"
    )


# The same supplier invoice cannot be registered twice (it would duplicate inventory),
# unless the earlier purchase was cancelled.
Index(
    "uq_purchases_supplier_invoice",
    Purchase.supplier_id,
    func.upper(Purchase.supplier_invoice_number),
    unique=True,
    postgresql_where=Purchase.status != PurchaseStatus.CANCELLED.value,
)


class PurchaseItem(Base):
    """A product line of a purchase. Costs are before tax, like the product's average cost."""

    __tablename__ = "purchase_items"
    __table_args__ = (
        UniqueConstraint("purchase_id", "product_id"),
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("unit_cost >= 0", name="unit_cost_non_negative"),
        CheckConstraint("discount >= 0", name="discount_non_negative"),
        CheckConstraint("tax_rate >= 0 AND tax_rate <= 100", name="tax_rate_range"),
        CheckConstraint("tax_amount >= 0", name="tax_amount_non_negative"),
        # ROUND on numeric rounds half away from zero, like ROUND_HALF_UP in the service.
        CheckConstraint(
            "subtotal = round(quantity * unit_cost, 2) - discount AND subtotal >= 0",
            name="subtotal_consistent",
        ),
        CheckConstraint("total = subtotal + tax_amount", name="total_consistent"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    purchase_id: Mapped[int] = mapped_column(ForeignKey("purchases.id", ondelete="CASCADE"))
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="RESTRICT"), index=True
    )
    quantity: Mapped[Decimal]
    unit_cost: Mapped[Decimal]
    # Discount of the whole line, as a value.
    discount: Mapped[Decimal] = mapped_column(server_default=text("0"))
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), server_default=text("0"))
    tax_amount: Mapped[Decimal] = mapped_column(server_default=text("0"))
    # Line value after discount, before tax.
    subtotal: Mapped[Decimal]
    total: Mapped[Decimal]

    purchase: Mapped[Purchase] = relationship(back_populates="items")
    product: Mapped[Product] = relationship()

    @property
    def net_unit_cost(self) -> Decimal:
        """Cost per unit after the line discount: the cost that enters inventory."""
        return (self.subtotal / self.quantity).quantize(CENT, rounding=ROUND_HALF_UP)
