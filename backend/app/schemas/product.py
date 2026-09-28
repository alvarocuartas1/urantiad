from datetime import datetime
from decimal import Decimal
from typing import Annotated, ClassVar

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, StringConstraints

from app.models import ProductType, StockStatus, UnitOfMeasure
from app.schemas.category import CategorySummary
from app.schemas.common import ORMModel, PartialUpdate, optional_text


def _normalize_sku(value: object) -> object:
    return value.strip().upper() if isinstance(value, str) else value


Sku = Annotated[
    str,
    BeforeValidator(_normalize_sku),
    StringConstraints(min_length=1, max_length=50, pattern=r"^[A-Z0-9][A-Z0-9._-]*$"),
    Field(
        examples=["BEB-001"],
        description="Letras, números, punto, guion o guion bajo. Se guarda en mayúsculas.",
    ),
]
Barcode = Annotated[
    optional_text(50, pattern=r"^[0-9A-Za-z-]+$"), Field(examples=["7702004003508"])
]
ProductName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=150),
    Field(examples=["Gaseosa cola 400 ml"]),
]
ProductDescription = optional_text(500)
Money = Annotated[Decimal, Field(ge=0, max_digits=14, decimal_places=2, examples=["2500.00"])]
Quantity = Annotated[Decimal, Field(ge=0, max_digits=14, decimal_places=2, examples=["10.00"])]
TaxRate = Annotated[
    Decimal,
    Field(
        ge=0,
        le=100,
        max_digits=5,
        decimal_places=2,
        examples=["19.00"],
        description="Porcentaje de IVA incluido en el precio de venta.",
    ),
]


class ProductCreate(BaseModel):
    """Stock and cost of physical products change only through inventory movements."""

    model_config = ConfigDict(extra="forbid")

    type: ProductType = ProductType.PRODUCT
    sku: Sku
    barcode: Barcode = None
    name: ProductName
    description: ProductDescription = None
    category_id: int = Field(gt=0, examples=[1])
    unit_of_measure: UnitOfMeasure = UnitOfMeasure.UNIT
    tax_rate: TaxRate = Decimal(0)
    sale_price: Money = Field(description="Precio al público, con IVA incluido.")
    min_stock: Quantity = Decimal(0)
    reorder_point: Quantity = Decimal(0)
    target_stock: Quantity = Decimal(0)
    cost: Money | None = Field(
        default=None, description="Solo servicios: costo de referencia para calcular márgenes."
    )


class ProductUpdate(PartialUpdate):
    """The type, stock and cost of a physical product cannot be edited."""

    nullable_fields: ClassVar[frozenset[str]] = frozenset({"barcode", "description"})

    sku: Sku | None = None
    barcode: Barcode = None
    name: ProductName | None = None
    description: ProductDescription = None
    category_id: int | None = Field(default=None, gt=0)
    unit_of_measure: UnitOfMeasure | None = None
    tax_rate: TaxRate | None = None
    sale_price: Money | None = None
    min_stock: Quantity | None = None
    reorder_point: Quantity | None = None
    target_stock: Quantity | None = None
    cost: Money | None = None
    is_active: bool | None = None


class ProductResponse(ORMModel):
    id: int
    type: ProductType
    sku: str
    barcode: str | None
    name: str
    description: str | None
    category: CategorySummary
    unit_of_measure: UnitOfMeasure
    tax_rate: Decimal
    sale_price: Decimal
    average_cost: Decimal
    last_cost: Decimal
    current_stock: Decimal
    min_stock: Decimal
    reorder_point: Decimal
    target_stock: Decimal
    stock_status: StockStatus | None = Field(
        description="Nivel de alerta de inventario; nulo para servicios."
    )
    is_active: bool
    created_at: datetime
    updated_at: datetime


class UserSummary(ORMModel):
    id: int
    full_name: str


class PriceHistoryResponse(ORMModel):
    id: int
    old_price: Decimal | None = Field(description="Nulo en el precio inicial del producto.")
    new_price: Decimal
    changed_by: UserSummary
    changed_at: datetime
