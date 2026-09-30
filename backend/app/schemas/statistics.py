"""Statistics: sales over time, best sellers and inventory rotation.

Periods are calendar days of the business's time zone (`date_from` and `date_to` both
included). Only completed sales count; costs and margins are null without
`products.view_costs`."""

from datetime import date
from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, Field

from app.schemas.report import ReportPage


class Granularity(StrEnum):
    DAY = "day"
    WEEK = "week"
    MONTH = "month"


class TrendPoint(BaseModel):
    period_start: date = Field(
        description="Primer día del periodo (el lunes en semanas, el día 1 en meses).",
        examples=["2026-09-07"],
    )
    sales_count: int = Field(examples=[42])
    total: Decimal = Field(examples=["530000.00"])
    net_total: Decimal = Field(description="Total sin IVA.")
    gross_margin: Decimal | None = Field(description="Total sin IVA - costo.")


class SalesTrend(BaseModel):
    """One point per period, including periods without sales (in zero)."""

    granularity: Granularity
    date_from: date = Field(description="Inicio del primer periodo completo.")
    date_to: date = Field(description="Último día del último periodo completo.")
    points: list[TrendPoint]


class TopProductMetric(StrEnum):
    QUANTITY = "quantity"
    TOTAL = "total"


class TopProduct(BaseModel):
    product_id: int
    name: str = Field(examples=["Agua 600 ml"])
    sku: str
    unit_of_measure: str
    quantity: Decimal = Field(description="Unidades vendidas.", examples=["120.00"])
    total: Decimal = Field(description="Valor vendido, con IVA y después de descuentos.")
    gross_margin: Decimal | None = Field(description="Total sin IVA - costo.")


class RotationOrder(StrEnum):
    SLOWEST = "slowest"
    FASTEST = "fastest"


class RotationRow(BaseModel):
    """Inventory rotation of an active physical product in the period.

    `rotation = units_sold / average_stock`. The average stock is weighted by time (each
    stock level counts for as long as it lasted; negative stock counts as zero) over the
    measured span: from the start of the period, or from the product's first movement when
    it started the period without stock, up to the end of the period or now. It is null
    without stock. `days_of_inventory` is how many days the final stock lasts at the daily
    sales of that span; null without sales."""

    product_id: int
    name: str
    sku: str
    category_name: str
    unit_of_measure: str
    units_sold: Decimal = Field(examples=["60.00"])
    stock_start: Decimal
    stock_end: Decimal
    average_stock: Decimal = Field(
        description="Stock promedio ponderado por tiempo.", examples=["20.00"]
    )
    rotation: Decimal | None = Field(description="Veces que rotó el stock.", examples=["3.00"])
    days_of_inventory: Decimal | None = Field(
        description="Días que alcanza el stock final.", examples=["10.00"]
    )
    measured_days: Decimal = Field(
        description="Días medidos: desde el inicio del periodo, o desde la primera entrada "
        "si empezó sin stock, hasta el fin del periodo u hoy.",
        examples=["30.00"],
    )


class RotationSummary(BaseModel):
    products_count: int
    without_sales_count: int = Field(description="Productos sin ventas en el periodo.")
    period_days: int = Field(description="Días del periodo transcurridos hasta hoy.")


RotationPage = ReportPage[RotationRow, RotationSummary]
