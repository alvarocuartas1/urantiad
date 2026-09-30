from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, Field

from app.schemas.inventory import ReplenishmentItem
from app.schemas.product import UserSummary
from app.schemas.purchase import PurchaseSummary
from app.schemas.sale import SaleSummary


class SalesScope(StrEnum):
    ALL = "all"
    OWN = "own"


class PaymentMethodTotal(BaseModel):
    id: int
    name: str = Field(examples=["Efectivo"])
    sales_count: int = Field(description="Ventas con al menos un pago en este método.")
    total: Decimal = Field(examples=["150000.00"])


class SalesToday(BaseModel):
    scope: SalesScope = Field(
        description="`all`: todas las ventas (`sales.read_all`); `own`: solo las del usuario."
    )
    business_date: date = Field(description="Día en curso en la zona horaria del negocio.")
    sales_count: int = Field(description="Ventas completadas del día.")
    total: Decimal = Field(examples=["350000.00"])
    average_ticket: Decimal | None = Field(description="Nulo si no hay ventas.")
    cancelled_count: int = Field(description="Ventas del día que fueron anuladas.")
    cancelled_total: Decimal
    by_payment_method: list[PaymentMethodTotal] = Field(
        description="Pagos de las ventas completadas del día, de mayor a menor total."
    )


class DashboardOpenSession(BaseModel):
    id: int
    user: UserSummary
    opened_at: datetime
    expected_cash: Decimal | None = Field(description="Solo con `cash.supervise`.")


class DashboardCashRegister(BaseModel):
    id: int
    name: str = Field(examples=["Caja Principal"])
    open_session: DashboardOpenSession | None = Field(description="Nula si la caja está cerrada.")


class StockAlerts(BaseModel):
    out_of_stock_count: int
    critical_count: int
    low_count: int
    most_urgent: list[ReplenishmentItem] = Field(
        description="Productos por reponer más urgentes (agotados primero)."
    )


class DashboardResponse(BaseModel):
    """Each section is null when the user lacks the permission of its area."""

    sales_today: SalesToday | None = Field(description="Requiere `sales.read`.")
    recent_sales: list[SaleSummary] | None = Field(description="Requiere `sales.read`.")
    cash_registers: list[DashboardCashRegister] | None = Field(
        description="Cajas activas. Requiere `cash_registers.read`."
    )
    stock: StockAlerts | None = Field(description="Requiere `inventory.read`.")
    recent_purchases: list[PurchaseSummary] | None = Field(
        description="Compras confirmadas o anuladas más recientes. Requiere `purchases.read`."
    )
