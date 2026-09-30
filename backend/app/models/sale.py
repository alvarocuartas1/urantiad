from datetime import datetime
from decimal import Decimal
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
from app.models.cash import CashRegister, CashSession
from app.models.customer import Customer
from app.models.product import Product, in_values
from app.models.user import User


class SaleStatus(StrEnum):
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class PaymentMethod(Base):
    """How a sale is paid (cash, Nequi, card...). Rows are seeded by the migration and can be
    deactivated or added without code changes; only the cash method moves the drawer."""

    __tablename__ = "payment_methods"
    __table_args__ = (
        # Exactly one method is the drawer's cash: its payments create cash movements.
        Index("uq_payment_methods_is_cash", "is_cash", unique=True, postgresql_where="is_cash"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)
    is_cash: Mapped[bool] = mapped_column(server_default=text("false"))
    is_active: Mapped[bool] = mapped_column(server_default=text("true"))
    sort_order: Mapped[int] = mapped_column(server_default=text("0"))


class Sale(TimestampMixin, Base):
    """A confirmed sale: it is numbered, moved inventory and cash when it was created.

    Prices include tax, so `total = subtotal - discount_total` and `tax_total` is the tax
    included in it. Sales are never deleted: they are cancelled with reverse movements.
    """

    __tablename__ = "sales"
    __table_args__ = (
        CheckConstraint(in_values("status", SaleStatus), name="status_valid"),
        CheckConstraint(
            "status <> 'cancelled' OR (cancelled_at IS NOT NULL AND cancelled_by_id IS NOT NULL "
            "AND cancellation_reason IS NOT NULL AND btrim(cancellation_reason) <> '')",
            name="cancellation_recorded",
        ),
        CheckConstraint(
            "subtotal >= 0 AND lines_discount >= 0 AND sale_discount >= 0 "
            "AND discount_total <= subtotal AND tax_total >= 0 AND tax_total <= total",
            name="amounts_valid",
        ),
        CheckConstraint(
            "discount_total = lines_discount + sale_discount", name="discount_total_consistent"
        ),
        CheckConstraint("total = subtotal - discount_total", name="total_consistent"),
        Index("ix_sales_user_id_created_at", "user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # Taken from `document_sequences` in the sale's transaction (VENTA-000001).
    number: Mapped[str] = mapped_column(String(20), unique=True)
    status: Mapped[str] = mapped_column(
        String(20), server_default=SaleStatus.COMPLETED.value, index=True
    )
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="RESTRICT"), index=True
    )
    # Session (register and cashier) where the sale was made and its cash entered.
    cash_session_id: Mapped[int] = mapped_column(
        ForeignKey("cash_sessions.id", ondelete="RESTRICT"), index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    # Gross value of the lines (quantity x price, tax included), before any discount.
    subtotal: Mapped[Decimal]
    lines_discount: Mapped[Decimal] = mapped_column(server_default=text("0"))
    # Discount of the whole sale, split among the lines (`SaleItem.sale_discount_share`).
    sale_discount: Mapped[Decimal] = mapped_column(server_default=text("0"))
    discount_total: Mapped[Decimal] = mapped_column(server_default=text("0"))
    tax_total: Mapped[Decimal] = mapped_column(server_default=text("0"))
    total: Mapped[Decimal]
    notes: Mapped[str | None] = mapped_column(String(500))
    cancelled_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    cancelled_at: Mapped[datetime | None]
    cancellation_reason: Mapped[str | None] = mapped_column(String(255))

    customer: Mapped[Customer] = relationship()
    cash_session: Mapped[CashSession] = relationship()
    user: Mapped[User] = relationship(foreign_keys=[user_id])
    cancelled_by: Mapped[User | None] = relationship(foreign_keys=[cancelled_by_id])
    items: Mapped[list["SaleItem"]] = relationship(
        back_populates="sale", cascade="all, delete-orphan", order_by="SaleItem.id"
    )
    payments: Mapped[list["SalePayment"]] = relationship(
        back_populates="sale", cascade="all, delete-orphan", order_by="SalePayment.id"
    )

    @property
    def cash_register(self) -> CashRegister:
        return self.cash_session.cash_register

    @property
    def change_amount(self) -> Decimal:
        """Change given back to the customer."""
        return sum((payment.change_amount for payment in self.payments), Decimal("0.00"))


Index("ix_sales_created_at", Sale.created_at)


class SaleItem(Base):
    """A line of a sale, with the price and average cost of that moment (historic margins)."""

    __tablename__ = "sale_items"
    __table_args__ = (
        UniqueConstraint("sale_id", "product_id"),
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("unit_price >= 0", name="unit_price_non_negative"),
        CheckConstraint("unit_cost >= 0", name="unit_cost_non_negative"),
        CheckConstraint(
            "discount >= 0 AND sale_discount_share >= 0", name="discounts_non_negative"
        ),
        CheckConstraint("tax_rate >= 0 AND tax_rate <= 100", name="tax_rate_range"),
        # ROUND on numeric rounds half away from zero, like ROUND_HALF_UP in the service.
        CheckConstraint(
            "total = round(quantity * unit_price, 2) - discount - sale_discount_share "
            "AND total >= 0",
            name="total_consistent",
        ),
        CheckConstraint("tax_amount >= 0 AND tax_amount <= total", name="tax_amount_range"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id", ondelete="CASCADE"))
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="RESTRICT"), index=True
    )
    quantity: Mapped[Decimal]
    # Sale price with tax at the moment of the sale.
    unit_price: Mapped[Decimal]
    # Average cost before tax at the moment of the sale (reference cost for services).
    unit_cost: Mapped[Decimal]
    # Discount of the whole line, as a value.
    discount: Mapped[Decimal] = mapped_column(server_default=text("0"))
    sale_discount_share: Mapped[Decimal] = mapped_column(server_default=text("0"))
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), server_default=text("0"))
    # Tax included in `total`.
    tax_amount: Mapped[Decimal] = mapped_column(server_default=text("0"))
    total: Mapped[Decimal]

    sale: Mapped[Sale] = relationship(back_populates="items")
    product: Mapped[Product] = relationship()


class SalePayment(Base):
    """A payment of a sale; a sale may be paid with several methods (mixed payment).

    `amount` is what the payment covers of the total. For cash, `amount_tendered` is what
    the customer handed over and `change_amount` what was given back.
    """

    __tablename__ = "sale_payments"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint(
            "amount_tendered IS NULL OR amount_tendered >= amount", name="tendered_covers_amount"
        ),
        CheckConstraint(
            "change_amount = COALESCE(amount_tendered, amount) - amount",
            name="change_amount_consistent",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id", ondelete="CASCADE"), index=True)
    payment_method_id: Mapped[int] = mapped_column(
        ForeignKey("payment_methods.id", ondelete="RESTRICT"), index=True
    )
    amount: Mapped[Decimal]
    amount_tendered: Mapped[Decimal | None]
    change_amount: Mapped[Decimal] = mapped_column(server_default=text("0"))
    # Transfer or voucher number, when the cashier records it.
    reference: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    sale: Mapped[Sale] = relationship(back_populates="payments")
    payment_method: Mapped[PaymentMethod] = relationship()
