from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Annotated, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    computed_field,
    model_validator,
)

from app.core.permissions import PermissionCode
from app.models import InventoryMovement, MovementType, StockStatus, UnitOfMeasure, User
from app.schemas.category import CategorySummary
from app.schemas.common import ORMModel
from app.schemas.product import Money, ProductResponse, UserSummary

PositiveQuantity = Annotated[
    Decimal,
    Field(
        gt=0,
        max_digits=14,
        decimal_places=2,
        examples=["12"],
        description="Mayor que 0. Entera para unidades contables (unidad, paquete, caja, página).",
    ),
]


class AdjustmentDirection(StrEnum):
    IN = "in"
    OUT = "out"


class AdjustmentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_id: int = Field(gt=0, examples=[1])
    direction: AdjustmentDirection = Field(description="`in` suma stock, `out` lo descuenta.")
    quantity: PositiveQuantity
    unit_cost: Money | None = Field(
        default=None,
        description=(
            "Solo entradas. Si se envía, recalcula el costo promedio ponderado y el último "
            "costo; si se omite, la entrada se valora al costo promedio actual."
        ),
    )
    reason: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=3, max_length=255),
        Field(examples=["Carga inicial de inventario"]),
    ]

    @model_validator(mode="after")
    def _unit_cost_only_for_entries(self) -> Self:
        if self.direction == AdjustmentDirection.OUT and self.unit_cost is not None:
            raise ValueError("unit_cost: las salidas se valoran al costo promedio actual")
        return self


class ProductStockSummary(ORMModel):
    id: int
    sku: str
    name: str
    unit_of_measure: UnitOfMeasure


class MovementResponse(ORMModel):
    id: int
    product: ProductStockSummary
    movement_type: MovementType
    quantity: Decimal = Field(description="Siempre positiva; el tipo indica si entra o sale.")
    stock_before: Decimal
    stock_after: Decimal
    unit_cost: Decimal | None = Field(description="Nulo sin el permiso products.view_costs.")
    average_cost_after: Decimal | None = Field(
        description="Nulo sin el permiso products.view_costs."
    )
    reason: str | None
    user: UserSummary
    created_at: datetime

    @classmethod
    def for_user(cls, movement: InventoryMovement, user: User) -> Self:
        response = cls.model_validate(movement)
        if PermissionCode.PRODUCTS_VIEW_COSTS not in user.permission_codes:
            response = response.model_copy(update={"unit_cost": None, "average_cost_after": None})
        return response


class AdjustmentResponse(BaseModel):
    movement: MovementResponse
    product: ProductResponse = Field(description="Producto con el stock ya actualizado.")


class ReplenishmentItem(ORMModel):
    id: int
    sku: str
    barcode: str | None
    name: str
    category: CategorySummary
    unit_of_measure: UnitOfMeasure
    current_stock: Decimal
    min_stock: Decimal
    reorder_point: Decimal
    target_stock: Decimal
    stock_status: StockStatus

    @computed_field(description="Cantidad sugerida de compra: stock objetivo - stock actual.")
    @property
    def suggested_quantity(self) -> Decimal:
        return max(Decimal("0.00"), self.target_stock - self.current_stock)
