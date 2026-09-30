from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import DbSession, require_permission
from app.core.permissions import PermissionCode
from app.models import User
from app.schemas.common import PageParams, page_params
from app.schemas.statistics import (
    Granularity,
    RotationOrder,
    RotationPage,
    SalesTrend,
    TopProduct,
    TopProductMetric,
)
from app.services import statistics_service

router = APIRouter(prefix="/statistics", tags=["statistics"])

# Statistics show no more than the reports of their area.
SalesReader = Annotated[User, require_permission(PermissionCode.SALES_READ_ALL)]
InventoryReader = Annotated[User, require_permission(PermissionCode.INVENTORY_READ)]

DateFrom = Annotated[date, Query(description="Primer día (hora local), incluido.")]
DateTo = Annotated[date, Query(description="Último día (hora local), incluido.")]
OptionalId = Annotated[int | None, Query(gt=0)]


@router.get("/sales-trend", response_model=SalesTrend)
def sales_trend(
    actor: SalesReader,
    db: DbSession,
    date_from: DateFrom,
    date_to: DateTo,
    granularity: Granularity = Granularity.DAY,
) -> SalesTrend:
    """Completed sales per day, week (from Monday) or month. The range widens to whole
    periods and periods without sales come in zero. More than
    400 points: 422 `STATISTICS_RANGE_TOO_LARGE`. Margin only with `products.view_costs`."""
    return statistics_service.sales_trend(
        db, actor, granularity=granularity, date_from=date_from, date_to=date_to
    )


@router.get("/top-products", response_model=list[TopProduct])
def top_products(
    actor: SalesReader,
    db: DbSession,
    date_from: DateFrom,
    date_to: DateTo,
    metric: TopProductMetric = TopProductMetric.QUANTITY,
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
    category_id: OptionalId = None,
) -> list[TopProduct]:
    """Best-selling products and services of the period, by units or by value. Margin only
    with `products.view_costs`."""
    return statistics_service.top_products(
        db,
        actor,
        metric=metric,
        limit=limit,
        date_from=date_from,
        date_to=date_to,
        category_id=category_id,
    )


@router.get("/inventory-rotation", response_model=RotationPage)
def inventory_rotation(
    _: InventoryReader,
    db: DbSession,
    params: Annotated[PageParams, Depends(page_params)],
    date_from: DateFrom,
    date_to: DateTo,
    order: RotationOrder = RotationOrder.SLOWEST,
    category_id: OptionalId = None,
) -> RotationPage:
    """Rotation of the active physical products in the period (units sold / average stock
    weighted by time) and the days the final stock lasts. A product that started the period
    without stock is measured from its arrival. `slowest` lists idle stock first."""
    items, total, summary = statistics_service.inventory_rotation(
        db,
        params,
        date_from=date_from,
        date_to=date_to,
        order=order,
        category_id=category_id,
    )
    return RotationPage(
        items=items, total=total, page=params.page, size=params.size, summary=summary
    )
