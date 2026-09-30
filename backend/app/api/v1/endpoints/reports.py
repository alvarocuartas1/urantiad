from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import AwareDatetime

from app.api.deps import DbSession, require_permission
from app.core.permissions import PermissionCode
from app.models import User
from app.schemas.common import PageParams, page_params
from app.schemas.report import (
    CashGroupBy,
    CashReportRow,
    CashReportSummary,
    InventoryReportRow,
    InventoryReportSummary,
    PurchasesGroupBy,
    PurchasesReportRow,
    PurchasesReportSummary,
    ReportPage,
    SalesGroupBy,
    SalesReportRow,
    SalesReportSummary,
)
from app.services import report_service

router = APIRouter(prefix="/reports", tags=["reports"])

# A report shows no more than the listings its permission already opens.
SalesReportReader = Annotated[User, require_permission(PermissionCode.SALES_READ_ALL)]
PurchasesReportReader = Annotated[User, require_permission(PermissionCode.PURCHASES_READ)]
InventoryReportReader = Annotated[User, require_permission(PermissionCode.INVENTORY_READ)]
CashReportReader = Annotated[User, require_permission(PermissionCode.CASH_SUPERVISE)]

Pagination = Annotated[PageParams, Depends(page_params)]
DateFrom = Annotated[AwareDatetime | None, Query(description="Desde (incluido), con zona horaria.")]
DateTo = Annotated[AwareDatetime | None, Query(description="Hasta (excluido), con zona horaria.")]
OptionalId = Annotated[int | None, Query(gt=0)]


@router.get("/sales", response_model=ReportPage[SalesReportRow, SalesReportSummary])
def sales_report(
    actor: SalesReportReader,
    db: DbSession,
    params: Pagination,
    group_by: SalesGroupBy = SalesGroupBy.DAY,
    date_from: DateFrom = None,
    date_to: DateTo = None,
    user_id: OptionalId = None,
    cash_register_id: OptionalId = None,
    category_id: OptionalId = None,
    product_id: OptionalId = None,
) -> ReportPage[SalesReportRow, SalesReportSummary]:
    """Ventas completadas agrupadas por día (hora local), cajero, caja, producto, categoría
    o método de pago, con el resumen del periodo. Las ventas anuladas no suman: se cuentan
    aparte en el resumen. Por método de pago no se admite filtrar por producto ni
    categoría (422 `REPORT_FILTER_NOT_SUPPORTED`). Costos y márgenes solo con
    `products.view_costs`."""
    items, total, summary = report_service.sales_report(
        db,
        actor,
        params,
        group_by=group_by,
        filters=report_service.SalesFilters(
            date_from=date_from,
            date_to=date_to,
            user_id=user_id,
            cash_register_id=cash_register_id,
            category_id=category_id,
            product_id=product_id,
        ),
    )
    return ReportPage(items=items, total=total, page=params.page, size=params.size, summary=summary)


@router.get("/purchases", response_model=ReportPage[PurchasesReportRow, PurchasesReportSummary])
def purchases_report(
    _: PurchasesReportReader,
    db: DbSession,
    params: Pagination,
    group_by: PurchasesGroupBy = PurchasesGroupBy.SUPPLIER,
    date_from: DateFrom = None,
    date_to: DateTo = None,
    supplier_id: OptionalId = None,
    category_id: OptionalId = None,
    product_id: OptionalId = None,
) -> ReportPage[PurchasesReportRow, PurchasesReportSummary]:
    """Compras confirmadas agrupadas por proveedor, producto, categoría o día, según la
    fecha de confirmación. Los borradores no cuentan y las anuladas se cuentan aparte."""
    items, total, summary = report_service.purchases_report(
        db,
        params,
        group_by=group_by,
        filters=report_service.PurchasesFilters(
            date_from=date_from,
            date_to=date_to,
            supplier_id=supplier_id,
            category_id=category_id,
            product_id=product_id,
        ),
    )
    return ReportPage(items=items, total=total, page=params.page, size=params.size, summary=summary)


@router.get("/inventory", response_model=ReportPage[InventoryReportRow, InventoryReportSummary])
def inventory_report(
    actor: InventoryReportReader,
    db: DbSession,
    params: Pagination,
    category_id: OptionalId = None,
) -> ReportPage[InventoryReportRow, InventoryReportSummary]:
    """Estado actual del inventario por categoría: productos físicos activos por nivel de
    stock y valor del inventario al costo promedio (solo con `products.view_costs`)."""
    items, total, summary = report_service.inventory_report(
        db, actor, params, category_id=category_id
    )
    return ReportPage(items=items, total=total, page=params.page, size=params.size, summary=summary)


@router.get("/cash", response_model=ReportPage[CashReportRow, CashReportSummary])
def cash_report(
    _: CashReportReader,
    db: DbSession,
    params: Pagination,
    group_by: CashGroupBy = CashGroupBy.DAY,
    date_from: DateFrom = None,
    date_to: DateTo = None,
    cash_register_id: OptionalId = None,
    user_id: OptionalId = None,
) -> ReportPage[CashReportRow, CashReportSummary]:
    """Aperturas de caja agrupadas por día de apertura (hora local), caja o cajero:
    dinero inicial, movimientos, arqueos, sobrantes y faltantes. Esperado, contado y
    diferencias salen solo de las aperturas cerradas."""
    items, total, summary = report_service.cash_report(
        db,
        params,
        group_by=group_by,
        filters=report_service.CashFilters(
            date_from=date_from,
            date_to=date_to,
            cash_register_id=cash_register_id,
            user_id=user_id,
        ),
    )
    return ReportPage(items=items, total=total, page=params.page, size=params.size, summary=summary)
