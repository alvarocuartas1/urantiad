"""Home dashboard: a snapshot of today's business.

Each section follows the permission of its area, so the dashboard never shows more than
the listings the user can already open. Sections without permission are left out (None).
"""

from datetime import date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import ColumnElement, distinct, func, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.core.permissions import PermissionCode
from app.models import (
    CashRegister,
    CashSession,
    PaymentMethod,
    Product,
    ProductType,
    Purchase,
    PurchaseStatus,
    Sale,
    SalePayment,
    SaleStatus,
    StockStatus,
    User,
)
from app.schemas.dashboard import (
    DashboardCashRegister,
    DashboardOpenSession,
    DashboardResponse,
    PaymentMethodTotal,
    SalesScope,
    SalesToday,
    StockAlerts,
)
from app.schemas.inventory import ReplenishmentItem
from app.schemas.product import UserSummary
from app.schemas.purchase import PurchaseSummary
from app.schemas.sale import SaleSummary
from app.services import cash_service, inventory_service, sale_service

RECENT_LIMIT = 5
ZERO = Decimal("0.00")
CENT = Decimal("0.01")


def business_day(now: datetime | None = None) -> tuple[date, datetime, datetime]:
    """Today in the business's time zone and its bounds `[start, end)`."""
    zone = ZoneInfo(get_settings().business_timezone)
    today = (now or datetime.now(zone)).astimezone(zone).date()
    start = datetime.combine(today, time.min, tzinfo=zone)
    end = datetime.combine(today + timedelta(days=1), time.min, tzinfo=zone)
    return today, start, end


def _sales_scope(actor: User) -> tuple[SalesScope, list[ColumnElement[bool]]]:
    if sale_service.can_read_all(actor):
        return SalesScope.ALL, []
    return SalesScope.OWN, [Sale.user_id == actor.id]


def _sales_today(db: Session, actor: User, now: datetime | None) -> SalesToday:
    today, start, end = business_day(now)
    scope, conditions = _sales_scope(actor)
    in_day = [Sale.created_at >= start, Sale.created_at < end, *conditions]
    completed = Sale.status == SaleStatus.COMPLETED
    cancelled = Sale.status == SaleStatus.CANCELLED

    count, total, cancelled_count, cancelled_total = db.execute(
        select(
            func.count().filter(completed),
            func.sum(Sale.total).filter(completed),
            func.count().filter(cancelled),
            func.sum(Sale.total).filter(cancelled),
        )
        .select_from(Sale)
        .where(*in_day)
    ).one()
    total = total or ZERO

    method_total = func.sum(SalePayment.amount)
    payments = db.execute(
        select(
            PaymentMethod.id,
            PaymentMethod.name,
            func.count(distinct(SalePayment.sale_id)),
            method_total,
        )
        .select_from(SalePayment)
        .join(SalePayment.sale)
        .join(SalePayment.payment_method)
        .where(completed, *in_day)
        .group_by(PaymentMethod.id, PaymentMethod.name)
        .order_by(method_total.desc(), PaymentMethod.name)
    ).all()

    return SalesToday(
        scope=scope,
        business_date=today,
        sales_count=count,
        total=total,
        average_ticket=(total / count).quantize(CENT, rounding=ROUND_HALF_UP) if count else None,
        cancelled_count=cancelled_count,
        cancelled_total=cancelled_total or ZERO,
        by_payment_method=[
            PaymentMethodTotal(id=id_, name=name, sales_count=sales, total=amount)
            for id_, name, sales, amount in payments
        ],
    )


def _recent_sales(db: Session, actor: User) -> list[SaleSummary]:
    _, conditions = _sales_scope(actor)
    stmt = sale_service.newest_first(select(Sale).where(*conditions)).limit(RECENT_LIMIT)
    return [SaleSummary.model_validate(sale) for sale in db.scalars(stmt)]


def _cash_registers(db: Session, actor: User) -> list[DashboardCashRegister]:
    registers = db.scalars(
        select(CashRegister)
        .where(CashRegister.is_active.is_(True))
        .options(selectinload(CashRegister.open_session).selectinload(CashSession.user))
        .order_by(CashRegister.name, CashRegister.id)
    ).all()
    sessions = [r.open_session for r in registers if r.open_session is not None]
    supervise = PermissionCode.CASH_SUPERVISE in actor.permission_codes
    expected = cash_service.summaries(db, sessions) if supervise else {}

    def open_session(session: CashSession | None) -> DashboardOpenSession | None:
        if session is None:
            return None
        summary = expected.get(session.id)
        return DashboardOpenSession(
            id=session.id,
            user=UserSummary.model_validate(session.user),
            opened_at=session.opened_at,
            expected_cash=summary.expected_cash if summary else None,
        )

    return [
        DashboardCashRegister(id=r.id, name=r.name, open_session=open_session(r.open_session))
        for r in registers
    ]


def _stock(db: Session) -> StockAlerts:
    def count_of(status: StockStatus) -> ColumnElement[int]:
        return func.count().filter(Product.stock_status == status)

    out_of_stock, critical, low = db.execute(
        select(
            count_of(StockStatus.OUT_OF_STOCK),
            count_of(StockStatus.CRITICAL),
            count_of(StockStatus.LOW),
        )
        .select_from(Product)
        .where(Product.type == ProductType.PRODUCT, Product.is_active.is_(True))
    ).one()
    urgent = db.scalars(inventory_service.replenishment_query().limit(RECENT_LIMIT))
    return StockAlerts(
        out_of_stock_count=out_of_stock,
        critical_count=critical,
        low_count=low,
        most_urgent=[ReplenishmentItem.model_validate(product) for product in urgent],
    )


def _recent_purchases(db: Session) -> list[PurchaseSummary]:
    purchases = db.scalars(
        select(Purchase)
        .where(Purchase.status != PurchaseStatus.DRAFT)
        .options(selectinload(Purchase.supplier), selectinload(Purchase.created_by))
        .order_by(Purchase.confirmed_at.desc(), Purchase.id.desc())
        .limit(RECENT_LIMIT)
    )
    return [PurchaseSummary.model_validate(purchase) for purchase in purchases]


def dashboard(db: Session, actor: User, *, now: datetime | None = None) -> DashboardResponse:
    """The sections `actor` may see; `now` fixes the current time (tests)."""
    permissions = actor.permission_codes
    can_read_sales = PermissionCode.SALES_READ in permissions
    return DashboardResponse(
        sales_today=_sales_today(db, actor, now) if can_read_sales else None,
        recent_sales=_recent_sales(db, actor) if can_read_sales else None,
        cash_registers=(
            _cash_registers(db, actor)
            if PermissionCode.CASH_REGISTERS_READ in permissions
            else None
        ),
        stock=_stock(db) if PermissionCode.INVENTORY_READ in permissions else None,
        recent_purchases=(
            _recent_purchases(db) if PermissionCode.PURCHASES_READ in permissions else None
        ),
    )
