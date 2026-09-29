"""Purchases: editable drafts, confirmation (inventory entries) and cancellation.

Confirming and cancelling run in a single transaction: if any line fails, nothing changes.
Products are locked in id order, so two documents sharing products cannot deadlock.
"""

from collections.abc import Sequence
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import Select, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.errors import AppError, ConflictError, NotFoundError
from app.models import (
    InventoryMovement,
    MovementType,
    Product,
    Purchase,
    PurchaseItem,
    PurchaseStatus,
    Supplier,
    SupplierProduct,
    User,
)
from app.schemas.common import PageParams
from app.schemas.purchase import (
    CostHistoryEntry,
    CostHistorySupplier,
    CostSummary,
    PurchaseCancel,
    PurchaseInput,
    PurchaseItemInput,
)
from app.services import inventory_service, sequence_service
from app.services.product_service import get_product
from app.services.query import contains_pattern, filter_date_range, paginate, violated_constraint
from app.services.supplier_service import purchasable_product

CENT = Decimal("0.01")
HUNDRED = Decimal(100)


def _money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def _commit(db: Session, purchase: Purchase) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if violated_constraint(exc) != "uq_purchases_supplier_invoice":
            raise
        raise ConflictError(
            f"La factura {purchase.supplier_invoice_number} de este proveedor ya está "
            "registrada en otra compra.",
            code="DUPLICATE_SUPPLIER_INVOICE",
        ) from exc


# --- Queries -------------------------------------------------------------------------


def _with_details(stmt: Select[tuple[Purchase]]) -> Select[tuple[Purchase]]:
    return stmt.options(
        selectinload(Purchase.supplier),
        selectinload(Purchase.created_by),
        selectinload(Purchase.confirmed_by),
        selectinload(Purchase.cancelled_by),
        selectinload(Purchase.items).selectinload(PurchaseItem.product),
    )


def get_purchase(db: Session, purchase_id: int, *, for_update: bool = False) -> Purchase:
    stmt = _with_details(select(Purchase)).where(Purchase.id == purchase_id)
    if for_update:
        # Serializes confirmations and cancellations of the same purchase.
        stmt = stmt.with_for_update(of=Purchase).execution_options(populate_existing=True)
    purchase = db.scalar(stmt)
    if purchase is None:
        raise NotFoundError("La compra no existe.", code="PURCHASE_NOT_FOUND")
    return purchase


def list_purchases(
    db: Session,
    params: PageParams,
    *,
    search: str | None = None,
    supplier_id: int | None = None,
    status: PurchaseStatus | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> tuple[Sequence[Purchase], int]:
    """Purchases, newest first. Dates filter the confirmation date (creation for drafts)."""
    purchase_date = func.coalesce(Purchase.confirmed_at, Purchase.created_at)
    stmt = filter_date_range(
        select(Purchase).join(Purchase.supplier), purchase_date, date_from, date_to
    )
    if search and search.strip():
        pattern = contains_pattern(search.strip())
        stmt = stmt.where(
            or_(
                Purchase.number.ilike(pattern),
                Purchase.supplier_invoice_number.ilike(pattern),
                Supplier.name.ilike(pattern),
            )
        )
    if supplier_id is not None:
        stmt = stmt.where(Purchase.supplier_id == supplier_id)
    if status is not None:
        stmt = stmt.where(Purchase.status == status)
    stmt = stmt.options(
        selectinload(Purchase.supplier), selectinload(Purchase.created_by)
    ).order_by(purchase_date.desc(), Purchase.id.desc())
    return paginate(db, stmt, params)


# --- Drafts --------------------------------------------------------------------------


def _active_supplier(db: Session, supplier_id: int) -> Supplier:
    supplier = db.get(Supplier, supplier_id)
    if supplier is None:
        raise AppError(
            "El proveedor seleccionado no existe.", code="SUPPLIER_NOT_FOUND", status_code=422
        )
    if not supplier.is_active:
        raise AppError(
            "El proveedor seleccionado está inactivo.", code="SUPPLIER_INACTIVE", status_code=422
        )
    return supplier


def _require_draft(purchase: Purchase) -> None:
    if purchase.status != PurchaseStatus.DRAFT:
        raise ConflictError(
            "La compra ya fue confirmada o anulada: solo los borradores se pueden modificar.",
            code="PURCHASE_NOT_DRAFT",
        )


def _line_error(index: int, exc: AppError) -> AppError:
    return AppError(f"Línea {index + 1}: {exc.detail}", code=exc.code, status_code=exc.status_code)


def _fill_item(item: PurchaseItem, product: Product, data: PurchaseItemInput) -> None:
    """Copy the line input into `item` and compute its amounts (before tax, then tax)."""
    tax_rate = data.tax_rate if data.tax_rate is not None else product.tax_rate
    subtotal = _money(data.quantity * data.unit_cost) - data.discount
    tax_amount = _money(subtotal * tax_rate / HUNDRED)
    item.product = product
    item.quantity = data.quantity
    item.unit_cost = data.unit_cost
    item.discount = data.discount
    item.tax_rate = tax_rate
    item.tax_amount = tax_amount
    item.subtotal = subtotal
    item.total = subtotal + tax_amount


def _apply_input(db: Session, purchase: Purchase, data: PurchaseInput) -> None:
    purchase.supplier = _active_supplier(db, data.supplier_id)
    purchase.supplier_invoice_number = data.supplier_invoice_number
    purchase.notes = data.notes

    # One query for every product; `purchasable_product` then reads the identity map.
    product_ids = [line.product_id for line in data.items]
    db.scalars(select(Product).where(Product.id.in_(product_ids))).all()
    # Existing lines are updated in place: replacing them would insert a product's new line
    # before deleting the old one and break the (purchase, product) unique constraint.
    existing = {item.product_id: item for item in purchase.items}
    items = []
    for index, line in enumerate(data.items):
        try:
            product = purchasable_product(db, line.product_id)
            inventory_service.validate_quantity(product, line.quantity)
        except AppError as exc:
            raise _line_error(index, exc) from exc
        item = existing.get(line.product_id) or PurchaseItem()
        _fill_item(item, product, line)
        items.append(item)
    purchase.items = items

    gross = sum((item.subtotal + item.discount for item in items), Decimal(0))
    purchase.subtotal = gross
    purchase.discount_total = sum((item.discount for item in items), Decimal(0))
    purchase.tax_total = sum((item.tax_amount for item in items), Decimal(0))
    purchase.total = gross - purchase.discount_total + purchase.tax_total
    if data.amount_paid > purchase.total:
        raise AppError(
            "El valor pagado no puede superar el total de la compra.",
            code="AMOUNT_PAID_EXCEEDS_TOTAL",
            status_code=422,
        )
    purchase.amount_paid = data.amount_paid
    purchase.balance_due = purchase.total - data.amount_paid


def create_purchase(db: Session, actor: User, data: PurchaseInput) -> Purchase:
    purchase = Purchase(status=PurchaseStatus.DRAFT, created_by=actor)
    _apply_input(db, purchase, data)
    db.add(purchase)
    _commit(db, purchase)
    return purchase


def update_purchase(db: Session, purchase_id: int, data: PurchaseInput) -> Purchase:
    purchase = get_purchase(db, purchase_id, for_update=True)
    _require_draft(purchase)
    try:
        _apply_input(db, purchase, data)
    except AppError:
        db.rollback()  # discard the lines already changed
        raise
    _commit(db, purchase)
    return purchase


def delete_purchase(db: Session, purchase_id: int) -> None:
    """Discard a draft. It never moved inventory nor took a number, so it leaves no gap."""
    purchase = get_purchase(db, purchase_id, for_update=True)
    _require_draft(purchase)
    db.delete(purchase)
    db.commit()


# --- Confirmation and cancellation ---------------------------------------------------


def _update_supplier_price(db: Session, supplier: Supplier, item: PurchaseItem) -> None:
    """Link the product to the supplier if needed, with the net cost just paid."""
    link = db.scalar(
        select(SupplierProduct).where(
            SupplierProduct.supplier_id == supplier.id,
            SupplierProduct.product_id == item.product_id,
        )
    )
    if link is None:
        link = SupplierProduct(supplier=supplier, product=item.product)
        db.add(link)
    if link.purchase_price != item.net_unit_cost:
        # As in manual edits, the price date changes only with the price.
        link.purchase_price = item.net_unit_cost
        link.price_updated_at = datetime.now(UTC)


def _sorted_items(purchase: Purchase) -> list[PurchaseItem]:
    return sorted(purchase.items, key=lambda item: item.product_id)


def confirm_purchase(db: Session, actor: User, purchase_id: int) -> Purchase:
    """Number the purchase, add its items to stock at their net cost and update the
    supplier's prices, all in one transaction."""
    try:
        purchase = get_purchase(db, purchase_id, for_update=True)
        _require_draft(purchase)
        if not purchase.items:
            raise AppError("La compra no tiene productos.", code="EMPTY_PURCHASE", status_code=422)
        _active_supplier(db, purchase.supplier_id)
        for index, item in enumerate(_sorted_items(purchase)):
            product = get_product(db, item.product_id, for_update=True)
            try:
                # The product may have been deactivated since the draft was saved.
                purchasable_product(db, product.id)
            except AppError as exc:
                raise _line_error(index, exc) from exc
            inventory_service.record_movement(
                db,
                product,
                MovementType.PURCHASE_ENTRY,
                item.quantity,
                actor,
                unit_cost=item.net_unit_cost,
                purchase=purchase,
            )
            _update_supplier_price(db, purchase.supplier, item)
        # Taken last: the sequence row stays locked only for the end of the transaction.
        purchase.number = sequence_service.next_number(db, sequence_service.PURCHASE_SEQUENCE)
        purchase.status = PurchaseStatus.CONFIRMED
        purchase.confirmed_by = actor
        purchase.confirmed_at = func.now()
        db.commit()
    except AppError:
        db.rollback()
        raise
    return purchase


def _latest_purchase_cost(
    db: Session, product_id: int, excluded_purchase_id: int
) -> Decimal | None:
    item = db.scalar(
        select(PurchaseItem)
        .join(PurchaseItem.purchase)
        .where(
            PurchaseItem.product_id == product_id,
            Purchase.status == PurchaseStatus.CONFIRMED,
            Purchase.id != excluded_purchase_id,
        )
        .order_by(Purchase.confirmed_at.desc(), Purchase.id.desc())
        .limit(1)
    )
    return item.net_unit_cost if item is not None else None


def _costs_to_restore(
    db: Session, purchase: Purchase, product_id: int
) -> tuple[Decimal, Decimal] | None:
    """Costs the product had before this purchase entered, when they can be put back exactly:
    the entry is still the product's latest movement and recorded them. `None` otherwise."""
    entry = db.scalar(
        select(InventoryMovement).where(
            InventoryMovement.purchase_id == purchase.id,
            InventoryMovement.product_id == product_id,
            InventoryMovement.movement_type == MovementType.PURCHASE_ENTRY,
        )
    )
    if entry is None or entry.average_cost_before is None or entry.last_cost_before is None:
        return None
    # The product row is locked, so no movement can be added while this runs.
    later = select(InventoryMovement.id).where(
        InventoryMovement.product_id == product_id, InventoryMovement.id > entry.id
    )
    if db.scalar(select(later.exists())):
        return None
    return entry.average_cost_before, entry.last_cost_before


def cancel_purchase(db: Session, actor: User, purchase_id: int, data: PurchaseCancel) -> Purchase:
    """Reverse a confirmed purchase: its units leave at the cost they entered.

    When the purchase is still the product's latest movement, the average and last cost
    return exactly to their values before it. Otherwise the purchase is removed from the
    average with the inverse formula and the last cost returns to the latest other confirmed
    purchase (if any).

    Fails without changes if the units are no longer in stock (unless negative stock is
    allowed). The supplier's prices are catalog data and are not reverted.
    """
    try:
        purchase = get_purchase(db, purchase_id, for_update=True)
        if purchase.status != PurchaseStatus.CONFIRMED:
            raise ConflictError(
                "Solo se pueden anular compras confirmadas. Los borradores se descartan.",
                code="PURCHASE_NOT_CONFIRMED",
            )
        for index, item in enumerate(_sorted_items(purchase)):
            product = get_product(db, item.product_id, for_update=True)
            restore_costs = _costs_to_restore(db, purchase, product.id)
            try:
                inventory_service.record_movement(
                    db,
                    product,
                    MovementType.PURCHASE_CANCELLATION,
                    item.quantity,
                    actor,
                    unit_cost=item.net_unit_cost,
                    reason=data.reason,
                    purchase=purchase,
                    restore_costs=restore_costs,
                )
            except AppError as exc:
                raise _line_error(index, exc) from exc
            if restore_costs is None:
                previous_cost = _latest_purchase_cost(db, product.id, purchase.id)
                if previous_cost is not None:
                    product.last_cost = previous_cost
        purchase.status = PurchaseStatus.CANCELLED
        purchase.cancelled_by = actor
        purchase.cancelled_at = func.now()
        purchase.cancellation_reason = data.reason
        db.commit()
    except AppError:
        db.rollback()
        raise
    return purchase


# --- Cost history --------------------------------------------------------------------


def cost_summary(product: Product) -> CostSummary:
    """Current costs and gross margin (sale price before tax - average cost)."""
    price_before_tax = _money(product.sale_price / (1 + product.tax_rate / HUNDRED))
    margin = price_before_tax - product.average_cost
    return CostSummary(
        average_cost=product.average_cost,
        last_cost=product.last_cost,
        sale_price=product.sale_price,
        sale_price_before_tax=price_before_tax,
        gross_margin=margin,
        gross_margin_percent=_money(margin / price_before_tax * HUNDRED)
        if price_before_tax > 0
        else None,
    )


def _variation_percent(cost: Decimal, previous: Decimal | None) -> Decimal | None:
    if not previous:
        return None
    return _money((cost - previous) / previous * HUNDRED)


def list_cost_history(
    db: Session, product_id: int, params: PageParams
) -> tuple[Product, list[CostHistoryEntry], int]:
    """Net unit cost of each confirmed purchase of a product, newest first, with the
    variation against the previous purchase. Cancelled purchases are left out."""
    product = get_product(db, product_id)
    net_cost = func.round(PurchaseItem.subtotal / PurchaseItem.quantity, 2)
    history = (
        select(
            Purchase.id.label("purchase_id"),
            Purchase.number.label("purchase_number"),
            Purchase.confirmed_at,
            Supplier.id.label("supplier_id"),
            Supplier.name.label("supplier_name"),
            PurchaseItem.quantity,
            net_cost.label("unit_cost"),
            func.lag(net_cost)
            .over(order_by=(Purchase.confirmed_at, Purchase.id))
            .label("previous_unit_cost"),
        )
        .join(PurchaseItem.purchase)
        .join(Purchase.supplier)
        .where(PurchaseItem.product_id == product_id, Purchase.status == PurchaseStatus.CONFIRMED)
        .subquery()
    )
    total = db.scalar(select(func.count()).select_from(history)) or 0
    rows = db.execute(
        select(history)
        .order_by(history.c.confirmed_at.desc(), history.c.purchase_id.desc())
        .offset(params.offset)
        .limit(params.size)
    ).all()
    entries = [
        CostHistoryEntry(
            purchase_id=row.purchase_id,
            purchase_number=row.purchase_number,
            supplier=CostHistorySupplier(id=row.supplier_id, name=row.supplier_name),
            confirmed_at=row.confirmed_at,
            quantity=row.quantity,
            unit_cost=row.unit_cost,
            previous_unit_cost=row.previous_unit_cost,
            variation_percent=_variation_percent(row.unit_cost, row.previous_unit_cost),
        )
        for row in rows
    ]
    return product, entries, total
