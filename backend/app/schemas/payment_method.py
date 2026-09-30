from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.schemas.common import ORMModel, PartialUpdate

PaymentMethodName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=50),
    Field(examples=["Bre-B"]),
]
SortOrder = Annotated[
    int, Field(ge=0, le=1000, description="Posición en el POS (menor primero).", examples=[8])
]


class PaymentMethodResponse(ORMModel):
    id: int
    code: str = Field(
        description="Identificador interno, generado del nombre al crear.", examples=["cash"]
    )
    name: str = Field(examples=["Efectivo"])
    is_cash: bool = Field(description="Solo el efectivo entra a la caja y admite cambio.")
    is_active: bool
    sort_order: int


class PaymentMethodCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: PaymentMethodName
    sort_order: SortOrder = 0


class PaymentMethodUpdate(PartialUpdate):
    """The cash method cannot be deactivated; `code` and `is_cash` never change."""

    name: PaymentMethodName | None = None
    sort_order: SortOrder | None = None
    is_active: bool | None = None
