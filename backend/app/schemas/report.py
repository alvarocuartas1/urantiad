"""Aggregated, read-only reports. Each report is a paginated list of groups (`items`) with
the `summary` of everything the filters select."""

from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, Field

from app.schemas.common import Page


class ReportPage[T, S](Page[T]):
    summary: S


class ReportGroup(BaseModel):
    key: str = Field(
        description="Identificador del grupo: el id (usuario, caja, producto…) o la fecha "
        "local `AAAA-MM-DD` al agrupar por día.",
        examples=["12"],
    )
    label: str = Field(examples=["Agua 600 ml"])
    code: str | None = Field(
        default=None, description="SKU del producto o documento del proveedor, si aplica."
    )


# --- Sales ---------------------------------------------------------------------------


class SalesGroupBy(StrEnum):
    DAY = "day"
    USER = "user"
    CASH_REGISTER = "cash_register"
    PRODUCT = "product"
    CATEGORY = "category"
    PAYMENT_METHOD = "payment_method"


class SalesMetrics(BaseModel):
    """Values of completed sales. Prices include tax: `net_total = total - tax_total`.

    By payment method only `sales_count` and `total` (what was paid with it) apply; the
    rest is null because a payment is not split among products. Costs and margins are
    null without `products.view_costs`."""

    sales_count: int = Field(examples=[35])
    quantity: Decimal | None = Field(description="Unidades vendidas (solo por producto).")
    total: Decimal = Field(examples=["450000.00"])
    discount_total: Decimal | None
    tax_total: Decimal | None = Field(description="IVA incluido en el total.")
    net_total: Decimal | None = Field(description="Total sin IVA.")
    cost_total: Decimal | None = Field(description="Costo de lo vendido (costo del momento).")
    gross_margin: Decimal | None = Field(description="Total sin IVA - costo.")
    margin_percent: Decimal | None = Field(
        description="Margen bruto / total sin IVA x 100.", examples=["32.50"]
    )


class SalesReportRow(SalesMetrics, ReportGroup):
    pass


class SalesReportSummary(SalesMetrics):
    average_ticket: Decimal | None = Field(
        description="Total / número de ventas; nulo si se filtra por producto o categoría."
    )
    cancelled_count: int = Field(description="Ventas del periodo que fueron anuladas.")
    cancelled_total: Decimal


# --- Purchases -----------------------------------------------------------------------


class PurchasesGroupBy(StrEnum):
    SUPPLIER = "supplier"
    PRODUCT = "product"
    CATEGORY = "category"
    DAY = "day"


class PurchasesMetrics(BaseModel):
    """Values of confirmed purchases, by confirmation date."""

    purchases_count: int = Field(examples=[8])
    quantity: Decimal | None = Field(description="Unidades compradas (solo por producto).")
    subtotal: Decimal = Field(description="Valor después de descuentos, sin IVA.")
    discount_total: Decimal
    tax_total: Decimal
    total: Decimal = Field(description="Subtotal + IVA.", examples=["1250000.00"])


class PurchasesReportRow(PurchasesMetrics, ReportGroup):
    pass


class PurchasesReportSummary(PurchasesMetrics):
    cancelled_count: int = Field(description="Compras del periodo que fueron anuladas.")
    cancelled_total: Decimal


# --- Inventory -----------------------------------------------------------------------


class InventoryMetrics(BaseModel):
    """Current state of the active physical products (services have no stock)."""

    products_count: int = Field(examples=[120])
    out_of_stock_count: int
    critical_count: int
    low_count: int
    ok_count: int
    inventory_value: Decimal | None = Field(
        description="Stock (sin negativos) x costo promedio; nulo sin `products.view_costs`.",
        examples=["3500000.00"],
    )


class InventoryReportRow(InventoryMetrics, ReportGroup):
    pass


class InventoryReportSummary(InventoryMetrics):
    pass


# --- Cash ----------------------------------------------------------------------------


class CashGroupBy(StrEnum):
    DAY = "day"
    CASH_REGISTER = "cash_register"
    USER = "user"


class CashMetrics(BaseModel):
    """Cash sessions by opening date. Count figures only come from closed sessions."""

    sessions_count: int = Field(examples=[20])
    open_count: int = Field(description="Aperturas que siguen abiertas.")
    opening_total: Decimal = Field(description="Dinero inicial.")
    income_total: Decimal
    withdrawals_total: Decimal
    cash_sales_total: Decimal = Field(description="Parte en efectivo de las ventas.")
    cash_cancellations_total: Decimal = Field(description="Efectivo devuelto por anulaciones.")
    expected_cash: Decimal = Field(description="Esperado al cerrar (solo cerradas).")
    counted_cash: Decimal = Field(description="Contado al cerrar (solo cerradas).")
    surplus_total: Decimal = Field(description="Suma de los sobrantes.", examples=["3000.00"])
    shortage_total: Decimal = Field(
        description="Suma de los faltantes, en valor positivo.", examples=["5000.00"]
    )
    difference_total: Decimal = Field(
        description="Sobrantes - faltantes (contado - esperado).", examples=["-2000.00"]
    )
    sessions_with_difference: int


class CashReportRow(CashMetrics, ReportGroup):
    pass


class CashReportSummary(CashMetrics):
    pass
