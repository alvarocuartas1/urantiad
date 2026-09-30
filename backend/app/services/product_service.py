"""Product catalog: products and services, stock levels and sale price history.

Stock and the cost of physical products are not editable here: they change only through
inventory movements (adjustments and purchases). Services have no stock and a manual cost.
"""

from collections.abc import Sequence
from decimal import Decimal
from typing import Any

from sqlalchemy import ColumnElement, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.errors import AppError, ConflictError, NotFoundError
from app.models import AuditAction, Product, ProductPriceHistory, ProductType, StockStatus, User
from app.schemas.common import PageParams
from app.schemas.product import ProductCreate, ProductUpdate
from app.services import audit_service
from app.services.category_service import get_active_category
from app.services.query import contains_pattern, paginate, violated_constraint

STOCK_LEVEL_FIELDS = ("min_stock", "reorder_point", "target_stock")

CONFLICTS_BY_CONSTRAINT = {
    "uq_products_sku": ("El SKU ya existe.", "SKU_TAKEN"),
    "uq_products_barcode": (
        "El código de barras ya está asignado a otro producto.",
        "BARCODE_TAKEN",
    ),
}


# Stock and the costs of physical products are audited through their inventory movements.
AUDITED_FIELDS = (
    "type",
    "sku",
    "barcode",
    "name",
    "description",
    "unit_of_measure",
    "tax_rate",
    "sale_price",
    "min_stock",
    "reorder_point",
    "target_stock",
    "is_active",
)


def audit_label(product: Product) -> str:
    return f"{product.sku} · {product.name}"


def _audit_values(product: Product) -> audit_service.Values:
    values = audit_service.snapshot(product, AUDITED_FIELDS)
    values["category"] = product.category.name
    if product.type == ProductType.SERVICE:
        values["cost"] = audit_service.json_value(product.average_cost)
    return values


def _flush(db: Session) -> None:
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        conflict = CONFLICTS_BY_CONSTRAINT.get(violated_constraint(exc) or "")
        if conflict is None:
            raise
        detail, code = conflict
        raise ConflictError(detail, code=code) from exc


def _validate_stock_levels(product_type: str, levels: dict[str, Decimal]) -> None:
    if product_type == ProductType.SERVICE:
        if any(value != 0 for value in levels.values()):
            raise AppError(
                "Los servicios no manejan inventario: sus niveles de stock deben ser 0.",
                code="SERVICE_STOCK_LEVELS",
                status_code=422,
            )
        return
    if not levels["min_stock"] <= levels["reorder_point"] <= levels["target_stock"]:
        raise AppError(
            "Los niveles de stock deben cumplir: mínimo ≤ punto de reorden ≤ stock objetivo.",
            code="INVALID_STOCK_LEVELS",
            status_code=422,
        )


def _reject_product_cost() -> AppError:
    return AppError(
        "El costo de un producto se actualiza con compras y ajustes de inventario.",
        code="PRODUCT_COST_NOT_EDITABLE",
        status_code=422,
    )


def matches_search(search: str) -> ColumnElement[bool]:
    """Condition matching products whose name, SKU or barcode contains `search`."""
    pattern = contains_pattern(search)
    return or_(
        Product.name.ilike(pattern),
        Product.sku.ilike(pattern),
        Product.barcode.ilike(pattern),
    )


def list_products(
    db: Session,
    params: PageParams,
    *,
    search: str | None = None,
    category_id: int | None = None,
    product_type: ProductType | None = None,
    is_active: bool | None = None,
    stock_status: StockStatus | None = None,
) -> tuple[Sequence[Product], int]:
    stmt = select(Product)
    if search and search.strip():
        stmt = stmt.where(matches_search(search.strip()))
    if category_id is not None:
        stmt = stmt.where(Product.category_id == category_id)
    if product_type is not None:
        stmt = stmt.where(Product.type == product_type)
    if is_active is not None:
        stmt = stmt.where(Product.is_active == is_active)
    if stock_status is not None:
        # Services have a NULL status, so this filter only returns physical products.
        stmt = stmt.where(Product.stock_status == stock_status)
    stmt = stmt.options(selectinload(Product.category)).order_by(Product.name, Product.id)
    return paginate(db, stmt, params)


def get_product(db: Session, product_id: int, *, for_update: bool = False) -> Product:
    stmt = select(Product).options(selectinload(Product.category)).where(Product.id == product_id)
    if for_update:
        # populate_existing refreshes an already loaded instance with the locked row's values.
        stmt = stmt.with_for_update(of=Product).execution_options(populate_existing=True)
    product = db.scalar(stmt)
    if product is None:
        raise NotFoundError("El producto no existe.", code="PRODUCT_NOT_FOUND")
    return product


def create_product(db: Session, actor: User, data: ProductCreate) -> Product:
    category = get_active_category(db, data.category_id)
    _validate_stock_levels(data.type, {field: getattr(data, field) for field in STOCK_LEVEL_FIELDS})
    if data.type == ProductType.PRODUCT and data.cost is not None:
        raise _reject_product_cost()

    cost = data.cost or Decimal(0)
    product = Product(
        **data.model_dump(exclude={"category_id", "cost"}),
        category=category,
        average_cost=cost,
        last_cost=cost,
    )
    db.add(product)
    db.add(
        ProductPriceHistory(
            product=product, old_price=None, new_price=data.sale_price, changed_by_id=actor.id
        )
    )
    _flush(db)
    audit_service.record(
        db,
        actor,
        AuditAction.PRODUCT_CREATE,
        product.id,
        audit_label(product),
        new=_audit_values(product),
    )
    db.commit()
    return product


def update_product(db: Session, actor: User, product_id: int, data: ProductUpdate) -> Product:
    product = get_product(db, product_id, for_update=True)
    before = _audit_values(product)
    changes: dict[str, Any] = data.changes()

    if "category_id" in changes:
        category_id = changes.pop("category_id")
        # Keeping an already inactive category is allowed; moving into one is not.
        if category_id != product.category_id:
            product.category = get_active_category(db, category_id)

    if "cost" in changes:
        if product.type == ProductType.PRODUCT:
            raise _reject_product_cost()
        product.average_cost = product.last_cost = changes.pop("cost")

    if any(field in changes for field in STOCK_LEVEL_FIELDS):
        levels = {name: changes.get(name, getattr(product, name)) for name in STOCK_LEVEL_FIELDS}
        _validate_stock_levels(product.type, levels)

    new_price = changes.get("sale_price")
    if new_price is not None and new_price != product.sale_price:
        db.add(
            ProductPriceHistory(
                product=product,
                old_price=product.sale_price,
                new_price=new_price,
                changed_by_id=actor.id,
            )
        )

    for field, value in changes.items():
        setattr(product, field, value)
    _flush(db)
    audit_service.record_changes(
        db,
        actor,
        AuditAction.PRODUCT_UPDATE,
        product.id,
        audit_label(product),
        before,
        _audit_values(product),
    )
    db.commit()
    return product


def list_price_history(
    db: Session, product_id: int, params: PageParams
) -> tuple[Sequence[ProductPriceHistory], int]:
    get_product(db, product_id)
    stmt = (
        select(ProductPriceHistory)
        .where(ProductPriceHistory.product_id == product_id)
        .options(selectinload(ProductPriceHistory.changed_by))
        .order_by(ProductPriceHistory.changed_at.desc(), ProductPriceHistory.id.desc())
    )
    return paginate(db, stmt, params)
