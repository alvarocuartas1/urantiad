from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Annotated, ClassVar, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.models import CashMovementType, CashSession, CashSessionStatus
from app.schemas.common import ORMModel, PartialUpdate, optional_text
from app.schemas.product import Money, UserSummary

CashRegisterName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=100),
    Field(examples=["Caja Fotocopias"]),
]
CashRegisterDescription = Annotated[
    optional_text(255), Field(examples=["Caja junto a la fotocopiadora."])
]
PositiveMoney = Annotated[
    Decimal, Field(gt=0, max_digits=14, decimal_places=2, examples=["50000.00"])
]
OpeningNotes = Annotated[optional_text(500), Field(examples=["Base en billetes de 10.000."])]
ClosingNotes = Annotated[optional_text(500), Field(examples=["Faltante por cambio mal dado."])]


# --- Registers -----------------------------------------------------------------------


class CashRegisterCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: CashRegisterName
    description: CashRegisterDescription = None


class CashRegisterUpdate(PartialUpdate):
    nullable_fields: ClassVar[frozenset[str]] = frozenset({"description"})

    name: CashRegisterName | None = None
    description: CashRegisterDescription = None
    is_active: bool | None = None


class CashRegisterSummary(ORMModel):
    id: int
    name: str = Field(examples=["Caja Principal"])


class OpenSessionReference(ORMModel):
    id: int
    user: UserSummary
    opened_at: datetime


class CashRegisterResponse(CashRegisterSummary):
    description: str | None
    is_active: bool
    open_session: OpenSessionReference | None = Field(
        description="Apertura activa de la caja (quién la tiene abierta), si existe."
    )
    created_at: datetime
    updated_at: datetime


# --- Sessions ------------------------------------------------------------------------


class CashSessionOpen(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cash_register_id: int = Field(gt=0, examples=[1])
    opening_amount: Money = Field(description="Dinero inicial en efectivo (base).")
    opening_notes: OpeningNotes = None


class CashSummary(BaseModel):
    """Cash that should be in the drawer."""

    opening_amount: Decimal
    total_income: Decimal
    total_withdrawals: Decimal
    total_cash_sales: Decimal = Field(description="Parte en efectivo de las ventas.")
    total_cash_cancellations: Decimal = Field(description="Efectivo devuelto por ventas anuladas.")
    expected_cash: Decimal = Field(
        description="Dinero inicial + ingresos + ventas en efectivo - retiros - anulaciones en "
        "efectivo.",
        examples=["150000.00"],
    )


class CashSessionClose(BaseModel):
    model_config = ConfigDict(extra="forbid")

    counted_cash: Money = Field(description="Efectivo contado en la caja.")
    expected_cash: Money = Field(
        description="Efectivo esperado que vio quien cuenta. Si cambió mientras tanto (p. ej. "
        "por una anulación), se rechaza con 409 `CASH_EXPECTED_CHANGED` para revisar de nuevo."
    )
    closing_notes: ClosingNotes = Field(
        default=None, description="Obligatorias si hay diferencia (sobrante o faltante)."
    )


class CashSessionClosing(ORMModel):
    closed_at: datetime
    closed_by: UserSummary
    expected_cash: Decimal = Field(description="Efectivo esperado al cerrar.")
    counted_cash: Decimal
    difference: Decimal = Field(
        description="Contado - esperado: positiva = sobrante, negativa = faltante.",
        examples=["-2000.00"],
    )
    closing_notes: str | None


class CashSessionResponse(ORMModel):
    id: int
    cash_register: CashRegisterSummary
    user: UserSummary
    status: CashSessionStatus
    opening_amount: Decimal
    opening_notes: str | None
    opened_at: datetime
    summary: CashSummary
    closing: CashSessionClosing | None = Field(description="Arqueo y cierre, si está cerrada.")

    @classmethod
    def build(cls, session: CashSession, summary: CashSummary) -> Self:
        closed = session.status == CashSessionStatus.CLOSED
        return cls(
            id=session.id,
            cash_register=CashRegisterSummary.model_validate(session.cash_register),
            user=UserSummary.model_validate(session.user),
            status=CashSessionStatus(session.status),
            opening_amount=session.opening_amount,
            opening_notes=session.opening_notes,
            opened_at=session.opened_at,
            summary=summary,
            closing=CashSessionClosing.model_validate(session) if closed else None,
        )


# --- Movements -----------------------------------------------------------------------


class ManualCashMovementType(StrEnum):
    """Types a user registers by hand (sales register their own)."""

    INCOME = CashMovementType.INCOME.value
    WITHDRAWAL = CashMovementType.WITHDRAWAL.value


class CashMovementCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    movement_type: ManualCashMovementType = Field(
        description="`income` suma efectivo; `withdrawal` lo retira (sin superar el esperado)."
    )
    amount: PositiveMoney
    concept: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=3, max_length=255),
        Field(examples=["Pago de domicilio"]),
    ]


class CashMovementSale(ORMModel):
    id: int
    number: str = Field(examples=["VENTA-000001"])


class CashMovementResponse(ORMModel):
    id: int
    cash_session_id: int
    movement_type: CashMovementType
    amount: Decimal
    concept: str
    sale: CashMovementSale | None = Field(description="Venta que originó el movimiento.")
    user: UserSummary
    created_at: datetime


class CashMovementResult(BaseModel):
    movement: CashMovementResponse
    session: CashSessionResponse = Field(description="Apertura con el resumen ya actualizado.")
