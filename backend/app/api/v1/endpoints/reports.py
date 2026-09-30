from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
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
from app.services import report_export, report_service
from app.services.report_service import CashFilters, PurchasesFilters, SalesFilters

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

# Filters shared by each report and its export, so both accept exactly the same parameters.


def sales_filters(
    date_from: DateFrom = None,
    date_to: DateTo = None,
    user_id: OptionalId = None,
    cash_register_id: OptionalId = None,
    category_id: OptionalId = None,
    product_id: OptionalId = None,
) -> SalesFilters:
    return SalesFilters(
        date_from=date_from,
        date_to=date_to,
        user_id=user_id,
        cash_register_id=cash_register_id,
        category_id=category_id,
        product_id=product_id,
    )


def purchases_filters(
    date_from: DateFrom = None,
    date_to: DateTo = None,
    supplier_id: OptionalId = None,
    category_id: OptionalId = None,
    product_id: OptionalId = None,
) -> PurchasesFilters:
    return PurchasesFilters(
        date_from=date_from,
        date_to=date_to,
        supplier_id=supplier_id,
        category_id=category_id,
        product_id=product_id,
    )


def cash_filters(
    date_from: DateFrom = None,
    date_to: DateTo = None,
    cash_register_id: OptionalId = None,
    user_id: OptionalId = None,
) -> CashFilters:
    return CashFilters(
        date_from=date_from,
        date_to=date_to,
        cash_register_id=cash_register_id,
        user_id=user_id,
    )


SalesFilterParams = Annotated[SalesFilters, Depends(sales_filters)]
PurchasesFilterParams = Annotated[PurchasesFilters, Depends(purchases_filters)]
CashFilterParams = Annotated[CashFilters, Depends(cash_filters)]

EXPORT_DESCRIPTION = (
    " Descarga CSV para Excel (UTF-8 con BOM, separador `;`, coma decimal) con todas las "
    'filas y una fila final "Total"; más de '
    f"{report_export.EXPORT_LIMIT} filas: 422 `REPORT_TOO_LARGE`."
)
CSV_RESPONSE = {200: {"content": {"text/csv": {}}, "description": "Archivo CSV."}}


def _download(file: report_export.CsvFile) -> Response:
    return Response(
        content=file.content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{file.filename}"'},
    )


# --- Sales ---------------------------------------------------------------------------

SALES_DESCRIPTION = (
    "Ventas completadas agrupadas por día (hora local), cajero, caja, producto, categoría "
    "o método de pago, con el resumen del periodo. Las ventas anuladas no suman: se cuentan "
    "aparte en el resumen. Por método de pago no se admite filtrar por producto ni "
    "categoría (422 `REPORT_FILTER_NOT_SUPPORTED`). Costos y márgenes solo con "
    "`products.view_costs`."
)


@router.get(
    "/sales",
    response_model=ReportPage[SalesReportRow, SalesReportSummary],
    description=SALES_DESCRIPTION,
)
def sales_report(
    actor: SalesReportReader,
    db: DbSession,
    params: Pagination,
    filters: SalesFilterParams,
    group_by: SalesGroupBy = SalesGroupBy.DAY,
) -> ReportPage[SalesReportRow, SalesReportSummary]:
    items, total, summary = report_service.sales_report(
        db, actor, params, group_by=group_by, filters=filters
    )
    return ReportPage(items=items, total=total, page=params.page, size=params.size, summary=summary)


@router.get(
    "/sales/export",
    response_class=Response,
    responses=CSV_RESPONSE,
    description=SALES_DESCRIPTION + EXPORT_DESCRIPTION,
)
def export_sales_report(
    actor: SalesReportReader,
    db: DbSession,
    filters: SalesFilterParams,
    group_by: SalesGroupBy = SalesGroupBy.DAY,
) -> Response:
    return _download(report_export.export_sales(db, actor, group_by=group_by, filters=filters))


# --- Purchases -----------------------------------------------------------------------

PURCHASES_DESCRIPTION = (
    "Compras confirmadas agrupadas por proveedor, producto, categoría o día, según la "
    "fecha de confirmación. Los borradores no cuentan y las anuladas se cuentan aparte."
)


@router.get(
    "/purchases",
    response_model=ReportPage[PurchasesReportRow, PurchasesReportSummary],
    description=PURCHASES_DESCRIPTION,
)
def purchases_report(
    _: PurchasesReportReader,
    db: DbSession,
    params: Pagination,
    filters: PurchasesFilterParams,
    group_by: PurchasesGroupBy = PurchasesGroupBy.SUPPLIER,
) -> ReportPage[PurchasesReportRow, PurchasesReportSummary]:
    items, total, summary = report_service.purchases_report(
        db, params, group_by=group_by, filters=filters
    )
    return ReportPage(items=items, total=total, page=params.page, size=params.size, summary=summary)


@router.get(
    "/purchases/export",
    response_class=Response,
    responses=CSV_RESPONSE,
    description=PURCHASES_DESCRIPTION + EXPORT_DESCRIPTION,
)
def export_purchases_report(
    _: PurchasesReportReader,
    db: DbSession,
    filters: PurchasesFilterParams,
    group_by: PurchasesGroupBy = PurchasesGroupBy.SUPPLIER,
) -> Response:
    return _download(report_export.export_purchases(db, group_by=group_by, filters=filters))


# --- Inventory -----------------------------------------------------------------------

INVENTORY_DESCRIPTION = (
    "Estado actual del inventario por categoría: productos físicos activos por nivel de "
    "stock y valor del inventario al costo promedio (solo con `products.view_costs`)."
)


@router.get(
    "/inventory",
    response_model=ReportPage[InventoryReportRow, InventoryReportSummary],
    description=INVENTORY_DESCRIPTION,
)
def inventory_report(
    actor: InventoryReportReader,
    db: DbSession,
    params: Pagination,
    category_id: OptionalId = None,
) -> ReportPage[InventoryReportRow, InventoryReportSummary]:
    items, total, summary = report_service.inventory_report(
        db, actor, params, category_id=category_id
    )
    return ReportPage(items=items, total=total, page=params.page, size=params.size, summary=summary)


@router.get(
    "/inventory/export",
    response_class=Response,
    responses=CSV_RESPONSE,
    description=INVENTORY_DESCRIPTION + EXPORT_DESCRIPTION,
)
def export_inventory_report(
    actor: InventoryReportReader, db: DbSession, category_id: OptionalId = None
) -> Response:
    return _download(report_export.export_inventory(db, actor, category_id=category_id))


# --- Cash ----------------------------------------------------------------------------

CASH_DESCRIPTION = (
    "Aperturas de caja agrupadas por día de apertura (hora local), caja o cajero: dinero "
    "inicial, movimientos, arqueos, sobrantes y faltantes. Esperado, contado y diferencias "
    "salen solo de las aperturas cerradas."
)


@router.get(
    "/cash",
    response_model=ReportPage[CashReportRow, CashReportSummary],
    description=CASH_DESCRIPTION,
)
def cash_report(
    _: CashReportReader,
    db: DbSession,
    params: Pagination,
    filters: CashFilterParams,
    group_by: CashGroupBy = CashGroupBy.DAY,
) -> ReportPage[CashReportRow, CashReportSummary]:
    items, total, summary = report_service.cash_report(
        db, params, group_by=group_by, filters=filters
    )
    return ReportPage(items=items, total=total, page=params.page, size=params.size, summary=summary)


@router.get(
    "/cash/export",
    response_class=Response,
    responses=CSV_RESPONSE,
    description=CASH_DESCRIPTION + EXPORT_DESCRIPTION,
)
def export_cash_report(
    _: CashReportReader,
    db: DbSession,
    filters: CashFilterParams,
    group_by: CashGroupBy = CashGroupBy.DAY,
) -> Response:
    return _download(report_export.export_cash(db, group_by=group_by, filters=filters))
