"""Statistics: sales over time, best sellers and inventory rotation.

Periods are local calendar days (`date_from` and `date_to` included) turned into UTC
bounds here. Each statistic is a single grouped query; only completed sales count.
"""

from calendar import monthrange
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import Date, DateTime, Select, case, cast, distinct, func, literal, null, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.models import (
    Category,
    InventoryMovement,
    Product,
    ProductType,
    Sale,
    SaleItem,
    SaleStatus,
    User,
)
from app.schemas.common import PageParams
from app.schemas.statistics import (
    Granularity,
    RotationOrder,
    RotationRow,
    RotationSummary,
    SalesTrend,
    TopProduct,
    TopProductMetric,
    TrendPoint,
)
from app.services.dashboard_service import business_day
from app.services.query import paginate_rows
from app.services.report_service import can_view_costs, money

MAX_TREND_POINTS = 400
SECONDS_PER_DAY = 86400

_SALE_COMPLETED = Sale.status == SaleStatus.COMPLETED


def _seconds(interval: Any) -> Any:
    return func.extract("epoch", interval)


def _check_range(date_from: date, date_to: date) -> None:
    if date_from > date_to:
        raise AppError(
            "La fecha inicial no puede ser posterior a la fecha final.",
            code="INVALID_DATE_RANGE",
            status_code=422,
        )


def _bounds(date_from: date, date_to: date) -> tuple[datetime, datetime]:
    """`[start, end)` of the local days `date_from`..`date_to`."""
    zone = ZoneInfo(get_settings().business_timezone)
    start = datetime.combine(date_from, time.min, tzinfo=zone)
    end = datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=zone)
    return start, end


def _completed_lines(date_from: date, date_to: date, *columns: Any) -> Select[Any]:
    start, end = _bounds(date_from, date_to)
    return (
        select(*columns)
        .select_from(SaleItem)
        .join(SaleItem.sale)
        .where(_SALE_COMPLETED, Sale.created_at >= start, Sale.created_at < end)
    )


def _margin(total: Any, tax: Any, cost: Any, *, with_costs: bool) -> Any:
    return money(total) - money(tax) - money(cost) if with_costs else None


# --- Sales trend ---------------------------------------------------------------------


def _period_start(day: date, granularity: Granularity) -> date:
    match granularity:
        case Granularity.DAY:
            return day
        case Granularity.WEEK:
            return day - timedelta(days=day.weekday())
        case Granularity.MONTH:
            return day.replace(day=1)


def _next_period(start: date, granularity: Granularity) -> date:
    match granularity:
        case Granularity.DAY:
            return start + timedelta(days=1)
        case Granularity.WEEK:
            return start + timedelta(weeks=1)
        case Granularity.MONTH:
            return start + timedelta(days=monthrange(start.year, start.month)[1])


def _periods(date_from: date, date_to: date, granularity: Granularity) -> list[date]:
    """Starts of the whole periods that cover `date_from`..`date_to`."""
    starts: list[date] = []
    current = _period_start(date_from, granularity)
    while current <= date_to:
        starts.append(current)
        if len(starts) > MAX_TREND_POINTS:
            raise AppError(
                f"El periodo es demasiado largo: máximo {MAX_TREND_POINTS} puntos. "
                "Use una agrupación mayor (semana o mes).",
                code="STATISTICS_RANGE_TOO_LARGE",
                status_code=422,
            )
        current = _next_period(current, granularity)
    return starts


def sales_trend(
    db: Session, actor: User, *, granularity: Granularity, date_from: date, date_to: date
) -> SalesTrend:
    """Completed sales per day, week (from Monday) or month. The range widens to whole
    periods, and periods without sales are included in zero so a chart has no gaps."""
    _check_range(date_from, date_to)
    starts = _periods(date_from, date_to, granularity)
    first, last = starts[0], _next_period(starts[-1], granularity) - timedelta(days=1)

    local_time = func.timezone(get_settings().business_timezone, Sale.created_at)
    period = cast(func.date_trunc(granularity.value, local_time), Date)
    stmt = _completed_lines(
        first,
        last,
        period,
        func.count(distinct(Sale.id)),
        func.sum(SaleItem.total),
        func.sum(SaleItem.tax_amount),
        func.sum(SaleItem.quantity * SaleItem.unit_cost),
    ).group_by(period)
    by_period = {row[0]: row[1:] for row in db.execute(stmt)}

    with_costs = can_view_costs(actor)
    points = []
    for start in starts:
        count, total, tax, cost = by_period.get(start, (0, None, None, None))
        points.append(
            TrendPoint(
                period_start=start,
                sales_count=count,
                total=money(total),
                net_total=money(total) - money(tax),
                gross_margin=_margin(total, tax, cost, with_costs=with_costs),
            )
        )
    return SalesTrend(granularity=granularity, date_from=first, date_to=last, points=points)


# --- Best sellers --------------------------------------------------------------------


def top_products(
    db: Session,
    actor: User,
    *,
    metric: TopProductMetric,
    limit: int,
    date_from: date,
    date_to: date,
    category_id: int | None = None,
) -> list[TopProduct]:
    """Products (and services) with the most units or value sold in the period."""
    _check_range(date_from, date_to)
    quantity = func.sum(SaleItem.quantity)
    total = func.sum(SaleItem.total)
    ranked = quantity if metric == TopProductMetric.QUANTITY else total
    stmt = (
        _completed_lines(
            date_from,
            date_to,
            Product.id,
            Product.name,
            Product.sku,
            Product.unit_of_measure,
            quantity,
            total,
            func.sum(SaleItem.tax_amount),
            func.sum(SaleItem.quantity * SaleItem.unit_cost),
        )
        .join(SaleItem.product)
        .group_by(Product.id)
        .order_by(ranked.desc(), Product.name, Product.id)
        .limit(limit)
    )
    if category_id is not None:
        stmt = stmt.where(Product.category_id == category_id)

    with_costs = can_view_costs(actor)
    return [
        TopProduct(
            product_id=product_id,
            name=name,
            sku=sku,
            unit_of_measure=unit,
            quantity=money(sold),
            total=money(value),
            gross_margin=_margin(value, tax, cost, with_costs=with_costs),
        )
        for product_id, name, sku, unit, sold, value, tax, cost in db.execute(stmt)
    ]


# --- Inventory rotation --------------------------------------------------------------


def inventory_rotation(
    db: Session,
    params: PageParams,
    *,
    date_from: date,
    date_to: date,
    order: RotationOrder = RotationOrder.SLOWEST,
    category_id: int | None = None,
    now: datetime | None = None,
) -> tuple[list[RotationRow], int, RotationSummary]:
    """Rotation of the active physical products: units sold over the average stock.

    The average stock is weighted by time: each stock level counts for as long as it
    lasted. It is measured from the start of the period or, for a product that started it
    without stock, from its first movement in the period (its arrival), up to the end of
    the period or now. Days of inventory use the daily sales of that same span.

    The stock at a moment is the current stock minus what the movements since then added,
    so it is exact even for products whose stock predates their movements."""
    _check_range(date_from, date_to)
    today, _, _ = business_day(now)
    period_days = (min(date_to, today) - date_from).days + 1
    if period_days < 1:
        raise AppError(
            "El periodo no puede empezar en el futuro.",
            code="INVALID_DATE_RANGE",
            status_code=422,
        )
    start, end = _bounds(date_from, date_to)
    measured_until = min(end, now or datetime.now(UTC))
    window_start = literal(start, DateTime(timezone=True))
    window_end = literal(measured_until, DateTime(timezone=True))

    sold = (
        _completed_lines(
            date_from, date_to, SaleItem.product_id, func.sum(SaleItem.quantity).label("units")
        )
        .group_by(SaleItem.product_id)
        .subquery()
    )
    change = InventoryMovement.stock_after - InventoryMovement.stock_before
    moved = (
        select(
            InventoryMovement.product_id,
            func.sum(change).label("since_start"),
            func.sum(change).filter(InventoryMovement.created_at >= end).label("since_end"),
        )
        .where(InventoryMovement.created_at >= start)
        .group_by(InventoryMovement.product_id)
        .subquery()
    )
    # Each movement in the window leaves `stock_after` until the next one (or the window end).
    segments = (
        select(
            InventoryMovement.product_id,
            InventoryMovement.created_at,
            InventoryMovement.stock_after,
            func.lead(InventoryMovement.created_at)
            .over(
                partition_by=InventoryMovement.product_id,
                order_by=(InventoryMovement.created_at, InventoryMovement.id),
            )
            .label("next_at"),
        )
        .where(InventoryMovement.created_at >= start, InventoryMovement.created_at < measured_until)
        .subquery()
    )
    held = (
        select(
            segments.c.product_id,
            func.min(segments.c.created_at).label("first_at"),
            func.sum(
                func.greatest(segments.c.stock_after, 0)
                * _seconds(func.coalesce(segments.c.next_at, window_end) - segments.c.created_at)
            ).label("stock_seconds"),
        )
        .group_by(segments.c.product_id)
        .subquery()
    )

    units = func.coalesce(sold.c.units, 0)
    stock_start = Product.current_stock - func.coalesce(moved.c.since_start, 0)
    stock_end = Product.current_stock - func.coalesce(moved.c.since_end, 0)
    first_at = func.coalesce(held.c.first_at, window_end)
    measured_from = case((stock_start > 0, window_start), else_=first_at)
    measured_seconds = func.greatest(_seconds(window_end - measured_from), 0)
    stock_seconds = func.greatest(stock_start, 0) * _seconds(
        first_at - window_start
    ) + func.coalesce(held.c.stock_seconds, 0)
    average = case((measured_seconds > 0, stock_seconds / measured_seconds), else_=0)
    rows = (
        select(
            Product.id.label("product_id"),
            Product.name.label("name"),
            Product.sku.label("sku"),
            Category.name.label("category_name"),
            Product.unit_of_measure.label("unit_of_measure"),
            units.label("units_sold"),
            stock_start.label("stock_start"),
            stock_end.label("stock_end"),
            average.label("average_stock"),
            case((average > 0, func.round(units / average, 2)), else_=null()).label("rotation"),
            case(
                (
                    units > 0,
                    func.round(
                        func.greatest(stock_end, 0) * measured_seconds / SECONDS_PER_DAY / units,
                        2,
                    ),
                ),
                else_=null(),
            ).label("days_of_inventory"),
            func.round(measured_seconds / SECONDS_PER_DAY, 2).label("measured_days"),
        )
        .join(Product.category)
        .outerjoin(sold, sold.c.product_id == Product.id)
        .outerjoin(moved, moved.c.product_id == Product.id)
        .outerjoin(held, held.c.product_id == Product.id)
        .where(Product.type == ProductType.PRODUCT, Product.is_active.is_(True))
    )
    if category_id is not None:
        rows = rows.where(Product.category_id == category_id)
    table = rows.subquery()

    if order == RotationOrder.SLOWEST:
        # Idle stock first: the least rotation, and among equals the most stock.
        ordering = (table.c.rotation.asc().nulls_last(), table.c.average_stock.desc())
    else:
        ordering = (table.c.rotation.desc().nulls_last(),)
    stmt = select(table).order_by(*ordering, table.c.name, table.c.product_id)
    page, count = paginate_rows(db, stmt, params)

    items = [
        RotationRow(
            **{
                **row._mapping,
                **{
                    field: money(row._mapping[field])
                    for field in ("units_sold", "stock_start", "stock_end", "average_stock")
                },
            }
        )
        for row in page
    ]
    products_count, without_sales = db.execute(
        select(func.count(), func.count().filter(table.c.units_sold == 0)).select_from(table)
    ).one()
    summary = RotationSummary(
        products_count=products_count,
        without_sales_count=without_sales,
        period_days=period_days,
    )
    return items, count, summary
