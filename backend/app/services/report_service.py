"""Aggregated reports of sales, purchases, inventory and cash.

Each report is one grouped query (a page of groups) plus one query for the summary, both
with the same filters: no per-row queries. Days are grouped in the business's local time.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import (
    ColumnElement,
    Date,
    Row,
    Select,
    case,
    cast,
    distinct,
    func,
    null,
    select,
)
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.permissions import PermissionCode
from app.models import (
    CashMovement,
    CashMovementType,
    CashRegister,
    CashSession,
    CashSessionStatus,
    Category,
    PaymentMethod,
    Product,
    ProductType,
    Purchase,
    PurchaseItem,
    PurchaseStatus,
    Sale,
    SaleItem,
    SalePayment,
    SaleStatus,
    StockStatus,
    Supplier,
    User,
)
from app.schemas.common import PageParams
from app.schemas.report import (
    CashGroupBy,
    CashReportRow,
    CashReportSummary,
    InventoryReportRow,
    InventoryReportSummary,
    PurchasesGroupBy,
    PurchasesReportRow,
    PurchasesReportSummary,
    SalesGroupBy,
    SalesMetrics,
    SalesReportRow,
    SalesReportSummary,
)
from app.services.query import filter_date_range, paginate_rows

ZERO = Decimal("0.00")
CENT = Decimal("0.01")


def money(value: Decimal | None) -> Decimal:
    return (value or ZERO).quantize(CENT, rounding=ROUND_HALF_UP)


def local_day(column: ColumnElement[datetime]) -> ColumnElement[date]:
    """Calendar day of `column` in the business's time zone."""
    return cast(func.timezone(get_settings().business_timezone, column), Date)


def can_view_costs(user: User) -> bool:
    return PermissionCode.PRODUCTS_VIEW_COSTS in user.permission_codes


@dataclass(frozen=True)
class _Group:
    key: ColumnElement[Any]
    label: ColumnElement[Any]
    code: ColumnElement[Any] | None = None
    chronological: bool = False

    @property
    def columns(self) -> tuple[ColumnElement[Any], ...]:
        """Selected first in every grouped query: key, label and code."""
        return (self.key, self.label, null() if self.code is None else self.code)

    @property
    def group_by(self) -> tuple[ColumnElement[Any], ...]:
        label = () if self.label is self.key else (self.label,)
        code = () if self.code is None else (self.code,)
        return (self.key, *label, *code)

    def order_by(self, total: ColumnElement[Any]) -> tuple[ColumnElement[Any], ...]:
        """Days in order; any other group from the largest total down."""
        if self.chronological:
            return (self.key,)
        return (total.desc(), self.label, self.key)


def _day_group(column: ColumnElement[datetime]) -> _Group:
    day = local_day(column)
    return _Group(day, day, chronological=True)


def _group_fields(row: Row[Any] | Sequence[Any]) -> dict[str, Any]:
    key, label, code = row[:3]
    if isinstance(key, date):
        return {"key": key.isoformat(), "label": key.isoformat(), "code": None}
    return {"key": str(key), "label": label, "code": code}


def _reject_filter(detail: str) -> AppError:
    return AppError(detail, code="REPORT_FILTER_NOT_SUPPORTED", status_code=422)


# --- Sales ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SalesFilters:
    date_from: datetime | None = None
    date_to: datetime | None = None
    user_id: int | None = None
    cash_register_id: int | None = None
    category_id: int | None = None
    product_id: int | None = None

    @property
    def by_line(self) -> bool:
        """Whether the filters select lines of the sales rather than whole sales."""
        return self.category_id is not None or self.product_id is not None


_SALE_COMPLETED = Sale.status == SaleStatus.COMPLETED
_SALE_CANCELLED = Sale.status == SaleStatus.CANCELLED


def _filter_sales(stmt: Select[Any], filters: SalesFilters) -> Select[Any]:
    """Apply `filters`; `stmt` must join `Sale` and `CashSession` (and `Product` when
    filtering by product or category)."""
    stmt = filter_date_range(stmt, Sale.created_at, filters.date_from, filters.date_to)
    if filters.user_id is not None:
        stmt = stmt.where(Sale.user_id == filters.user_id)
    if filters.cash_register_id is not None:
        stmt = stmt.where(CashSession.cash_register_id == filters.cash_register_id)
    if filters.category_id is not None:
        stmt = stmt.where(Product.category_id == filters.category_id)
    if filters.product_id is not None:
        stmt = stmt.where(SaleItem.product_id == filters.product_id)
    return stmt


def _sale_lines(*columns: Any) -> Select[Any]:
    return (
        select(*columns)
        .select_from(SaleItem)
        .join(SaleItem.sale)
        .join(Sale.cash_session)
        .join(SaleItem.product)
    )


def _sales_group(group_by: SalesGroupBy) -> _Group:
    match group_by:
        case SalesGroupBy.DAY:
            return _day_group(Sale.created_at)
        case SalesGroupBy.USER:
            return _Group(User.id, User.full_name)
        case SalesGroupBy.CASH_REGISTER:
            return _Group(CashRegister.id, CashRegister.name)
        case SalesGroupBy.PRODUCT:
            return _Group(Product.id, Product.name, Product.sku)
        case SalesGroupBy.CATEGORY:
            return _Group(Category.id, Category.name)
        case SalesGroupBy.PAYMENT_METHOD:
            return _Group(PaymentMethod.id, PaymentMethod.name)


def _line_metrics(condition: ColumnElement[bool]) -> tuple[ColumnElement[Any], ...]:
    """Aggregates of the sale lines that meet `condition`, in `_sales_metrics` order."""
    return (
        func.count(distinct(Sale.id)).filter(condition),
        func.sum(SaleItem.quantity).filter(condition),
        func.sum(SaleItem.total).filter(condition),
        func.sum(SaleItem.discount + SaleItem.sale_discount_share).filter(condition),
        func.sum(SaleItem.tax_amount).filter(condition),
        func.sum(SaleItem.quantity * SaleItem.unit_cost).filter(condition),
    )


def _sales_metrics(
    values: Sequence[Any], *, with_quantity: bool, with_costs: bool
) -> dict[str, Any]:
    count, quantity, total, discount, tax, cost = values
    total, tax = money(total), money(tax)
    net = total - tax
    cost = money(cost)
    margin = net - cost
    percent = (margin / net * 100).quantize(CENT, rounding=ROUND_HALF_UP) if net else None
    return {
        "sales_count": count,
        "quantity": money(quantity) if with_quantity else None,
        "total": total,
        "discount_total": money(discount),
        "tax_total": tax,
        "net_total": net,
        "cost_total": cost if with_costs else None,
        "gross_margin": margin if with_costs else None,
        "margin_percent": percent if with_costs else None,
    }


def _payment_rows(
    db: Session, filters: SalesFilters, params: PageParams
) -> tuple[list[SalesReportRow], int]:
    group = _sales_group(SalesGroupBy.PAYMENT_METHOD)
    total = func.sum(SalePayment.amount)
    stmt = _filter_sales(
        select(*group.columns, func.count(distinct(SalePayment.sale_id)), total)
        .select_from(SalePayment)
        .join(SalePayment.sale)
        .join(Sale.cash_session)
        .join(SalePayment.payment_method)
        .where(_SALE_COMPLETED),
        filters,
    )
    stmt = stmt.group_by(*group.group_by).order_by(*group.order_by(total))
    rows, count = paginate_rows(db, stmt, params)
    empty = dict.fromkeys(SalesMetrics.model_fields, None)
    items = [
        SalesReportRow(
            **_group_fields(row), **{**empty, "sales_count": row[3], "total": money(row[4])}
        )
        for row in rows
    ]
    return items, count


def sales_report(
    db: Session,
    actor: User,
    params: PageParams,
    *,
    group_by: SalesGroupBy,
    filters: SalesFilters,
) -> tuple[list[SalesReportRow], int, SalesReportSummary]:
    """Completed sales grouped by `group_by`, with the summary of all the selected ones.

    Built on the sale lines, whose totals add up to the sale total, so every grouping
    adds up to the same summary. Sales cancelled later are left out and counted apart."""
    with_costs = can_view_costs(actor)
    if group_by == SalesGroupBy.PAYMENT_METHOD:
        if filters.by_line:
            raise _reject_filter(
                "El reporte por método de pago no se puede filtrar por producto ni por "
                "categoría: un pago no se reparte entre productos."
            )
        items, count = _payment_rows(db, filters, params)
    else:
        group = _sales_group(group_by)
        metrics = _line_metrics(_SALE_COMPLETED)
        stmt = _filter_sales(
            _sale_lines(*group.columns, *metrics)
            .join(CashSession.cash_register)
            .join(Sale.user)
            .join(Product.category)
            .where(_SALE_COMPLETED),
            filters,
        )
        stmt = stmt.group_by(*group.group_by).order_by(*group.order_by(metrics[2]))
        rows, count = paginate_rows(db, stmt, params)
        with_quantity = group_by == SalesGroupBy.PRODUCT
        items = [
            SalesReportRow(
                **_group_fields(row),
                **_sales_metrics(row[3:], with_quantity=with_quantity, with_costs=with_costs),
            )
            for row in rows
        ]

    summary_row = db.execute(
        _filter_sales(
            _sale_lines(
                *_line_metrics(_SALE_COMPLETED),
                func.count(distinct(Sale.id)).filter(_SALE_CANCELLED),
                func.sum(SaleItem.total).filter(_SALE_CANCELLED),
            ),
            filters,
        )
    ).one()
    metrics_values = _sales_metrics(
        summary_row[:6], with_quantity=filters.product_id is not None, with_costs=with_costs
    )
    sales_count, total = metrics_values["sales_count"], metrics_values["total"]
    summary = SalesReportSummary(
        **metrics_values,
        average_ticket=(
            (total / sales_count).quantize(CENT, rounding=ROUND_HALF_UP)
            if sales_count and not filters.by_line
            else None
        ),
        cancelled_count=summary_row[6],
        cancelled_total=money(summary_row[7]),
    )
    return items, count, summary


# --- Purchases -----------------------------------------------------------------------


@dataclass(frozen=True)
class PurchasesFilters:
    date_from: datetime | None = None
    date_to: datetime | None = None
    supplier_id: int | None = None
    category_id: int | None = None
    product_id: int | None = None


_PURCHASE_CONFIRMED = Purchase.status == PurchaseStatus.CONFIRMED
_PURCHASE_CANCELLED = Purchase.status == PurchaseStatus.CANCELLED


def _purchases_group(group_by: PurchasesGroupBy) -> _Group:
    match group_by:
        case PurchasesGroupBy.SUPPLIER:
            return _Group(Supplier.id, Supplier.name, Supplier.document_number)
        case PurchasesGroupBy.PRODUCT:
            return _Group(Product.id, Product.name, Product.sku)
        case PurchasesGroupBy.CATEGORY:
            return _Group(Category.id, Category.name)
        case PurchasesGroupBy.DAY:
            return _day_group(Purchase.confirmed_at)


def _purchase_lines(filters: PurchasesFilters, *columns: Any) -> Select[Any]:
    """Lines of confirmed or cancelled purchases (drafts never count) matching `filters`,
    by confirmation date."""
    stmt = (
        select(*columns)
        .select_from(PurchaseItem)
        .join(PurchaseItem.purchase)
        .join(PurchaseItem.product)
        .where(Purchase.status != PurchaseStatus.DRAFT)
    )
    stmt = filter_date_range(stmt, Purchase.confirmed_at, filters.date_from, filters.date_to)
    if filters.supplier_id is not None:
        stmt = stmt.where(Purchase.supplier_id == filters.supplier_id)
    if filters.category_id is not None:
        stmt = stmt.where(Product.category_id == filters.category_id)
    if filters.product_id is not None:
        stmt = stmt.where(PurchaseItem.product_id == filters.product_id)
    return stmt


def _purchase_metrics() -> tuple[ColumnElement[Any], ...]:
    confirmed = _PURCHASE_CONFIRMED
    return (
        func.count(distinct(Purchase.id)).filter(confirmed),
        func.sum(PurchaseItem.quantity).filter(confirmed),
        func.sum(PurchaseItem.subtotal).filter(confirmed),
        func.sum(PurchaseItem.discount).filter(confirmed),
        func.sum(PurchaseItem.tax_amount).filter(confirmed),
        func.sum(PurchaseItem.total).filter(confirmed),
    )


def _purchases_values(values: Sequence[Any], *, with_quantity: bool) -> dict[str, Any]:
    count, quantity, subtotal, discount, tax, total = values
    return {
        "purchases_count": count,
        "quantity": money(quantity) if with_quantity else None,
        "subtotal": money(subtotal),
        "discount_total": money(discount),
        "tax_total": money(tax),
        "total": money(total),
    }


def purchases_report(
    db: Session,
    params: PageParams,
    *,
    group_by: PurchasesGroupBy,
    filters: PurchasesFilters,
) -> tuple[list[PurchasesReportRow], int, PurchasesReportSummary]:
    """Confirmed purchases grouped by `group_by`; cancelled ones are counted apart."""
    group = _purchases_group(group_by)
    metrics = _purchase_metrics()
    stmt = (
        _purchase_lines(filters, *group.columns, *metrics)
        .join(Purchase.supplier)
        .join(Product.category)
        .where(_PURCHASE_CONFIRMED)
        .group_by(*group.group_by)
        .order_by(*group.order_by(metrics[5]))
    )
    rows, count = paginate_rows(db, stmt, params)
    with_quantity = group_by == PurchasesGroupBy.PRODUCT
    items = [
        PurchasesReportRow(
            **_group_fields(row), **_purchases_values(row[3:], with_quantity=with_quantity)
        )
        for row in rows
    ]

    summary_row = db.execute(
        _purchase_lines(
            filters,
            *metrics,
            func.count(distinct(Purchase.id)).filter(_PURCHASE_CANCELLED),
            func.sum(PurchaseItem.total).filter(_PURCHASE_CANCELLED),
        )
    ).one()
    summary = PurchasesReportSummary(
        **_purchases_values(summary_row[:6], with_quantity=filters.product_id is not None),
        cancelled_count=summary_row[6],
        cancelled_total=money(summary_row[7]),
    )
    return items, count, summary


# --- Inventory -----------------------------------------------------------------------


def _inventory_metrics() -> tuple[ColumnElement[Any], ...]:
    def count_status(status: StockStatus) -> ColumnElement[int]:
        return func.count().filter(Product.stock_status == status.value)

    return (
        func.count(),
        count_status(StockStatus.OUT_OF_STOCK),
        count_status(StockStatus.CRITICAL),
        count_status(StockStatus.LOW),
        count_status(StockStatus.OK),
        # Negative stock (when allowed) is a shortfall, not negative value.
        func.sum(func.greatest(Product.current_stock, 0) * Product.average_cost),
    )


def _inventory_values(values: Sequence[Any], *, with_costs: bool) -> dict[str, Any]:
    count, out_of_stock, critical, low, ok, value = values
    return {
        "products_count": count,
        "out_of_stock_count": out_of_stock,
        "critical_count": critical,
        "low_count": low,
        "ok_count": ok,
        "inventory_value": money(value) if with_costs else None,
    }


def inventory_report(
    db: Session, actor: User, params: PageParams, *, category_id: int | None = None
) -> tuple[list[InventoryReportRow], int, InventoryReportSummary]:
    """Current stock levels and value of the active physical products, by category."""
    with_costs = can_view_costs(actor)

    def active_products(*columns: Any) -> Select[Any]:
        stmt = select(*columns, *_inventory_metrics()).where(
            Product.type == ProductType.PRODUCT, Product.is_active.is_(True)
        )
        if category_id is not None:
            stmt = stmt.where(Product.category_id == category_id)
        return stmt

    group = _Group(Category.id, Category.name)
    stmt = (
        active_products(*group.columns)
        .join(Product.category)
        .group_by(*group.group_by)
        .order_by(Category.name, Category.id)
    )
    rows, count = paginate_rows(db, stmt, params)
    items = [
        InventoryReportRow(
            **_group_fields(row), **_inventory_values(row[3:], with_costs=with_costs)
        )
        for row in rows
    ]
    summary = InventoryReportSummary(
        **_inventory_values(db.execute(active_products()).one(), with_costs=with_costs)
    )
    return items, count, summary


# --- Cash ----------------------------------------------------------------------------


@dataclass(frozen=True)
class CashFilters:
    date_from: datetime | None = None
    date_to: datetime | None = None
    cash_register_id: int | None = None
    user_id: int | None = None


_MOVEMENT_TOTALS = (
    CashMovementType.INCOME,
    CashMovementType.WITHDRAWAL,
    CashMovementType.SALE,
    CashMovementType.SALE_CANCELLATION,
)


def _cash_group(group_by: CashGroupBy) -> _Group:
    match group_by:
        case CashGroupBy.DAY:
            return _day_group(CashSession.opened_at)
        case CashGroupBy.CASH_REGISTER:
            return _Group(CashRegister.id, CashRegister.name)
        case CashGroupBy.USER:
            return _Group(User.id, User.full_name)


def _cash_sessions(filters: CashFilters, *columns: Any) -> Select[Any]:
    """Sessions matching `filters`, each joined to the totals of its movements by type."""
    movements = (
        select(
            CashMovement.cash_session_id.label("session_id"),
            *(
                func.sum(
                    case((CashMovement.movement_type == movement_type, CashMovement.amount))
                ).label(movement_type.value)
                for movement_type in _MOVEMENT_TOTALS
            ),
        )
        .group_by(CashMovement.cash_session_id)
        .subquery()
    )
    difference = CashSession.difference
    stmt = (
        select(
            *columns,
            func.count(CashSession.id),
            func.count().filter(CashSession.status == CashSessionStatus.OPEN),
            func.sum(CashSession.opening_amount),
            *(func.sum(movements.c[t.value]) for t in _MOVEMENT_TOTALS),
            # Open sessions have no count yet: their NULLs are ignored by SUM.
            func.sum(CashSession.expected_cash),
            func.sum(CashSession.counted_cash),
            func.sum(func.greatest(difference, 0)),
            func.sum(func.greatest(-difference, 0)),
            func.sum(difference),
            func.count().filter(difference != 0),
        )
        .select_from(CashSession)
        .outerjoin(movements, movements.c.session_id == CashSession.id)
    )
    stmt = filter_date_range(stmt, CashSession.opened_at, filters.date_from, filters.date_to)
    if filters.cash_register_id is not None:
        stmt = stmt.where(CashSession.cash_register_id == filters.cash_register_id)
    if filters.user_id is not None:
        stmt = stmt.where(CashSession.user_id == filters.user_id)
    return stmt


# Amounts of `CashMetrics`, in the order `_cash_sessions` selects them.
_CASH_AMOUNTS = (
    "opening_total",
    "income_total",
    "withdrawals_total",
    "cash_sales_total",
    "cash_cancellations_total",
    "expected_cash",
    "counted_cash",
    "surplus_total",
    "shortage_total",
    "difference_total",
)


def _cash_values(values: Sequence[Any]) -> dict[str, Any]:
    count, open_count, *amounts, with_difference = values
    return {
        "sessions_count": count,
        "open_count": open_count,
        **{name: money(amount) for name, amount in zip(_CASH_AMOUNTS, amounts, strict=True)},
        "sessions_with_difference": with_difference,
    }


def cash_report(
    db: Session, params: PageParams, *, group_by: CashGroupBy, filters: CashFilters
) -> tuple[list[CashReportRow], int, CashReportSummary]:
    """Cash sessions by opening date grouped by `group_by`: movements, counts and
    differences (surplus and shortage apart, so they do not cancel each other out)."""
    group = _cash_group(group_by)
    stmt = (
        _cash_sessions(filters, *group.columns)
        .join(CashSession.cash_register)
        .join(CashSession.user)
        .group_by(*group.group_by)
        .order_by(*((group.key,) if group.chronological else (group.label, group.key)))
    )
    rows, count = paginate_rows(db, stmt, params)
    items = [CashReportRow(**_group_fields(row), **_cash_values(row[3:])) for row in rows]
    summary = CashReportSummary(**_cash_values(db.execute(_cash_sessions(filters)).one()))
    return items, count, summary
