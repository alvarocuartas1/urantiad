"""CSV export of the reports, for Excel in Spanish: UTF-8 with BOM, `;` as separator and
decimal comma. Each file has the columns shown on screen, every group of the report (not
one page) and a final "Total" row with the summary."""

import csv
import io
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.permissions import PermissionCode
from app.models import User
from app.schemas.common import PageParams
from app.schemas.report import CashGroupBy, PurchasesGroupBy, SalesGroupBy
from app.services import report_service
from app.services.report_service import CashFilters, PurchasesFilters, SalesFilters

# More groups than this means the filters are too broad for a spreadsheet.
EXPORT_LIMIT = 10_000


@dataclass(frozen=True)
class CsvFile:
    filename: str
    content: bytes


@dataclass(frozen=True)
class _Column:
    header: str
    value: Callable[[Any], Any]


def _cell(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, Decimal):
        return f"{value:.2f}".replace(".", ",")
    return str(value)


def _field(name: str) -> Callable[[Any], Any]:
    return lambda values: getattr(values, name)


def _metric(header: str, name: str) -> _Column:
    return _Column(header, _field(name))


def _group_columns(header: str, code_header: str | None) -> list[_Column]:
    """The group (its label, or the date by day) and, when it has one, its code. The total
    row has no group: it shows "Total" there."""
    columns = [_Column(header, lambda row: getattr(row, "label", "Total"))]
    if code_header is not None:
        columns.append(_Column(code_header, lambda row: getattr(row, "code", None)))
    return columns


def _csv(columns: Sequence[_Column], rows: Sequence[Any], summary: Any) -> bytes:
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";", lineterminator="\r\n")
    writer.writerow([column.header for column in columns])
    for values in (*rows, summary):
        writer.writerow([_cell(column.value(values)) for column in columns])
    # The BOM makes Excel read the file as UTF-8 (accents, "ñ").
    return ("﻿" + buffer.getvalue()).encode("utf-8")


def _all_rows[R, S](
    report: Callable[[PageParams], tuple[list[R], int, S]],
) -> tuple[list[R], S]:
    rows, total, summary = report(PageParams(page=1, size=EXPORT_LIMIT))
    if total > EXPORT_LIMIT:
        raise AppError(
            f"El reporte tiene {total} filas y el máximo para exportar es {EXPORT_LIMIT}. "
            "Acote el periodo o los filtros.",
            code="REPORT_TOO_LARGE",
            status_code=422,
        )
    return rows, summary


def _local_date(value: datetime) -> date:
    return value.astimezone(ZoneInfo(get_settings().business_timezone)).date()


def _filename(name: str, date_from: datetime | None, date_to: datetime | None) -> str:
    """E.g. `ventas-por-dia_2026-09-01_2026-09-30.csv` (`date_to` is exclusive)."""
    parts = [name]
    if date_from is not None:
        parts.append(_local_date(date_from).isoformat())
    if date_to is not None:
        parts.append((_local_date(date_to - timedelta(microseconds=1))).isoformat())
    return "_".join(parts) + ".csv"


# --- Sales ---------------------------------------------------------------------------

_SALES_GROUPS = {
    SalesGroupBy.DAY: ("Día", "dia"),
    SalesGroupBy.USER: ("Cajero", "cajero"),
    SalesGroupBy.CASH_REGISTER: ("Caja", "caja"),
    SalesGroupBy.PRODUCT: ("Producto", "producto"),
    SalesGroupBy.CATEGORY: ("Categoría", "categoria"),
    SalesGroupBy.PAYMENT_METHOD: ("Método de pago", "metodo-de-pago"),
}


def _sales_columns(group_by: SalesGroupBy, with_costs: bool) -> list[_Column]:
    header = _SALES_GROUPS[group_by][0]
    by_product = group_by == SalesGroupBy.PRODUCT
    columns = [
        *_group_columns(header, "SKU" if by_product else None),
        _metric("Ventas", "sales_count"),
    ]
    # A payment is not split among products: by method only the paid amount applies.
    if group_by == SalesGroupBy.PAYMENT_METHOD:
        return [*columns, _metric("Total", "total")]
    if by_product:
        columns.append(_metric("Cantidad", "quantity"))
    columns += [
        _metric("Descuentos", "discount_total"),
        _metric("IVA", "tax_total"),
        _metric("Sin IVA", "net_total"),
        _metric("Total", "total"),
    ]
    if with_costs:
        columns += [
            _metric("Costo", "cost_total"),
            _metric("Margen bruto", "gross_margin"),
            _metric("Margen %", "margin_percent"),
        ]
    return columns


def export_sales(
    db: Session, actor: User, *, group_by: SalesGroupBy, filters: SalesFilters
) -> CsvFile:
    rows, summary = _all_rows(
        lambda params: report_service.sales_report(
            db, actor, params, group_by=group_by, filters=filters
        )
    )
    with_costs = PermissionCode.PRODUCTS_VIEW_COSTS in actor.permission_codes
    return CsvFile(
        filename=_filename(
            f"ventas-por-{_SALES_GROUPS[group_by][1]}", filters.date_from, filters.date_to
        ),
        content=_csv(_sales_columns(group_by, with_costs), rows, summary),
    )


# --- Purchases -----------------------------------------------------------------------

_PURCHASES_GROUPS = {
    PurchasesGroupBy.SUPPLIER: ("Proveedor", "proveedor", "Documento"),
    PurchasesGroupBy.PRODUCT: ("Producto", "producto", "SKU"),
    PurchasesGroupBy.CATEGORY: ("Categoría", "categoria", None),
    PurchasesGroupBy.DAY: ("Día", "dia", None),
}


def export_purchases(
    db: Session, *, group_by: PurchasesGroupBy, filters: PurchasesFilters
) -> CsvFile:
    rows, summary = _all_rows(
        lambda params: report_service.purchases_report(
            db, params, group_by=group_by, filters=filters
        )
    )
    header, slug, code_header = _PURCHASES_GROUPS[group_by]
    columns = [*_group_columns(header, code_header), _metric("Compras", "purchases_count")]
    if group_by == PurchasesGroupBy.PRODUCT:
        columns.append(_metric("Cantidad", "quantity"))
    columns += [
        _metric("Descuentos", "discount_total"),
        _metric("Subtotal sin IVA", "subtotal"),
        _metric("IVA", "tax_total"),
        _metric("Total", "total"),
    ]
    return CsvFile(
        filename=_filename(f"compras-por-{slug}", filters.date_from, filters.date_to),
        content=_csv(columns, rows, summary),
    )


# --- Inventory -----------------------------------------------------------------------


def export_inventory(db: Session, actor: User, *, category_id: int | None = None) -> CsvFile:
    rows, summary = _all_rows(
        lambda params: report_service.inventory_report(db, actor, params, category_id=category_id)
    )
    columns = [
        *_group_columns("Categoría", None),
        _metric("Productos", "products_count"),
        _metric("Agotado", "out_of_stock_count"),
        _metric("Stock crítico", "critical_count"),
        _metric("Comprar pronto", "low_count"),
        _metric("Stock suficiente", "ok_count"),
    ]
    if PermissionCode.PRODUCTS_VIEW_COSTS in actor.permission_codes:
        columns.append(_metric("Valor al costo", "inventory_value"))
    # A snapshot: the file is named after the day it was taken.
    today = _local_date(datetime.now().astimezone())
    return CsvFile(
        filename=f"inventario-por-categoria_{today.isoformat()}.csv",
        content=_csv(columns, rows, summary),
    )


# --- Cash ----------------------------------------------------------------------------

_CASH_GROUPS = {
    CashGroupBy.DAY: ("Día", "dia"),
    CashGroupBy.CASH_REGISTER: ("Caja", "caja"),
    CashGroupBy.USER: ("Cajero", "cajero"),
}


def export_cash(db: Session, *, group_by: CashGroupBy, filters: CashFilters) -> CsvFile:
    rows, summary = _all_rows(
        lambda params: report_service.cash_report(db, params, group_by=group_by, filters=filters)
    )
    header, slug = _CASH_GROUPS[group_by]
    columns = [
        *_group_columns(header, None),
        _metric("Aperturas", "sessions_count"),
        _metric("Abiertas", "open_count"),
        _metric("Inicial", "opening_total"),
        _metric("Ventas en efectivo", "cash_sales_total"),
        _metric("Ingresos", "income_total"),
        _metric("Retiros", "withdrawals_total"),
        _metric("Anulaciones", "cash_cancellations_total"),
        _metric("Esperado", "expected_cash"),
        _metric("Contado", "counted_cash"),
        _metric("Sobrantes", "surplus_total"),
        _metric("Faltantes", "shortage_total"),
        _metric("Con diferencia", "sessions_with_difference"),
        _metric("Diferencia neta", "difference_total"),
    ]
    return CsvFile(
        filename=_filename(f"caja-por-{slug}", filters.date_from, filters.date_to),
        content=_csv(columns, rows, summary),
    )
