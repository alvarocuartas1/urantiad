from datetime import datetime
from decimal import Decimal
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.core.permissions import PermissionCode
from app.models import ProductType, Sale, SaleStatus, UnitOfMeasure, User
from app.schemas.cash import CashRegisterSummary
from app.schemas.common import ORMModel, optional_text
from app.schemas.customer import CustomerSummary
from app.schemas.inventory import PositiveQuantity
from app.schemas.payment_method import PaymentMethodResponse
from app.schemas.product import Money, UserSummary

MAX_ITEMS = 200
MAX_PAYMENTS = 10

PositiveMoney = Annotated[
    Decimal, Field(gt=0, max_digits=14, decimal_places=2, examples=["20000.00"])
]


# --- Payment methods -----------------------------------------------------------------


# --- Input ---------------------------------------------------------------------------


class SaleItemInput(BaseModel):
    """The price and cost come from the catalog, never from the client."""

    model_config = ConfigDict(extra="forbid")

    product_id: int = Field(gt=0, examples=[1])
    quantity: PositiveQuantity
    discount: Money = Field(
        default=Decimal(0),
        description="Descuento de toda la línea, en valor (IVA incluido).",
        examples=["0"],
    )


class SalePaymentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    payment_method_id: int = Field(gt=0, examples=[1])
    amount: PositiveMoney = Field(description="Parte del total que cubre este pago.")
    amount_tendered: PositiveMoney | None = Field(
        default=None,
        description="Solo efectivo: dinero entregado por el cliente (>= amount). El cambio es "
        "la diferencia.",
        examples=["50000.00"],
    )
    reference: Annotated[optional_text(100), Field(examples=["M1234567"])] = None


class SaleCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    customer_id: int | None = Field(
        default=None, gt=0, description='Si se omite, la venta es para "Consumidor final".'
    )
    items: list[SaleItemInput] = Field(
        min_length=1, max_length=MAX_ITEMS, description="Cada producto aparece una sola vez."
    )
    sale_discount: Money = Field(
        default=Decimal(0),
        description="Descuento de toda la venta, en valor; se reparte entre las líneas.",
    )
    payments: list[SalePaymentInput] = Field(
        max_length=MAX_PAYMENTS,
        description="La suma de los pagos debe ser igual al total. Un pago por método.",
    )
    notes: optional_text(500) = None

    @model_validator(mode="after")
    def _unique_products_and_methods(self) -> Self:
        product_ids = [item.product_id for item in self.items]
        if len(product_ids) != len(set(product_ids)):
            raise ValueError("items: cada producto puede aparecer una sola vez")
        method_ids = [payment.payment_method_id for payment in self.payments]
        if len(method_ids) != len(set(method_ids)):
            raise ValueError("payments: cada método de pago puede aparecer una sola vez")
        return self


class SaleCancel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=3, max_length=255),
        Field(examples=["Cobro duplicado"]),
    ]


# --- Responses -----------------------------------------------------------------------


class SaleProduct(ORMModel):
    id: int
    type: ProductType
    sku: str
    barcode: str | None
    name: str
    unit_of_measure: UnitOfMeasure


class SaleItemResponse(ORMModel):
    id: int
    product: SaleProduct
    quantity: Decimal
    unit_price: Decimal = Field(description="Precio unitario con IVA en el momento de la venta.")
    discount: Decimal = Field(description="Descuento de la línea.")
    sale_discount_share: Decimal = Field(description="Parte del descuento de la venta.")
    tax_rate: Decimal
    tax_amount: Decimal = Field(description="IVA incluido en el total de la línea.")
    total: Decimal
    unit_cost: Decimal | None = Field(
        description="Costo promedio en el momento de la venta. Nulo sin products.view_costs."
    )


class SalePaymentResponse(ORMModel):
    id: int
    payment_method: PaymentMethodResponse
    amount: Decimal
    amount_tendered: Decimal | None
    change_amount: Decimal
    reference: str | None


class SaleSummary(ORMModel):
    id: int
    number: str = Field(examples=["VENTA-000001"])
    status: SaleStatus
    customer: CustomerSummary
    user: UserSummary
    cash_session_id: int
    cash_register: CashRegisterSummary
    subtotal: Decimal = Field(description="Valor bruto de las líneas (IVA incluido).")
    lines_discount: Decimal
    sale_discount: Decimal
    discount_total: Decimal
    tax_total: Decimal = Field(description="IVA incluido en el total.")
    total: Decimal
    created_at: datetime
    cancelled_at: datetime | None


class SaleResponse(SaleSummary):
    notes: str | None
    change_amount: Decimal = Field(description="Cambio entregado al cliente.")
    cancelled_by: UserSummary | None
    cancellation_reason: str | None
    items: list[SaleItemResponse]
    payments: list[SalePaymentResponse]

    @classmethod
    def for_user(cls, sale: Sale, user: User) -> Self:
        """Response for `user`: line costs are hidden unless they may view them."""
        response = cls.model_validate(sale)
        if PermissionCode.PRODUCTS_VIEW_COSTS not in user.permission_codes:
            items = [item.model_copy(update={"unit_cost": None}) for item in response.items]
            response = response.model_copy(update={"items": items})
        return response


# --- Cash session summary ------------------------------------------------------------


class PaymentMethodTotal(BaseModel):
    payment_method: PaymentMethodResponse
    payments_count: int
    total: Decimal


class CashSessionSalesSummary(BaseModel):
    """Sales of a cash session. For a closed session, as they were when it was closed: a
    sale cancelled afterwards still counts (its cash was refunded from another session)."""

    sales_count: int
    total_sales: Decimal
    by_method: list[PaymentMethodTotal] = Field(
        description="Pagos por método (solo los usados). Solo el efectivo entra al arqueo."
    )
