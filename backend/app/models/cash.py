from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.product import in_values
from app.models.user import User

if TYPE_CHECKING:
    from app.models.sale import Sale


class CashSessionStatus(StrEnum):
    OPEN = "open"
    CLOSED = "closed"


class CashMovementType(StrEnum):
    INCOME = "income"
    WITHDRAWAL = "withdrawal"
    # Created by sales: the cash part of a sale, and its refund when the sale is cancelled.
    SALE = "sale"
    SALE_CANCELLATION = "sale_cancellation"

    @property
    def is_inbound(self) -> bool:
        return self in INBOUND_CASH_MOVEMENT_TYPES


INBOUND_CASH_MOVEMENT_TYPES = frozenset({CashMovementType.INCOME, CashMovementType.SALE})
# The types a user registers by hand; the rest come from their source documents.
MANUAL_CASH_MOVEMENT_TYPES = frozenset({CashMovementType.INCOME, CashMovementType.WITHDRAWAL})
SALE_CASH_MOVEMENT_TYPES = frozenset({CashMovementType.SALE, CashMovementType.SALE_CANCELLATION})


def _type_in(types: frozenset[CashMovementType]) -> str:
    return f"movement_type IN ({', '.join(repr(t.value) for t in sorted(types))})"


class CashRegister(TimestampMixin, Base):
    """A physical cash drawer. Registers are never deleted: they are deactivated."""

    __tablename__ = "cash_registers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(server_default=text("true"))

    # At most one, guaranteed by `uq_cash_sessions_open_register`.
    open_session: Mapped["CashSession | None"] = relationship(
        primaryjoin="and_(CashSession.cash_register_id == CashRegister.id, "
        f"CashSession.status == '{CashSessionStatus.OPEN.value}')",
        viewonly=True,
        uselist=False,
    )


# Names are unique regardless of case ("Caja 2" and "caja 2" are the same register).
Index("uq_cash_registers_name_lower", func.lower(CashRegister.name), unique=True)


class CashSession(Base):
    """Opening of a register by a user, with the initial cash. Closing arrives with the
    cash count (Stage 9).

    The partial unique indexes enforce that a register and a user have at most one open
    session each, even with concurrent openings.
    """

    __tablename__ = "cash_sessions"
    __table_args__ = (
        CheckConstraint(in_values("status", CashSessionStatus), name="status_valid"),
        CheckConstraint("opening_amount >= 0", name="opening_amount_non_negative"),
        Index(
            "uq_cash_sessions_open_register",
            "cash_register_id",
            unique=True,
            postgresql_where=text("status = 'open'"),
        ),
        Index(
            "uq_cash_sessions_open_user",
            "user_id",
            unique=True,
            postgresql_where=text("status = 'open'"),
        ),
        Index("ix_cash_sessions_cash_register_id_opened_at", "cash_register_id", "opened_at"),
        Index("ix_cash_sessions_user_id_opened_at", "user_id", "opened_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    cash_register_id: Mapped[int] = mapped_column(
        ForeignKey("cash_registers.id", ondelete="RESTRICT")
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    status: Mapped[str] = mapped_column(String(20), server_default=CashSessionStatus.OPEN.value)
    opening_amount: Mapped[Decimal]
    opening_notes: Mapped[str | None] = mapped_column(String(500))
    opened_at: Mapped[datetime] = mapped_column(server_default=func.now(), index=True)

    cash_register: Mapped[CashRegister] = relationship()
    user: Mapped[User] = relationship()


class CashMovement(Base):
    """Immutable cash movement of an open session: manual income or withdrawal, or the cash
    of a sale and its cancellation (linked through `sale_id`). Mistakes are corrected with
    an opposite movement."""

    __tablename__ = "cash_movements"
    __table_args__ = (
        CheckConstraint(in_values("movement_type", CashMovementType), name="movement_type_valid"),
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("btrim(concept) <> ''", name="concept_not_blank"),
        CheckConstraint(
            f"({_type_in(SALE_CASH_MOVEMENT_TYPES)}) = (sale_id IS NOT NULL)",
            name="sale_movement_linked",
        ),
        Index("ix_cash_movements_cash_session_id_created_at", "cash_session_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    cash_session_id: Mapped[int] = mapped_column(
        ForeignKey("cash_sessions.id", ondelete="RESTRICT")
    )
    movement_type: Mapped[str] = mapped_column(String(30))
    amount: Mapped[Decimal]
    concept: Mapped[str] = mapped_column(String(255))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    sale_id: Mapped[int | None] = mapped_column(
        ForeignKey("sales.id", ondelete="RESTRICT"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    user: Mapped[User] = relationship()
    sale: Mapped["Sale | None"] = relationship()
