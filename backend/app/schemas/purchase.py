from datetime import datetime
from decimal import Decimal
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.models import PurchaseStatus, UnitOfMeasure
from app.schemas.common import ORMModel, Page, optional_text
from app.schemas.inventory import PositiveQuantity
from app.schemas.product import Money, UserSummary
from app.schemas.supplier import SupplierSummary

MAX_ITEMS = 200

PurchaseTaxRate = Annotated[
    Decimal,
    Field(
        ge=0,
        le=100,
        max_digits=5,
        decimal_places=2,
        examples=["19.00"],
        description="Porcentaje de IVA de la línea; si se omite, se usa el del producto.",
    ),
]


class PurchaseItemInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_id: int = Field(gt=0, examples=[1])
    quantity: PositiveQuantity
    unit_cost: Money = Field(description="Costo unitario sin IVA.", examples=["1800.00"])
    discount: Money = Field(
        default=Decimal(0), description="Descuento de toda la línea, en valor.", examples=["0"]
    )
    tax_rate: PurchaseTaxRate | None = None

    @model_validator(mode="after")
    def _discount_within_line(self) -> Self:
        if self.discount > self.quantity * self.unit_cost:
            raise ValueError("discount: no puede superar cantidad x costo unitario")
        return self


class PurchaseInput(BaseModel):
    """A whole draft: creating or saving it replaces its header and items."""

    model_config = ConfigDict(extra="forbid")

    supplier_id: int = Field(gt=0, examples=[1])
    supplier_invoice_number: Annotated[optional_text(50), Field(examples=["FE-10234"])] = None
    amount_paid: Money = Field(
        default=Decimal(0),
        description="Valor ya pagado al proveedor; el resto queda como saldo pendiente.",
    )
    notes: optional_text(500) = None
    items: list[PurchaseItemInput] = Field(
        default_factory=list,
        max_length=MAX_ITEMS,
        description="Un borrador puede guardarse sin líneas; para confirmarlo necesita al menos "
        "una. Cada producto aparece una sola vez.",
    )

    @model_validator(mode="after")
    def _products_are_unique(self) -> Self:
        product_ids = [item.product_id for item in self.items]
        if len(product_ids) != len(set(product_ids)):
            raise ValueError("items: cada producto puede aparecer una sola vez")
        return self


class PurchaseCancel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=3, max_length=255),
        Field(examples=["Factura registrada con costos errados"]),
    ]


class PurchaseProduct(ORMModel):
    id: int
    sku: str
    barcode: str | None
    name: str
    unit_of_measure: UnitOfMeasure


class PurchaseItemResponse(ORMModel):
    id: int
    product: PurchaseProduct
    quantity: Decimal
    unit_cost: Decimal = Field(description="Costo unitario sin IVA, antes del descuento.")
    discount: Decimal
    tax_rate: Decimal
    tax_amount: Decimal
    subtotal: Decimal = Field(description="Cantidad x costo unitario - descuento, sin IVA.")
    total: Decimal = Field(description="Subtotal + IVA.")
    net_unit_cost: Decimal = Field(
        description="Costo unitario después del descuento: el que entra al inventario."
    )


class PurchaseSummary(ORMModel):
    id: int
    number: str | None = Field(
        examples=["COMPRA-000001"], description="Se asigna al confirmar; nulo en borradores."
    )
    status: PurchaseStatus
    supplier: SupplierSummary
    supplier_invoice_number: str | None
    subtotal: Decimal = Field(description="Valor bruto de las líneas, sin descuentos ni IVA.")
    discount_total: Decimal
    tax_total: Decimal
    total: Decimal
    amount_paid: Decimal
    balance_due: Decimal
    created_by: UserSummary
    created_at: datetime
    confirmed_at: datetime | None
    cancelled_at: datetime | None


class PurchaseResponse(PurchaseSummary):
    notes: str | None
    confirmed_by: UserSummary | None
    cancelled_by: UserSummary | None
    cancellation_reason: str | None
    updated_at: datetime
    items: list[PurchaseItemResponse]


class CostHistorySupplier(ORMModel):
    id: int
    name: str


class CostHistoryEntry(BaseModel):
    purchase_id: int
    purchase_number: str
    supplier: CostHistorySupplier
    confirmed_at: datetime
    quantity: Decimal
    unit_cost: Decimal = Field(description="Costo unitario neto (después del descuento, sin IVA).")
    previous_unit_cost: Decimal | None = Field(
        description="Costo de la compra anterior del producto; nulo en la primera."
    )
    variation_percent: Decimal | None = Field(
        description="Variación frente a la compra anterior, en %; nula sin compra anterior o "
        "si su costo fue 0."
    )


class CostSummary(BaseModel):
    average_cost: Decimal
    last_cost: Decimal
    sale_price: Decimal = Field(description="Precio de venta con IVA incluido.")
    sale_price_before_tax: Decimal
    gross_margin: Decimal = Field(description="Precio sin IVA - costo promedio.")
    gross_margin_percent: Decimal | None = Field(
        description="Margen bruto sobre el precio sin IVA, en %; nulo si el precio es 0."
    )


class CostHistoryPage(Page[CostHistoryEntry]):
    """Purchase costs of a product, newest first, with its current cost and margin."""

    summary: CostSummary
