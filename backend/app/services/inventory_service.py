"""Inventory: stock movements, manual adjustments and replenishment suggestions.

`record_movement` is the only code that changes a product's stock and cost. Purchases and
sales reuse it inside their own transaction, so it never commits.
"""

from collections.abc import Sequence
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import case, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.core.errors import AppError, ConflictError
from app.models import (
    COUNTABLE_UNITS,
    InventoryMovement,
    MovementType,
    Product,
    ProductType,
    Purchase,
    StockStatus,
    User,
)
from app.schemas.common import PageParams
from app.schemas.inventory import AdjustmentCreate, AdjustmentDirection
from app.services.product_service import get_product, matches_search
from app.services.query import filter_date_range, paginate

CENT = Decimal("0.01")

# Most urgent first in the replenishment list.
STOCK_STATUS_PRIORITY = {
    StockStatus.OUT_OF_STOCK.value: 0,
    StockStatus.CRITICAL.value: 1,
    StockStatus.LOW.value: 2,
}


def weighted_average_cost(
    stock: Decimal, average_cost: Decimal, quantity: Decimal, unit_cost: Decimal
) -> Decimal:
    """New average cost after `quantity` units enter at `unit_cost`, rounded to cents.

    With no positive stock the previous average is meaningless, so the entry cost is used.
    """
    if stock <= 0:
        return unit_cost
    total_cost = stock * average_cost + quantity * unit_cost
    return (total_cost / (stock + quantity)).quantize(CENT, rounding=ROUND_HALF_UP)


def reversed_average_cost(
    stock: Decimal, average_cost: Decimal, quantity: Decimal, unit_cost: Decimal
) -> Decimal:
    """Average cost after removing `quantity` units that entered at `unit_cost` (the inverse
    of `weighted_average_cost`), rounded to cents.

    The current average is kept when no stock remains, or when the stock value is lower than
    the value removed (units were sold in between at a lower average).
    """
    remaining = stock - quantity
    remaining_value = stock * average_cost - quantity * unit_cost
    if remaining <= 0 or remaining_value < 0:
        return average_cost
    return (remaining_value / remaining).quantize(CENT, rounding=ROUND_HALF_UP)


def validate_quantity(product: Product, quantity: Decimal) -> None:
    if product.type == ProductType.SERVICE:
        raise AppError(
            "Los servicios no manejan inventario.",
            code="SERVICE_WITHOUT_INVENTORY",
            status_code=422,
        )
    if product.unit_of_measure in COUNTABLE_UNITS and quantity != quantity.to_integral_value():
        raise AppError(
            "La cantidad debe ser un número entero para esta unidad de medida.",
            code="FRACTIONAL_QUANTITY",
            status_code=422,
        )


def record_movement(
    db: Session,
    product: Product,
    movement_type: MovementType,
    quantity: Decimal,
    user: User,
    *,
    unit_cost: Decimal | None = None,
    reason: str | None = None,
    purchase: Purchase | None = None,
) -> InventoryMovement:
    """Apply a stock movement to `product` and record it, without committing.

    `product` must be locked by the caller (`get_product(..., for_update=True)`) so concurrent
    movements cannot read the same stock. Entries with `unit_cost` recalculate the weighted
    average and the last cost; entries without it use the current average. Exits use the
    current average, except reversals of an entry (`unit_cost` given), which leave at that
    cost and remove it from the average.
    """
    validate_quantity(product, quantity)
    stock_before = product.current_stock

    if movement_type.is_inbound:
        stock_after = stock_before + quantity
        if unit_cost is not None:
            product.average_cost = weighted_average_cost(
                stock_before, product.average_cost, quantity, unit_cost
            )
            product.last_cost = unit_cost
        movement_cost = unit_cost if unit_cost is not None else product.average_cost
    else:
        stock_after = stock_before - quantity
        if stock_after < 0 and not get_settings().allow_negative_stock:
            raise ConflictError(
                f"Stock insuficiente: disponible {stock_before.normalize():f}, "
                f"solicitado {quantity.normalize():f}.",
                code="INSUFFICIENT_STOCK",
            )
        if unit_cost is not None:
            product.average_cost = reversed_average_cost(
                stock_before, product.average_cost, quantity, unit_cost
            )
        movement_cost = unit_cost if unit_cost is not None else product.average_cost

    product.current_stock = stock_after
    movement = InventoryMovement(
        product=product,
        movement_type=movement_type,
        quantity=quantity,
        stock_before=stock_before,
        stock_after=stock_after,
        unit_cost=movement_cost,
        average_cost_after=product.average_cost,
        reason=reason,
        purchase=purchase,
        user=user,
    )
    db.add(movement)
    return movement


def create_adjustment(db: Session, actor: User, data: AdjustmentCreate) -> InventoryMovement:
    product = get_product(db, data.product_id, for_update=True)
    movement_type = (
        MovementType.ADJUSTMENT_IN
        if data.direction == AdjustmentDirection.IN
        else MovementType.ADJUSTMENT_OUT
    )
    movement = record_movement(
        db,
        product,
        movement_type,
        data.quantity,
        actor,
        unit_cost=data.unit_cost,
        reason=data.reason,
    )
    db.commit()
    return movement


def list_movements(
    db: Session,
    params: PageParams,
    *,
    product_id: int | None = None,
    movement_type: MovementType | None = None,
    user_id: int | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> tuple[Sequence[InventoryMovement], int]:
    stmt = filter_date_range(
        select(InventoryMovement), InventoryMovement.created_at, date_from, date_to
    )
    if product_id is not None:
        stmt = stmt.where(InventoryMovement.product_id == product_id)
    if movement_type is not None:
        stmt = stmt.where(InventoryMovement.movement_type == movement_type)
    if user_id is not None:
        stmt = stmt.where(InventoryMovement.user_id == user_id)
    stmt = stmt.options(
        selectinload(InventoryMovement.product),
        selectinload(InventoryMovement.purchase),
        selectinload(InventoryMovement.user),
    ).order_by(InventoryMovement.created_at.desc(), InventoryMovement.id.desc())
    return paginate(db, stmt, params)


def list_replenishment(
    db: Session,
    params: PageParams,
    *,
    search: str | None = None,
    category_id: int | None = None,
    stock_status: StockStatus | None = None,
) -> tuple[Sequence[Product], int]:
    """Active physical products at or below their reorder point, most urgent first."""
    stmt = select(Product).where(
        Product.type == ProductType.PRODUCT,
        Product.is_active.is_(True),
        Product.current_stock <= Product.reorder_point,
    )
    if search and search.strip():
        stmt = stmt.where(matches_search(search.strip()))
    if category_id is not None:
        stmt = stmt.where(Product.category_id == category_id)
    if stock_status is not None:
        stmt = stmt.where(Product.stock_status == stock_status)
    priority = case(
        STOCK_STATUS_PRIORITY, value=Product.stock_status, else_=len(STOCK_STATUS_PRIORITY)
    )
    stmt = stmt.options(selectinload(Product.category)).order_by(priority, Product.name, Product.id)
    return paginate(db, stmt, params)
